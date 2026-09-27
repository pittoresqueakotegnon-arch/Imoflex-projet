import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isServiceRoleCaller } from "../_shared/security.ts";

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
    if (!isServiceRoleCaller(req)) {
      return new Response(
        JSON.stringify({ error: "Accès réservé au service interne" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") !== "false";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const fedapaySecretKey = Deno.env.get("FEDAPAY_SECRET_KEY");
    if (!fedapaySecretKey) {
      return new Response(
        JSON.stringify({ error: "Clé secrète Fedapay manquante" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fedapayBaseUrl = Deno.env.get("FEDAPAY_BASE_URL") || "https://api.fedapay.com/v1";

    const { data: pendingWithdrawals, error: fetchError } = await supabase
      .from("withdrawals")
      .select("id, fedapay_payout_id, amount, wallet_id")
      .eq("status", "en_traitement")
      .not("fedapay_payout_id", "is", null);

    if (fetchError) throw fetchError;

    const summary = {
      dry_run: dryRun,
      processed: 0,
      corrected: 0,
      unchanged: 0,
      errors: 0,
      details: [] as any[],
    };

    if (!pendingWithdrawals || pendingWithdrawals.length === 0) {
      return new Response(
        JSON.stringify({ message: "Aucun retrait en attente à réconcilier", summary }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    for (const withdrawal of pendingWithdrawals) {
      summary.processed++;
      const payoutId = withdrawal.fedapay_payout_id;

      try {
        let fedapayResponse: Response;
        try {
          fedapayResponse = await fetch(`${fedapayBaseUrl}/payouts/${payoutId}`, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${fedapaySecretKey}`,
              "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(10000),
          });
        } catch (fetchErr: unknown) {
          const isTimeout = fetchErr instanceof Error && fetchErr.name === "TimeoutError";
          const reason = isTimeout ? `Timeout FedaPay` : `Erreur réseau`;
          summary.errors++;
          summary.details.push({ id: withdrawal.id, status: "en_traitement", reason });
          continue;
        }

        if (!fedapayResponse.ok) {
          summary.unchanged++;
          summary.details.push({ id: withdrawal.id, status: "en_traitement", reason: `Erreur HTTP ${fedapayResponse.status}` });
          continue;
        }

        const fedapayData = await fedapayResponse.json();
        const payoutObj = fedapayData?.["v1/payout"] ?? fedapayData?.payout ?? fedapayData;
        const fedapayStatus = payoutObj?.status;

        if (!fedapayStatus) {
          summary.unchanged++;
          summary.details.push({ id: withdrawal.id, status: "en_traitement", reason: "Statut illisible" });
          continue;
        }

        let newStatus: 'complete' | 'echoue' | null = null;
        if (fedapayStatus === "sent" || fedapayStatus === "approved") {
          newStatus = "complete";
        } else if (["declined", "canceled", "failed"].includes(fedapayStatus)) {
          newStatus = "echoue";
        }

        if (!newStatus) {
          summary.unchanged++;
          summary.details.push({ id: withdrawal.id, status: "en_traitement", reason: `En attente (${fedapayStatus})` });
          continue;
        }

        if (dryRun) {
          summary.corrected++;
          summary.details.push({ id: withdrawal.id, would_apply_status: newStatus, reason: `[DRY RUN] ${fedapayStatus}` });
          continue;
        }

        const { data: reconciled, error: rpcError } = await supabase.rpc(
          "reconcile_withdrawal_status",
          { p_withdrawal_id: withdrawal.id, p_new_status: newStatus }
        );

        if (rpcError) {
          summary.errors++;
          summary.details.push({ id: withdrawal.id, status: "en_traitement", reason: `Erreur RPC: ${rpcError.message}` });
          continue;
        }

        if (!reconciled) {
          summary.unchanged++;
          summary.details.push({ id: withdrawal.id, status: "already_processed", reason: "Déjà traité" });
          continue;
        }

        // Notify user if completed or failed
        const { data: walletData } = await supabase.from("wallets").select("owner_id").eq("id", withdrawal.wallet_id).single();
        if (walletData?.owner_id) {
          await supabase.from("notifications").insert({
            user_id: walletData.owner_id,
            type: newStatus === "complete" ? "retrait_complete" : "alerte",
            related_id: withdrawal.id,
            title: newStatus === "complete" ? "Retrait validé" : "Retrait échoué",
            body: newStatus === "complete"
              ? `Votre retrait de ${withdrawal.amount} FCFA a été traité avec succès.`
              : `Votre demande de retrait de ${withdrawal.amount} FCFA a échoué. Les fonds ont été restitués sur votre wallet.`,
          });
        }

        summary.corrected++;
        summary.details.push({ id: withdrawal.id, new_status: newStatus, reason: `Réconcilié (${fedapayStatus})` });

      } catch (err: unknown) {
        summary.errors++;
        summary.details.push({ id: withdrawal.id, status: "en_traitement", reason: err instanceof Error ? err.message : "Erreur" });
      }
    }

    return new Response(JSON.stringify(summary, null, 2), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erreur interne" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
