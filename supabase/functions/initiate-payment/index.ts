import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createTransaction, generateToken, sendDirectPush, FEDAPAY_MODES } from "../_shared/fedapay.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // ---- Auth: identify the REAL caller from the JWT, never trust the body ----
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
    const tenant_id = authData.user.id; // <-- source de vérité, jamais body.tenant_id

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Les appels Fedapay sont centralisés dans _shared/fedapay.ts

    const body = await req.json();
    const { amount, operator, rent_period_id, phone_number } = body;
    // NB: "amount" est le montant EXACT que le locataire veut verser.
    // Aucune majoration de commission ici : la commission de 5% est prélevée
    // plus tard sur la part reversée au propriétaire, pas sur ce que paie le locataire.

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

    // Verify rent_period belongs to the AUTHENTICATED tenant
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

    // ---- Créer la transaction chez Fedapay et obtenir son identifiant réel ----
    // C'est CET identifiant (pas un ID généré localement) que le webhook utilisera
    // pour retrouver le paiement quand Fedapay confirmera la transaction.
    let fedapayTxId: string;
    let paymentUrl: string | undefined;

    try {
      const { id: transactionId } = await createTransaction({
        amount,
        description: `Loyer ImoFlex - période ${rent_period_id}`,
        email: authData.user.email || `${tenant_id}@imoflex.app`,
        phoneNumber: phone_number,
      });

      const { token, paymentUrl: url } = await generateToken(transactionId);
      fedapayTxId = String(transactionId);

      if (operator === "mtn" || operator === "moov") {
        // Push USSD direct — l'utilisateur reçoit la demande de confirmation sur son téléphone
        await sendDirectPush(FEDAPAY_MODES[operator], token, phone_number);
      } else {
        // Celtiis Cash : pas de push direct supporté par Fedapay (à date), on redirige
        // le client vers la page de paiement sécurisée.
        paymentUrl = url;
      }
    } catch (fedapayErr: unknown) {
      const msg = fedapayErr instanceof Error ? fedapayErr.message : "Erreur Fedapay";
      return new Response(
        JSON.stringify({ error: msg }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create payment record in DB with status 'en_attente'
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
        payment_url: paymentUrl, // présent uniquement pour Celtiis (flux redirection)
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
