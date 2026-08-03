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
        JSON.stringify({ error: "Clé secrète Fedapay manquante (FEDAPAY_SECRET_KEY)" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fedapayBaseUrl = Deno.env.get("FEDAPAY_BASE_URL") || "https://api.fedapay.com/v1";

    // Récupérer les paiements en attente
    const { data: pendingPayments, error: fetchError } = await supabase
      .from("payments")
      .select("id, fedapay_transaction_id, tenant_id, amount")
      .eq("status", "en_attente")
      .not("fedapay_transaction_id", "is", null);

    if (fetchError) throw fetchError;

    const summary = {
      dry_run: dryRun,
      processed: 0,
      corrected: 0,
      unchanged: 0,
      errors: 0,
      details: [] as any[],
    };

    if (!pendingPayments || pendingPayments.length === 0) {
      return new Response(
        JSON.stringify({ message: "Aucun paiement en attente à réconcilier", summary }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    for (const payment of pendingPayments) {
      summary.processed++;
      const transactionId = payment.fedapay_transaction_id;

      try {
        // Appel à l'API FedaPay avec timeout strict de 10 secondes
        let fedapayResponse: Response;
        try {
          fedapayResponse = await fetch(`${fedapayBaseUrl}/transactions/${transactionId}`, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${fedapaySecretKey}`,
              "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(10000),
          });
        } catch (fetchErr: unknown) {
          const isTimeout = fetchErr instanceof Error && fetchErr.name === "TimeoutError";
          const reason = isTimeout
            ? `Timeout Fedapay (>10s) pour tx ${transactionId}`
            : `Erreur réseau Fedapay: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`;
          console.error(reason);
          summary.errors++;
          summary.details.push({ id: payment.id, transaction_id: transactionId, status: "en_attente", reason });
          continue;
        }

        if (!fedapayResponse.ok) {
          const reason = `Erreur HTTP Fedapay (${fedapayResponse.status}) pour tx ${transactionId}`;
          console.error(reason);
          summary.unchanged++;
          summary.details.push({ id: payment.id, transaction_id: transactionId, status: "en_attente", reason });
          continue;
        }

        const fedapayData = await fedapayResponse.json();
        const transactionObj = fedapayData?.["v1/transaction"] ?? fedapayData?.transaction ?? fedapayData;
        const fedapayStatus = transactionObj?.status;

        if (!fedapayStatus) {
          summary.unchanged++;
          summary.details.push({ id: payment.id, transaction_id: transactionId, status: "en_attente", reason: "Statut illisible" });
          continue;
        }

        // Mapper les statuts Fedapay vers nos event types
        let eventType: string | null = null;
        if (fedapayStatus === "approved") {
          eventType = "transaction.approved";
        } else if (["declined", "canceled", "failed"].includes(fedapayStatus)) {
          eventType = "transaction.declined";
        }

        if (!eventType) {
          // Encore en attente côté Fedapay
          summary.unchanged++;
          summary.details.push({ id: payment.id, transaction_id: transactionId, status: "en_attente", reason: `Toujours en attente (Fedapay: ${fedapayStatus})` });
          continue;
        }

        if (dryRun) {
          summary.corrected++;
          summary.details.push({
            id: payment.id,
            transaction_id: transactionId,
            would_apply_event: eventType,
            reason: `[DRY RUN] Fedapay: ${fedapayStatus}`,
          });
          continue;
        }

        // Déléguer le traitement atomique au RPC (idempotent, verrous, ledger)
        const { data: rpcResult, error: rpcError } = await supabase.rpc(
          "process_payment_webhook",
          { p_fedapay_tx_id: transactionId, p_event_type: eventType }
        );

        if (rpcError) {
          console.error(`RPC error for payment ${payment.id}:`, rpcError);
          summary.errors++;
          summary.details.push({ id: payment.id, transaction_id: transactionId, status: "en_attente", reason: `Erreur RPC: ${rpcError.message}` });
          continue;
        }

        if (rpcResult?.status === "already_processed") {
          summary.unchanged++;
          summary.details.push({ id: payment.id, transaction_id: transactionId, status: "already_processed", reason: "Déjà traité (idempotent)" });
          continue;
        }

        // Envoyer les notifications post-RPC
        if (rpcResult?.status === "approved" && rpcResult.owner_id) {
          await supabase.from("notifications").insert({
            user_id: rpcResult.owner_id,
            type: "nouveau_versement",
            related_id: payment.id,
            title: "Nouveau versement reçu (rattrapage)",
            body: `Un versement de ${rpcResult.amount} FCFA a été validé. ${rpcResult.owner_amount} FCFA crédités sur votre wallet.`,
          });
        }
        if (rpcResult?.tenant_id) {
          const notifTitle = rpcResult.status === "approved" ? "Versement confirmé" : "Versement échoué";
          const notifBody = rpcResult.status === "approved"
            ? `Votre versement de ${rpcResult.amount} FCFA a été validé avec succès.`
            : `Votre versement de ${rpcResult.amount} FCFA a échoué. Veuillez réessayer.`;
          await supabase.from("notifications").insert({
            user_id: rpcResult.tenant_id,
            type: rpcResult.status === "approved" ? "confirmation" : "retard",
            related_id: payment.id,
            title: notifTitle,
            body: notifBody,
          });
        }

        summary.corrected++;
        summary.details.push({
          id: payment.id,
          transaction_id: transactionId,
          new_status: rpcResult?.status,
          reason: `Réconcilié — Fedapay: ${fedapayStatus}`,
        });

      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : "Erreur interne inconnue";
        console.error(`Erreur traitement paiement ${payment.id}:`, reason);
        summary.errors++;
        summary.details.push({ id: payment.id, transaction_id: transactionId, status: "en_attente", reason });
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
