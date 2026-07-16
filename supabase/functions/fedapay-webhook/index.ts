import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Webhook } from "npm:fedapay@1";

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

    // ---- Sécurité : vérification obligatoire de la signature Fedapay ----
    // Sans ça, n'importe qui peut poster un faux "transaction.approved"
    // et créditer un wallet sans paiement réel.
    const webhookSecret = Deno.env.get("FEDAPAY_WEBHOOK_SECRET") || "";
    const signatureHeader = req.headers.get("x-fedapay-signature") || "";
    const rawBody = await req.text();

    if (!webhookSecret) {
      // Aucun secret configuré = on refuse tout, jamais de mode "ouvert" en prod
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

    let payload: any;
    try {
      // Webhook.constructEvent vérifie la signature ET parse le payload.
      // Si la signature est invalide, elle lève une exception.
      const event = Webhook.constructEvent(rawBody, signatureHeader, webhookSecret);
      payload = event;
      console.log("WEBHOOK_PAYLOAD_DEBUG:", JSON.stringify(payload));
    } catch (sigErr) {
      return new Response(
        JSON.stringify({ error: "Signature invalide" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { name: eventName, data } = payload;

    if (!eventName || !data) {
      return new Response(
        JSON.stringify({ error: "Payload invalide" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const transactionId = data?.transaction?.reference || data?.transaction?.id?.toString();

    if (!transactionId) {
      return new Response(
        JSON.stringify({ error: "Transaction ID manquant" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the payment record
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("*, rent_periods!inner(*, leases!inner(*, properties!inner(owner_id)))")
      .eq("fedapay_transaction_id", transactionId)
      .maybeSingle();

    if (paymentError || !payment) {
      return new Response(
        JSON.stringify({ error: "Paiement introuvable" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rentPeriod = payment.rent_periods;
    const ownerId = rentPeriod?.leases?.properties?.owner_id;
    const tenantId = payment.tenant_id;
    const amount = payment.amount;

    if (eventName === "transaction.approved") {
      // ---- Lecture dynamique du taux de commission depuis app_config ----
      // Fallback à 6 si app_config est injoignable (jamais bloquant)
      const { data: configData } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "commission_rate")
        .maybeSingle();

      const commissionRate = configData?.value ? parseFloat(configData.value) : 6;
      const ownerAmount = Math.round(amount * (1 - commissionRate / 100));
      const commissionAmount = amount - ownerAmount;

      // Update payment status + enregistrement de la commission exacte appliquée
      await supabase
        .from("payments")
        .update({
          status: "valide",
          validated_at: new Date().toISOString(),
          commission_amount: commissionAmount,
          commission_rate_applied: commissionRate,
        })
        .eq("id", payment.id);

      // Update rent_period amount_paid
      const newAmountPaid = (rentPeriod.amount_paid || 0) + amount;
      const newStatus = newAmountPaid >= rentPeriod.amount_due ? "solde" : "en_cours";

      await supabase
        .from("rent_periods")
        .update({ amount_paid: newAmountPaid, status: newStatus })
        .eq("id", rentPeriod.id);

      // Credit owner wallet
      if (ownerId) {
        const { data: wallet } = await supabase
          .from("wallets")
          .select("*")
          .eq("owner_id", ownerId)
          .maybeSingle();

        if (wallet) {
          await supabase
            .from("wallets")
            .update({
              available_balance: wallet.available_balance + ownerAmount,
              total_earned: wallet.total_earned + ownerAmount,
            })
            .eq("id", wallet.id);
        } else {
          // Create wallet if it doesn't exist
          await supabase.from("wallets").insert({
            owner_id: ownerId,
            available_balance: ownerAmount,
            total_earned: ownerAmount,
          });
        }

        // Notify owner
        await supabase.from("notifications").insert({
          user_id: ownerId,
          type: "nouveau_versement",
          title: "Nouveau versement reçu",
          body: `Un versement de ${amount} FCFA a été validé. ${ownerAmount} FCFA crédités sur votre wallet (${commissionRate}% de commission ImoFlex).`,
        });
      }

      // Notify tenant
      await supabase.from("notifications").insert({
        user_id: tenantId,
        type: "confirmation",
        title: "Versement confirmé",
        body: `Votre versement de ${amount} FCFA a été validé avec succès.`,
      });

    } else if (eventName === "transaction.declined") {
      // Update payment status to failed
      await supabase
        .from("payments")
        .update({ status: "echoue" })
        .eq("id", payment.id);

      // Notify tenant
      await supabase.from("notifications").insert({
        user_id: tenantId,
        type: "retard",
        title: "Versement échoué",
        body: `Votre versement de ${amount} FCFA a échoué. Veuillez réessayer.`,
      });
    } else if (eventName.startsWith("payout.")) {
      // Logic for Payout Webhooks
      const payoutId = data?.payout?.id?.toString() || data?.entity?.id?.toString() || data?.id?.toString();

      if (!payoutId) {
        return new Response(
          JSON.stringify({ error: "Payout ID manquant" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch the withdrawal record
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
            title: "Retrait validé",
            body: `Votre retrait de ${withdrawal.amount} FCFA vers ${withdrawal.destination_phone} a été effectué avec succès.`,
          });
        }
      } else if (["payout.failed", "payout.declined", "payout.canceled"].includes(eventName)) {
        if (withdrawal.status !== "echoue") {
          // Update status to failed
          await supabase
            .from("withdrawals")
            .update({ status: "echoue" })
            .eq("id", withdrawal.id);

          // Refund the wallet
          await supabase
            .from("wallets")
            .update({
              available_balance: wallet.available_balance + withdrawal.amount,
              total_withdrawn: wallet.total_withdrawn - withdrawal.amount,
            })
            .eq("id", wallet.id);

          // Notify the owner
          await supabase.from("notifications").insert({
            user_id: ownerId,
            type: "retrait_echoue", // Assuming you handle this type on frontend, or fall back to generic
            title: "Échec du retrait",
            body: `Votre retrait de ${withdrawal.amount} FCFA vers ${withdrawal.destination_phone} a échoué. Les fonds ont été restitués sur votre portefeuille.`,
          });

          // Create audit log for the refund
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
