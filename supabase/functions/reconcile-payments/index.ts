import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    // Le mode dryRun est actif par défaut, sauf si "?dry_run=false" est explicitement passé
    const dryRun = url.searchParams.get("dry_run") !== "false";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const fedapaySecretKey = Deno.env.get("FEDAPAY_SECRET_KEY");
    if (!fedapaySecretKey) {
      return new Response(
        JSON.stringify({ error: "Clé secrète Fedapay manquante dans les variables d'environnement (FEDAPAY_SECRET_KEY)" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Récupérer les paiements en attente avec toutes les relations nécessaires
    const { data: pendingPayments, error: fetchError } = await supabase
      .from("payments")
      .select("*, rent_periods!inner(*, leases!inner(*, properties!inner(owner_id)))")
      .eq("status", "en_attente")
      .not("fedapay_transaction_id", "is", null);

    if (fetchError) {
      throw fetchError;
    }

    const summary = {
      dry_run: dryRun,
      processed: 0,
      corrected: 0,
      unchanged: 0,
      details: [] as any[],
    };

    if (!pendingPayments || pendingPayments.length === 0) {
      return new Response(
        JSON.stringify({ message: "Aucun paiement en attente à réconcilier", summary }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let isFirstTransaction = true;

    for (const payment of pendingPayments) {
      summary.processed++;
      const transactionId = payment.fedapay_transaction_id;
      const rentPeriod = payment.rent_periods;
      const ownerId = rentPeriod?.leases?.properties?.owner_id;
      const tenantId = payment.tenant_id;
      const amount = payment.amount;

      try {
        // Double check en base pour être sûr qu'il n'a pas été traité entre temps
        const { data: currentPayment } = await supabase
          .from("payments")
          .select("status")
          .eq("id", payment.id)
          .single();

        if (currentPayment?.status !== "en_attente") {
          summary.unchanged++;
          summary.details.push({ id: payment.id, transaction_id: transactionId, old_status: "en_attente", new_status: currentPayment?.status, reason: "Déjà traité" });
          continue;
        }

        // Appel à l'API FedaPay
        const fedapayResponse = await fetch(`https://sandbox-api.fedapay.com/v1/transactions/${transactionId}`, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${fedapaySecretKey}`,
            "Content-Type": "application/json",
          },
        });

        if (!fedapayResponse.ok) {
          console.error(`Erreur API Fedapay pour la transaction ${transactionId}`);
          summary.unchanged++;
          summary.details.push({ id: payment.id, transaction_id: transactionId, old_status: "en_attente", new_status: "en_attente", reason: "Erreur HTTP API Fedapay" });
          continue;
        }

        const fedapayData = await fedapayResponse.json();
        
        // Log de la première réponse brute pour vérification du parsing
        if (isFirstTransaction) {
          console.log("RAW_FEDAPAY_RESPONSE:", JSON.stringify(fedapayData));
          isFirstTransaction = false;
        }

        const transactionObj = fedapayData?.v1?.transaction || fedapayData?.transaction || fedapayData?.data || fedapayData;
        const fedapayStatus = transactionObj?.status;

        if (!fedapayStatus) {
          summary.unchanged++;
          summary.details.push({ id: payment.id, transaction_id: transactionId, old_status: "en_attente", new_status: "en_attente", reason: "Statut illisible depuis l'API" });
          continue;
        }

        if (fedapayStatus === "approved") {
          const { data: configData } = await supabase
            .from("app_config")
            .select("value")
            .eq("key", "commission_rate")
            .maybeSingle();

          const commissionRate = configData?.value ? parseFloat(configData.value) : 6;
          const ownerAmount = Math.round(amount * (1 - commissionRate / 100));
          const commissionAmount = amount - ownerAmount;

          if (!dryRun) {
            // Update payment status
            await supabase
              .from("payments")
              .update({
                status: "valide",
                validated_at: new Date().toISOString(),
                commission_amount: commissionAmount,
                commission_rate_applied: commissionRate,
              })
              .eq("id", payment.id);

            // Update rent_period
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
                body: `Un versement de ${amount} FCFA a été validé (Rattrapage). ${ownerAmount} FCFA crédités sur votre wallet (${commissionRate}% de commission ImoFlex).`,
              });
            }

            // Notify tenant
            await supabase.from("notifications").insert({
              user_id: tenantId,
              type: "confirmation",
              title: "Versement confirmé",
              body: `Votre versement de ${amount} FCFA a été validé avec succès.`,
            });
          }

          summary.corrected++;
          summary.details.push({ 
            id: payment.id, 
            transaction_id: transactionId, 
            old_status: "en_attente", 
            new_status: dryRun ? "en_attente (dry_run)" : "valide",
            would_update_to: dryRun ? "valide" : undefined,
            reason: "Approuvé par Fedapay" 
          });

        } else if (fedapayStatus !== "pending" && fedapayStatus !== "en_cours") {
          if (!dryRun) {
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
          }

          summary.corrected++;
          summary.details.push({ 
            id: payment.id, 
            transaction_id: transactionId, 
            old_status: "en_attente", 
            new_status: dryRun ? "en_attente (dry_run)" : "echoue",
            would_update_to: dryRun ? "echoue" : undefined,
            reason: `Statut Fedapay: ${fedapayStatus}` 
          });

        } else {
          summary.unchanged++;
          summary.details.push({ 
            id: payment.id, 
            transaction_id: transactionId, 
            old_status: "en_attente", 
            new_status: "en_attente", 
            reason: "Toujours en attente chez Fedapay" 
          });
        }

      } catch (err: any) {
        console.error(`Erreur de traitement pour le paiement ${payment.id}:`, err);
        summary.unchanged++;
        summary.details.push({ id: payment.id, transaction_id: transactionId, old_status: "en_attente", new_status: "en_attente", reason: "Erreur interne" });
      }
    }

    return new Response(
      JSON.stringify(summary, null, 2),
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
