import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ---- Helpers Fedapay (inclus directement ici, pas d'import externe) ----

const FEDAPAY_BASE_URL = Deno.env.get("FEDAPAY_BASE_URL") || "https://sandbox-api.fedapay.com/v1";
const IS_SANDBOX = FEDAPAY_BASE_URL.includes("sandbox");

// En sandbox, Fedapay impose un mode de test unique ("momo_test") pour tous les
// opérateurs, avec des numéros de test dédiés (confirmé par leur support le 13/07/2026) —
// pas les vrais codes mtn_open/moov, qui ne s'utilisent qu'en production.
const FEDAPAY_MODES: Record<string, string> = IS_SANDBOX
  ? { mtn: "momo_test", moov: "momo_test" }
  : {
      mtn: Deno.env.get("FEDAPAY_MODE_MTN") || "mtn_open",
      moov: Deno.env.get("FEDAPAY_MODE_MOOV") || "moov",
    };

function extractResource(json: any, singularKey: string): any {
  return json?.[`v1/${singularKey}`] ?? json?.[singularKey] ?? json;
}

async function parseFedapayResponse(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) {
    throw new Error(`Réponse Fedapay vide (HTTP ${res.status})`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Réponse Fedapay illisible (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
}

async function createTransaction(params: {
  amount: number;
  description: string;
  email: string;
  phoneNumber: string;
  callbackUrl?: string;
}): Promise<{ id: string | number; raw: any }> {
  const fedapayKey = Deno.env.get("FEDAPAY_SECRET_KEY");
  if (!fedapayKey) throw new Error("FEDAPAY_SECRET_KEY non configurée");

  const res = await fetch(`${FEDAPAY_BASE_URL}/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${fedapayKey}`,
    },
    body: JSON.stringify({
      description: params.description,
      amount: params.amount,
      currency: { iso: "XOF" },
      callback_url: params.callbackUrl,
      customer: {
        email: params.email,
        phone_number: { number: params.phoneNumber, country: "BJ" },
      },
    }),
  });

  const json = await parseFedapayResponse(res);
  if (!res.ok) {
    throw new Error(json?.message || `Erreur Fedapay (création transaction): HTTP ${res.status}`);
  }

  const tx = extractResource(json, "transaction");
  if (!tx?.id) throw new Error("Réponse Fedapay inattendue (pas d'id de transaction)");

  return { id: tx.id, raw: json };
}

async function generateToken(
  transactionId: string | number
): Promise<{ token: string; paymentUrl?: string }> {
  const fedapayKey = Deno.env.get("FEDAPAY_SECRET_KEY")!;

  const res = await fetch(`${FEDAPAY_BASE_URL}/transactions/${transactionId}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${fedapayKey}`,
    },
  });

  const json = await parseFedapayResponse(res);
  if (!res.ok) {
    throw new Error(json?.message || `Erreur Fedapay (génération token): HTTP ${res.status}`);
  }

  const tokenData = extractResource(json, "token");
  return { token: tokenData.token, paymentUrl: tokenData.url };
}

async function sendDirectPush(mode: string, token: string, phoneNumber: string): Promise<any> {
  const fedapayKey = Deno.env.get("FEDAPAY_SECRET_KEY")!;

  const res = await fetch(`${FEDAPAY_BASE_URL}/${mode}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${fedapayKey}`,
    },
    body: JSON.stringify({
      token,
      phone_number: { number: phoneNumber, country: "BJ" },
    }),
  });

  const json = await parseFedapayResponse(res);
  if (!res.ok) {
    throw new Error(json?.message || `Erreur Fedapay (push ${mode}): HTTP ${res.status}`);
  }
  return json;
}

// ---- Fonction principale ----

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );
    const { data: authData, error: authError } = await anonClient.auth.getUser(jwt);

    if (authError || !authData?.user) {
      return new Response(
        JSON.stringify({ error: "Non authentifié" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const tenant_id = authData.user.id;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { amount, operator, rent_period_id, phone_number } = body;

    if (!amount || !operator || !rent_period_id || !phone_number) {
      return new Response(
        JSON.stringify({ error: "Paramètres manquants" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (amount < 100) {
      return new Response(
        JSON.stringify({ error: "Montant minimum: 100 FCFA" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: rentPeriod, error: rpError } = await supabase
      .from("rent_periods")
      .select("*, leases!inner(tenant_id)")
      .eq("id", rent_period_id)
      .maybeSingle();

    if (rpError || !rentPeriod) {
      return new Response(
        JSON.stringify({ error: "Période de loyer introuvable" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (rentPeriod.leases.tenant_id !== tenant_id) {
      return new Response(
        JSON.stringify({ error: "Accès non autorisé" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let fedapayTxId: string;
    let paymentUrl: string | undefined;

    try {
      const callbackUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/fedapay-webhook`;
      const { id: transactionId } = await createTransaction({
        amount,
        description: `Loyer ImoFlex - période ${rent_period_id}`,
        email: authData.user.email || `${tenant_id}@imoflex.app`,
        phoneNumber: phone_number,
        callbackUrl,
      });

      const { token, paymentUrl: url } = await generateToken(transactionId);
      fedapayTxId = String(transactionId);

      if (operator === "mtn" || operator === "moov") {
        await sendDirectPush(FEDAPAY_MODES[operator], token, phone_number);
      } else {
        paymentUrl = url;
      }
    } catch (fedapayErr: unknown) {
      const msg = fedapayErr instanceof Error ? fedapayErr.message : "Erreur Fedapay";
      return new Response(
        JSON.stringify({ error: msg }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        rent_period_id,
        tenant_id,
        amount,
        payment_method: "mobile_money",
        operator,
        status: "en_attente",
        fedapay_transaction_id: fedapayTxId,
      })
      .select()
      .single();

    if (paymentError) {
      return new Response(
        JSON.stringify({ error: paymentError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        payment_id: payment.id,
        fedapay_transaction_id: fedapayTxId,
        status: "en_attente",
        payment_url: paymentUrl,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur interne";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
