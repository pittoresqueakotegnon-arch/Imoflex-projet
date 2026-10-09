import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod";
import { maskPhone, fetchWithRetry } from "../_shared/security.ts";
import { getFedapayBaseUrl, startPayout, unwrapPayout } from "../_shared/payouts.ts";

const withdrawalSchema = z.object({
  wallet_id: z.string().uuid("ID de wallet invalide"),
  authorization_id: z.string().uuid("ID d'autorisation invalide"),
  pin: z.string().length(4, "Le PIN doit contenir 4 chiffres").regex(/^[0-9]{4}$/, "Le PIN ne doit contenir que des chiffres"),
  idempotency_key: z.string().uuid("Clé d'idempotence invalide"),
});

type CreatedWithdrawal = {
  withdrawal_id: string | null;
  withdrawal_status: "en_traitement" | "complete" | "echoue" | null;
  already_exists: boolean;
  error_code: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Méthode non autorisée" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "").trim();
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data: authData, error: authError } = await anonClient.auth.getUser(jwt);
    if (authError || !authData?.user) return jsonResponse({ error: "Non authentifié" }, 401);

    const parseResult = withdrawalSchema.safeParse(await req.json());
    if (!parseResult.success) {
      return jsonResponse(
        { error: "Données invalides", details: parseResult.error.errors.map((error) => error.message).join(", ") },
        400,
      );
    }

    const ownerId = authData.user.id;
    const { wallet_id: walletId, authorization_id, pin, idempotency_key: idempotencyKey } = parseResult.data;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: allowed, error: rateLimitError } = await supabase.rpc("check_rate_limit", {
      p_user_id: ownerId,
      p_endpoint: "request-withdrawal",
      p_max_requests: 3,
      p_window_seconds: 60,
    });
    if (rateLimitError || allowed === false) {
      return jsonResponse({ error: "Trop de demandes de retrait. Veuillez patienter avant de réessayer." }, 429);
    }

    // La fonction SQL n'est plus exécutable par les utilisateurs : l'identité vient du jeton vérifié ci-dessus.
    const { data: createdRows, error: creationError } = await supabase.rpc("execute_authorized_withdrawal", {
      p_user_id: ownerId,
      p_auth_id: authorization_id,
      p_pin: pin,
      p_wallet_id: walletId,
      p_idempotency_key: idempotencyKey,
    });

    if (creationError) {
      const isConflict = creationError.message.includes("déjà en cours") || creationError.message.includes("Solde insuffisant");
      return jsonResponse({ error: creationError.message }, isConflict ? 409 : 400);
    }

    const withdrawal = (createdRows?.[0] ?? null) as CreatedWithdrawal | null;

    if (withdrawal?.error_code === "pin_incorrect") {
      return jsonResponse({ error: "Code de retrait incorrect", code: "pin_incorrect" }, 400);
    }
    if (withdrawal?.error_code === "pin_locked") {
      return jsonResponse({
        error: "Retraits temporairement bloqués après plusieurs codes incorrects. Réessayez dans 15 minutes.",
        code: "pin_locked",
      }, 429);
    }
    if (!withdrawal?.withdrawal_id) return jsonResponse({ error: "Impossible de créer le retrait" }, 500);

    if (withdrawal.already_exists) {
      if (withdrawal.withdrawal_status === "echoue") {
        return jsonResponse({ error: "Cette tentative a échoué. Relancez la demande." }, 409);
      }
      return jsonResponse({
        withdrawal_id: withdrawal.withdrawal_id,
        status: withdrawal.withdrawal_status,
        message: "Cette demande est déjà en cours de traitement.",
      });
    }

    const { data: withdrawalData } = await supabase
      .from("withdrawals")
      .select("amount, operator, destination_phone")
      .eq("id", withdrawal.withdrawal_id)
      .single();
    if (!withdrawalData) return jsonResponse({ error: "Détails introuvables" }, 500);
    const { amount, operator, destination_phone: destinationPhone } = withdrawalData;

    const fedapayKey = Deno.env.get("FEDAPAY_SECRET_KEY");
    if (!fedapayKey) {
      const { error: refundError } = await supabase.rpc("fail_withdrawal_and_refund", { p_withdrawal_id: withdrawal.withdrawal_id });
      return jsonResponse({ error: refundError ? "FedaPay non configuré et remboursement à vérifier" : "FedaPay non configuré" }, 500);
    }

    const fedapayBaseUrl = getFedapayBaseUrl();
    const payoutMode = operator === "mtn"
      ? Deno.env.get("FEDAPAY_MODE_MTN") || "mtn_open"
      : operator === "celtiis"
      ? Deno.env.get("FEDAPAY_MODE_CELTIIS") || "sbin"
      : Deno.env.get("FEDAPAY_MODE_MOOV") || "moov";

    // ÉTAPE 1 : création du payout. merchant_reference = identifiant du retrait ImoFlex :
    // elle empêche tout doublon et permet de retrouver le payout si la réponse est perdue.
    // Aucune relance automatique (maxRetries: 1 = une seule tentative).
    let payoutResponse: Response;
    try {
      payoutResponse = await fetchWithRetry(
        `${fedapayBaseUrl}/payouts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${fedapayKey}` },
          body: JSON.stringify({
            amount,
            currency: { iso: "XOF" },
            mode: payoutMode,
            description: `Retrait ImoFlex ${withdrawal.withdrawal_id}`,
            merchant_reference: withdrawal.withdrawal_id,
            customer: {
              firstname: authData.user.user_metadata?.first_name || authData.user.user_metadata?.prenom || "Propriétaire",
              lastname: authData.user.user_metadata?.last_name || authData.user.user_metadata?.nom || "ImoFlex",
              email: authData.user.email || `${ownerId}@imoflex.app`,
              phone_number: { number: destinationPhone, country: "bj" },
            },
          }),
        },
        { maxRetries: 1, timeoutMs: 15000, retryDelayMs: 0 },
      );
    } catch (error) {
      await supabase.from("audit_logs").insert({
        user_id: ownerId,
        action: "payout_ambiguous_timeout",
        entity_type: "withdrawals",
        entity_id: withdrawal.withdrawal_id,
        details: {
          amount,
          destination_phone: maskPhone(destinationPhone),
          error: error instanceof Error ? error.message : "Erreur réseau inconnue",
          note: "Le payout a pu être créé chez FedaPay : le rapprochement le retrouve par référence marchande.",
        },
      });
      return jsonResponse({
        withdrawal_id: withdrawal.withdrawal_id,
        status: "en_traitement",
        message: "Le retrait est en cours de vérification. Votre solde reste réservé jusqu'à confirmation.",
      }, 202);
    }

    const rawResponse = await payoutResponse.text();
    let payoutJson: unknown = null;
    try {
      payoutJson = rawResponse ? JSON.parse(rawResponse) : null;
    } catch {
      if (payoutResponse.ok) {
        await supabase.from("audit_logs").insert({
          user_id: ownerId,
          action: "payout_ambiguous_response",
          entity_type: "withdrawals",
          entity_id: withdrawal.withdrawal_id,
          details: { http_status: payoutResponse.status, response_preview: rawResponse.slice(0, 200) },
        });
        return jsonResponse({ withdrawal_id: withdrawal.withdrawal_id, status: "en_traitement" }, 202);
      }
    }

    if (!payoutResponse.ok) {
      const { data: refunded, error: refundError } = await supabase.rpc("fail_withdrawal_and_refund", { p_withdrawal_id: withdrawal.withdrawal_id });
      const providerMessage = (payoutJson as { message?: string } | null)?.message || `Erreur FedaPay (HTTP ${payoutResponse.status})`;
      if (refundError || !refunded) {
        await supabase.from("audit_logs").insert({
          user_id: ownerId,
          action: "withdrawal_refund_requires_review",
          entity_type: "withdrawals",
          entity_id: withdrawal.withdrawal_id,
          details: { provider_message: providerMessage, refund_error: refundError?.message ?? null },
        });
        return jsonResponse({ error: "Le retrait a échoué et nécessite une vérification manuelle." }, 500);
      }
      return jsonResponse({ error: providerMessage }, 502);
    }

    const payoutId = unwrapPayout(payoutJson).id;
    if (!payoutId) {
      await supabase.from("audit_logs").insert({
        user_id: ownerId,
        action: "payout_ambiguous_response",
        entity_type: "withdrawals",
        entity_id: withdrawal.withdrawal_id,
        details: { http_status: payoutResponse.status, reason: "payout_id_absent" },
      });
      return jsonResponse({ withdrawal_id: withdrawal.withdrawal_id, status: "en_traitement" }, 202);
    }

    const { error: updateError } = await supabase
      .from("withdrawals")
      .update({ fedapay_payout_id: String(payoutId) })
      .eq("id", withdrawal.withdrawal_id);
    if (updateError) {
      await supabase.from("audit_logs").insert({
        user_id: ownerId,
        action: "payout_created_database_update_failed",
        entity_type: "withdrawals",
        entity_id: withdrawal.withdrawal_id,
        details: { fedapay_payout_id: String(payoutId), database_error: updateError.message },
      });
      // Le rapprochement retrouvera le payout par référence marchande.
      return jsonResponse({ withdrawal_id: withdrawal.withdrawal_id, status: "en_traitement" }, 202);
    }

    // ÉTAPE 2 : lancement du payout (sans cet appel, FedaPay le laisse « pending »).
    // En cas d'échec, le payout reste créé : le rapprochement réessaie l'envoi.
    try {
      const started = await startPayout(fedapayKey, String(payoutId));
      if (!started.ok) {
        await supabase.from("audit_logs").insert({
          user_id: ownerId,
          action: "payout_start_failed",
          entity_type: "withdrawals",
          entity_id: withdrawal.withdrawal_id,
          details: { fedapay_payout_id: String(payoutId), http_status: started.status, response: started.body },
        });
      }
    } catch (error) {
      await supabase.from("audit_logs").insert({
        user_id: ownerId,
        action: "payout_start_failed",
        entity_type: "withdrawals",
        entity_id: withdrawal.withdrawal_id,
        details: { fedapay_payout_id: String(payoutId), error: error instanceof Error ? error.message : "Erreur inconnue" },
      });
    }

    await supabase.from("notifications").insert({
      user_id: ownerId,
      type: "confirmation",
      related_id: withdrawal.withdrawal_id,
      title: "Retrait en cours",
      body: `Votre retrait de ${amount} FCFA vers ${destinationPhone} est en traitement.`,
    });

    return jsonResponse({
      withdrawal_id: withdrawal.withdrawal_id,
      fedapay_payout_id: String(payoutId),
      status: "en_traitement",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur interne";
    return jsonResponse({ error: message }, 500);
  }
});
