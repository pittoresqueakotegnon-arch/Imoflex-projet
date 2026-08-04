import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as crypto from "node:crypto";
import { safeLog } from "../_shared/security.ts";

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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const webhookSecret = Deno.env.get("FEDAPAY_WEBHOOK_SECRET") || "";
    const signatureHeader = req.headers.get("x-fedapay-signature") || "";
    const rawBody = await req.text();

    if (!webhookSecret) {
      return new Response(
        JSON.stringify({ error: "Webhook non configuré (secret manquant)" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!signatureHeader) {
      return new Response(
        JSON.stringify({ error: "Signature manquante" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calcul du HMAC SHA-256 en mode Node crypto
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody, "utf8")
      .digest("hex");

    const expectedBuf = Buffer.from(expectedSignature, "hex");
    let signatureBuf: Buffer;
    try {
      signatureBuf = Buffer.from(signatureHeader, "hex");
    } catch {
      return new Response(
        JSON.stringify({ error: "Format de signature invalide" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // timingSafeEqual pour éviter les failles temporelles
    if (expectedBuf.length !== signatureBuf.length || !crypto.timingSafeEqual(expectedBuf, signatureBuf)) {
      return new Response(
        JSON.stringify({ error: "Signature invalide" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
      safeLog("WEBHOOK_PAYLOAD_DEBUG:", payload);
    } catch {
      return new Response(
        JSON.stringify({ error: "JSON Invalide" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- Anti-Replay Attack : rejeter les webhooks datant de plus de 5 minutes ----
    const payloadTimestamp = payload?.created_at
      ? Date.parse(payload.created_at)
      : (payload?.timestamp ? Number(payload.timestamp) * 1000 : null);

    if (payloadTimestamp) {
      const ageMs = Math.abs(Date.now() - payloadTimestamp);
      if (ageMs > 5 * 60 * 1000) {
        console.warn(`[anti-replay] Webhook rejected: age=${Math.round(ageMs / 1000)}s > 300s`);
        return new Response(
          JSON.stringify({ error: "Webhook expiré (timestamp trop ancien ou dans le futur)" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const { name: eventName, entity } = payload;

    if (!eventName || !entity) {
      return new Response(
        JSON.stringify({ error: "Payload invalide" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (eventName === "transaction.approved" || eventName === "transaction.declined") {
      const transactionId = entity?.id?.toString() || entity?.reference;
      
      if (!transactionId) {
        return new Response(
          JSON.stringify({ error: "Transaction ID manquant" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Appel au RPC atomique (qui fait les locks et idempontence)
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        "process_payment_webhook",
        {
          p_fedapay_tx_id: transactionId,
          p_event_type: eventName,
        }
      );

      if (rpcError) {
        console.error("RPC Error:", rpcError);
        return new Response(
          JSON.stringify({ error: "Erreur lors du traitement (RPC)" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Traitement des notifications basé sur le retour du RPC
      if (rpcResult?.status === "already_processed") {
        return new Response(
          JSON.stringify({ received: true, event: eventName, status: "ignored_duplicate" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (rpcResult?.status === "approved") {
        const { owner_id, tenant_id, amount, owner_amount, commission_rate, payment_id } = rpcResult;
        
        let tenantName = "Le locataire";
        if (tenant_id) {
          const { data: tenantProfile } = await supabase
            .from("users")
            .select("full_name")
            .eq("id", tenant_id)
            .maybeSingle();
          if (tenantProfile?.full_name) {
            tenantName = tenantProfile.full_name;
          }
        }

        // Notify owner
        if (owner_id) {
          await supabase.from("notifications").insert({
            user_id: owner_id,
            type: "nouveau_versement",
            related_id: payment_id,
            title: "Nouveau versement reçu",
            body: `${tenantName} a versé ${amount} FCFA. ${owner_amount} FCFA crédités sur votre wallet (${commission_rate}% de commission ImoFlex).`,
          });
        }
        // Notify tenant
        if (tenant_id) {
          await supabase.from("notifications").insert({
            user_id: tenant_id,
            type: "confirmation",
            related_id: payment_id,
            title: "Versement confirmé",
            body: `Votre versement de ${amount} FCFA a été validé avec succès.`,
          });
        }
      } else if (rpcResult?.status === "declined") {
        const { tenant_id, amount, payment_id } = rpcResult;
        
        // Inspecter la raison de l'échec depuis l'entité FedaPay
        const errorCode = String(entity.error_code || entity.sub_status || entity.last_error?.code || "").toUpperCase();
        const errorMsg = String(entity.error_message || entity.last_error?.message || "").toUpperCase();
        
        let bodyMsg = "La transaction a été annulée par l'opérateur. Veuillez réessayer ou contacter votre réseau.";
        if (errorCode.includes("INSUFFICIENT") || errorMsg.includes("INSUFFICIENT_FUND") || errorMsg.includes("INSUFFISANT")) {
          bodyMsg = "Transaction échouée : Solde Mobile Money insuffisant sur votre compte. Veuillez recharger votre compte et réessayer.";
        }

        // Notify tenant
        if (tenant_id) {
          await supabase.from("notifications").insert({
            user_id: tenant_id,
            type: "retard",
            related_id: payment_id,
            title: "Versement échoué",
            body: bodyMsg,
          });
        }
      }
    } else if (eventName.startsWith("payout.")) {
      // Payout Logic stays the same
      const payoutId = entity?.id?.toString();

      if (!payoutId) {
        return new Response(
          JSON.stringify({ error: "Payout ID manquant" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: withdrawal, error: withdrawalError } = await supabase
        .from("withdrawals")
        .select("*, wallets!inner(*)")
        .eq("fedapay_payout_id", payoutId)
        .maybeSingle();

      if (withdrawalError || !withdrawal) {
        return new Response(
          JSON.stringify({ error: "Retrait introuvable" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const wallet = withdrawal.wallets;
      const ownerId = wallet.owner_id;

      if (eventName === "payout.sent") {
        if (withdrawal.status !== "valide") {
          await supabase
            .from("withdrawals")
            .update({ status: "valide", completed_at: new Date().toISOString() })
            .eq("id", withdrawal.id);

          await supabase.from("notifications").insert({
            user_id: ownerId,
            type: "retrait_complete",
            related_id: withdrawal.id,
            title: "Retrait validé",
            body: `Votre retrait de ${withdrawal.amount} FCFA vers ${withdrawal.destination_phone} a été effectué avec succès.`,
          });
        }
      } else if (["payout.failed", "payout.declined", "payout.canceled"].includes(eventName)) {
        if (withdrawal.status !== "echoue") {
          // Utiliser RPC atomique aussi pour les retraits ?
          // Pour l'instant on garde le JS car ce n'est pas ciblé par le plan de priorité, 
          // ou on peut faire une autre migration. Le plan cible les paiements (rent_periods).
          await supabase
            .from("withdrawals")
            .update({ status: "echoue" })
            .eq("id", withdrawal.id);

          await supabase
            .from("wallets")
            .update({
              available_balance: wallet.available_balance + withdrawal.amount,
              total_withdrawn: wallet.total_withdrawn - withdrawal.amount,
            })
            .eq("id", wallet.id);

          await supabase.from("notifications").insert({
            user_id: ownerId,
            type: "retrait_echoue",
            related_id: withdrawal.id,
            title: "Échec du retrait",
            body: `Votre retrait de ${withdrawal.amount} FCFA vers ${withdrawal.destination_phone} a échoué. Les fonds ont été restitués sur votre portefeuille.`,
          });

          await supabase.from("audit_logs").insert({
            user_id: ownerId,
            action: "echec_retrait",
            entity_type: "withdrawals",
            entity_id: withdrawal.id,
            details: {
              reason: "payout_failed_fedapay",
              event: eventName,
              amount: withdrawal.amount,
              wallet_id: wallet.id,
            }
          });
        }
      }
    }

    return new Response(
      JSON.stringify({ received: true, event: eventName }),
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
