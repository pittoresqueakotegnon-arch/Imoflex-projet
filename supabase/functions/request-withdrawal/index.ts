import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod";
import { maskPhone, fetchWithRetry } from "../_shared/security.ts";

const withdrawalSchema = z.object({
  wallet_id: z.string().uuid("ID de wallet invalide"),
  amount: z.number().int().positive("Le montant doit être supérieur à 0"),
  operator: z.enum(["mtn", "moov", "celtiis"], { errorMap: () => ({ message: "Opérateur non supporté" }) }),
  destination_phone: z.string().length(10, "Le numéro doit comporter 10 chiffres"),
  idempotency_key: z.string().uuid("Clé d'idempotence invalide"),
});

type CreatedWithdrawal = {
  withdrawal_id: string;
  withdrawal_status: "en_traitement" | "complete" | "echoue";
  already_exists: boolean;
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

function extractPayout(json: unknown): { id?: string | number } {
  const value = json as Record<string, unknown> | null;
  return (value?.["v1/payout"] ?? value?.payout ?? value ?? {}) as { id?: string | number };
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
    const { wallet_id: walletId, amount, operator, destination_phone: destinationPhone, idempotency_key: idempotencyKey } = parseResult.data;
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

    // La réservation du solde et la création du retrait sont une seule transaction.
    const { data: createdRows, error: creationError } = await supabase.rpc("create_withdrawal_and_deduct", {
      p_wallet_id: walletId,
      p_owner_id: ownerId,
      p_amount: amount,
      p_operator: operator,
      p_destination_phone: destinationPhone,
      p_idempotency_key: idempotencyKey,
    });

    if (creationError) {
      const isConflict = creationError.message.includes("déjà en cours") || creationError.message.includes("Solde insuffisant");
      return jsonResponse({ error: creationError.message }, isConflict ? 409 : 400);
    }

    const withdrawal = (createdRows?.[0] ?? null) as CreatedWithdrawal | null;
    if (!withdrawal?.withdrawal_id) return jsonResponse({ error: "Impossible de créer le retrait" }, 500);

    // Un retry réseau ne déclenche jamais un second payout avec la même clé.
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

    const fedapayKey = Deno.env.get("FEDAPAY_SECRET_KEY");
    if (!fedapayKey) {
      const { error: refundError } = await supabase.rpc("fail_withdrawal_and_refund", { p_withdrawal_id: withdrawal.withdrawal_id });
      return jsonResponse({ error: refundError ? "FedaPay non configuré et remboursement à vérifier" : "FedaPay non configuré" }, 500);
    }

    const fedapayBaseUrl = Deno.env.get("FEDAPAY_BASE_URL") || "https://api.fedapay.com/v1";
    const payoutMode = operator === "mtn"
      ? Deno.env.get("FEDAPAY_MODE_MTN") || "mtn_open"
      : operator === "celtiis"
      ? Deno.env.get("FEDAPAY_MODE_CELTIIS") || "sbin"
      : Deno.env.get("FEDAPAY_MODE_MOOV") || "moov";

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
            // Un timeout reste rapprochable dans le tableau de bord du prestataire.
            description: `Retrait ImoFlex ${withdrawal.withdrawal_id}`,
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
          note: "Wallet conservé débité : rapprocher le payout FedaPay avant toute action manuelle.",
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
      // Une réponse 2xx illisible peut tout de même représenter un payout accepté.
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

    const payoutId = extractPayout(payoutJson).id;
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
      return jsonResponse({ withdrawal_id: withdrawal.withdrawal_id, status: "en_traitement" }, 202);
    }

    await supabase.from("notifications").insert({
      user_id: ownerId,
      type: "retrait_complete",
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
