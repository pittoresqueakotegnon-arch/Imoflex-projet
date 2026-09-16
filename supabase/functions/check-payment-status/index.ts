import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchWithRetry } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const FEDAPAY_BASE_URL = Deno.env.get("FEDAPAY_BASE_URL") || "https://api.fedapay.com/v1";

/**
 * check-payment-status
 *
 * Permet à un locataire de forcer la synchronisation du statut d'un paiement
 * en interrogeant directement l'API FedaPay. Utile quand le webhook FedaPay
 * est en retard ou a été perdu.
 *
 * - Vérifie l'authentification du locataire.
 * - Vérifie que le paiement appartient bien au locataire appelant.
 * - Interroge GET /transactions/:fedapay_id sur l'API FedaPay.
 * - Si FedaPay retourne "approved", appelle le RPC process_payment_webhook
 *   exactement comme le webhook normal (idempotent).
 * - Retourne le statut final du paiement.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // ── Authentification ──────────────────────────────────────────────────────
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
    const callerId = authData.user.id;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Rate limiting : 3 vérifications par minute par utilisateur ────────────
    const { data: allowed } = await supabase.rpc("check_rate_limit", {
      p_user_id: callerId,
      p_endpoint: "check-payment-status",
      p_max_requests: 3,
      p_window_seconds: 60,
    });
    if (allowed === false) {
      return new Response(
        JSON.stringify({ error: "Trop de vérifications. Attendez une minute avant de réessayer." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } }
      );
    }

    // ── Lecture du payment_id ─────────────────────────────────────────────────
    const body = await req.json();
    const paymentId = body?.payment_id;

    if (!paymentId || typeof paymentId !== "string") {
      return new Response(
        JSON.stringify({ error: "payment_id requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Vérification ownership : le paiement doit appartenir au locataire ─────
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("id, tenant_id, fedapay_transaction_id, status, amount")
      .eq("id", paymentId)
      .maybeSingle();

    if (paymentError || !payment) {
      return new Response(
        JSON.stringify({ error: "Paiement introuvable" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (payment.tenant_id !== callerId) {
      return new Response(
        JSON.stringify({ error: "Accès non autorisé" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Si le paiement est déjà finalisé, on retourne directement ────────────
    if (payment.status === "valide" || payment.status === "echoue") {
      return new Response(
        JSON.stringify({ status: payment.status, already_final: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!payment.fedapay_transaction_id) {
      return new Response(
        JSON.stringify({ error: "Aucun ID de transaction FedaPay associé" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Interrogation directe de l'API FedaPay ────────────────────────────────
    const fedapayKey = Deno.env.get("FEDAPAY_SECRET_KEY");
    if (!fedapayKey) {
      return new Response(
        JSON.stringify({ error: "Configuration serveur manquante" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fedapayRes = await fetchWithRetry(
      `${FEDAPAY_BASE_URL}/transactions/${payment.fedapay_transaction_id}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${fedapayKey}`,
        },
      },
      { maxRetries: 2, timeoutMs: 10000, retryDelayMs: 500 }
    );

    if (!fedapayRes.ok) {
      console.error(`[check-payment-status] FedaPay GET failed: HTTP ${fedapayRes.status}`);
      return new Response(
        JSON.stringify({ error: "Impossible de contacter FedaPay. Réessayez dans quelques instants." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fedapayJson = await fedapayRes.json();
    // FedaPay enveloppe la ressource sous "v1/transaction"
    const tx = fedapayJson?.["v1/transaction"] ?? fedapayJson?.transaction ?? fedapayJson;
    const fedapayStatus: string = tx?.status ?? "";

    console.log(`[check-payment-status] payment=${paymentId} fedapay_status=${fedapayStatus}`);

    // ── Synchronisation via le RPC atomique ───────────────────────────────────
    // On mappe le statut FedaPay vers les event types utilisés par le webhook.
    let eventType: string | null = null;
    if (fedapayStatus === "approved") {
      eventType = "transaction.approved";
    } else if (["declined", "canceled", "failed"].includes(fedapayStatus)) {
      eventType = "transaction.declined";
    }

    if (eventType) {
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        "process_payment_webhook",
        {
          p_fedapay_tx_id: payment.fedapay_transaction_id,
          p_event_type: eventType,
        }
      );

      if (rpcError) {
        console.error("[check-payment-status] RPC error:", rpcError);
        return new Response(
          JSON.stringify({ error: "Erreur lors de la synchronisation" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          status: rpcResult?.status === "already_processed"
            ? payment.status
            : rpcResult?.status ?? payment.status,
          synced: true,
          fedapay_status: fedapayStatus,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Statut encore en cours côté FedaPay (pending, processing…)
    return new Response(
      JSON.stringify({
        status: "en_attente",
        synced: false,
        fedapay_status: fedapayStatus,
        message: "Le paiement est toujours en cours de traitement côté Mobile Money.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur interne";
    console.error("[check-payment-status] Unhandled error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
