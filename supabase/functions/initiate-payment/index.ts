import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { maskPhone, ServiceUnavailableError, fetchWithRetry } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ---- Helpers Fedapay (inclus directement ici, pas d'import externe) ----

const FEDAPAY_BASE_URL = Deno.env.get("FEDAPAY_BASE_URL") || "https://api.fedapay.com/v1";
const IS_SANDBOX = FEDAPAY_BASE_URL.includes("sandbox");

// En sandbox, Fedapay impose un mode de test unique ("momo_test") pour tous les
// opérateurs, avec des numéros de test dédiés (confirmé par leur support le 13/07/2026) —
// pas les vrais codes mtn_open/moov, qui ne s'utilisent qu'en production.
const FEDAPAY_MODES: Record<string, string> = IS_SANDBOX
  ? { mtn: "momo_test", moov: "momo_test", celtiis: "momo_test" }
  : {
      // Mapping strict et hardcodé pour le LIVE (Ignore les variables d'environnement qui pourraient être erronées)
      mtn: "mtn_open",
      moov: "moov",
      celtiis: "sbin",
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
  firstName?: string;
  lastName?: string;
  phoneNumber: string;
  callbackUrl?: string;
}): Promise<{ id: string | number; raw: any }> {
  const fedapayKey = Deno.env.get("FEDAPAY_SECRET_KEY");
  if (!fedapayKey) throw new Error("FEDAPAY_SECRET_KEY non configurée");

  const res = await fetchWithRetry(
    `${FEDAPAY_BASE_URL}/transactions`,
    {
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
          firstname: params.firstName || "Client",
          lastname: params.lastName || "ImoFlex",
          email: params.email,
          phone_number: { number: params.phoneNumber, country: "BJ" },
        },
      }),
    },
    { maxRetries: 3, timeoutMs: 10000, retryDelayMs: 500 }
  );

  const json = await parseFedapayResponse(res);
  if (!res.ok) {
    const errorDetails = JSON.stringify(json);
    console.error("FedaPay Error Details:", errorDetails);
    throw new Error(`La création de la transaction a échoué. Détails: ${json?.message || errorDetails}`);
  }

  const tx = extractResource(json, "transaction");
  if (!tx?.id) throw new Error("Réponse Fedapay inattendue (pas d'id de transaction)");

  return { id: tx.id, raw: json };
}

async function generateToken(
  transactionId: string | number
): Promise<{ token: string; paymentUrl?: string }> {
  const fedapayKey = Deno.env.get("FEDAPAY_SECRET_KEY")!;

  const res = await fetchWithRetry(
    `${FEDAPAY_BASE_URL}/transactions/${transactionId}/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${fedapayKey}`,
      },
    },
    { maxRetries: 3, timeoutMs: 10000, retryDelayMs: 500 }
  );

  const json = await parseFedapayResponse(res);
  if (!res.ok) {
    throw new Error(json?.message || `Erreur Fedapay (génération token): HTTP ${res.status}`);
  }

  // Contrairement à /transactions (enveloppé sous "v1/transaction"), cet endpoint
  // renvoie directement { token, url } à plat — confirmé par le schéma OpenAPI
  // officiel de Fedapay. L'ancien code utilisait extractResource() ici par erreur,
  // ce qui retournait la chaîne du token elle-même au lieu d'un objet, et donc
  // .token dessus valait undefined.
  const token = json?.token;
  const paymentUrl = json?.url;

  if (!token) {
    throw new Error("Réponse Fedapay inattendue (pas de token reçu): " + JSON.stringify(json));
  }

  return { token, paymentUrl };
}

async function sendDirectPush(mode: string, token: string): Promise<any> {
  const fedapayKey = Deno.env.get("FEDAPAY_SECRET_KEY")!;

  const res = await fetchWithRetry(
    `${FEDAPAY_BASE_URL}/${mode}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${fedapayKey}`,
      },
      body: JSON.stringify({
        token
      }),
    },
    { maxRetries: 1, timeoutMs: 90000, retryDelayMs: 0 }
  );

  const json = await parseFedapayResponse(res);
  if (!res.ok) {
    const errorDetails = JSON.stringify(json);
    console.error("FedaPay Push Error Details:", errorDetails);
    throw new Error(`Le Push USSD a échoué. Détails: ${json?.message || errorDetails}`);
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

    // ---- Audit Trail : capture IP + User-Agent ----
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0].trim()
      || req.headers.get("x-real-ip")
      || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";
    console.log(`[audit] initiate-payment uid=${tenant_id} ip=${clientIp} ua=${userAgent.slice(0, 80)}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ---- Rate Limiting : max 5 initiations de paiement par minute ----
    const { data: allowed, error: rlError } = await supabase.rpc("check_rate_limit", {
      p_user_id: tenant_id,
      p_endpoint: "initiate-payment",
      p_max_requests: 5,
      p_window_seconds: 60,
    });
    if (rlError) console.error("Rate limit RPC error:", rlError.message);
    if (allowed === false) {
      return new Response(
        JSON.stringify({ error: "Trop de requêtes. Veuillez patienter avant de réessayer (max 5/min)." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } }
      );
    }

    const body = await req.json();
    const { amount, operator, rent_period_id, phone_number, idempotency_key } = body;

    if (idempotency_key) {
      const { data: existingPayment } = await supabase
        .from("payments")
        .select("id, fedapay_transaction_id, status")
        .eq("idempotency_key", idempotency_key)
        .maybeSingle();

      if (existingPayment) {
        return new Response(
          JSON.stringify({
            payment_id: existingPayment.id,
            fedapay_transaction_id: existingPayment.fedapay_transaction_id,
            status: existingPayment.status,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

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

    if (amount > 300000) {
      return new Response(
        JSON.stringify({ error: "Le plafond maximal par transaction est de 300 000 FCFA." }),
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
        firstName: authData.user.user_metadata?.first_name || authData.user.user_metadata?.prenom,
        lastName: authData.user.user_metadata?.last_name || authData.user.user_metadata?.nom,
        phoneNumber: phone_number,
        callbackUrl,
      });

      const { token, paymentUrl: url } = await generateToken(transactionId);
      fedapayTxId = String(transactionId);

      if (operator === "mtn" || operator === "moov" || operator === "celtiis") {
        await sendDirectPush(FEDAPAY_MODES[operator], token);
      } else {
        paymentUrl = url;
      }
    } catch (fedapayErr: unknown) {
      const isUnavailable = fedapayErr instanceof ServiceUnavailableError;
      const msg = fedapayErr instanceof Error ? fedapayErr.message : "Erreur Fedapay";
      console.error(`[circuit-breaker] initiate-payment failed (phone=${maskPhone(phone_number)}):`, msg);
      return new Response(
        JSON.stringify({ error: msg }),
        { status: isUnavailable ? 503 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        idempotency_key: idempotency_key || null,
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
    const isUnavailable = err instanceof ServiceUnavailableError;
    const message = err instanceof Error ? err.message : "Erreur interne";
    return new Response(
      JSON.stringify({ error: message }),
      { status: isUnavailable ? 503 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
