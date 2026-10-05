import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isServiceRoleCaller } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** Rapproche les payouts connus, sans jamais déduire un succès d'un timeout. */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Méthode non autorisée" }, 405);
  if (!isServiceRoleCaller(req)) return response({ error: "Accès réservé au service interne" }, 403);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const fedapayKey = Deno.env.get("FEDAPAY_SECRET_KEY");
  if (!fedapayKey) return response({ error: "Configuration FedaPay manquante" }, 500);

  const baseUrl = Deno.env.get("FEDAPAY_BASE_URL") || "https://api.fedapay.com/v1";
  const { data: withdrawals, error } = await supabase
    .from("withdrawals")
    .select("id, fedapay_payout_id, amount, wallet_id")
    .eq("status", "en_traitement")
    .not("fedapay_payout_id", "is", null)
    .limit(100);
  if (error) return response({ error: "Lecture des retraits impossible" }, 500);

  const summary = { checked: 0, completed: 0, refunded: 0, pending: 0, errors: 0 };
  for (const withdrawal of withdrawals ?? []) {
    summary.checked++;
    try {
      const providerResponse = await fetch(`${baseUrl}/payouts/${withdrawal.fedapay_payout_id}`, {
        headers: { Authorization: `Bearer ${fedapayKey}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!providerResponse.ok) { summary.errors++; continue; }
      const raw = await providerResponse.json();
      const payout = raw?.["v1/payout"] ?? raw?.payout ?? raw;
      const status = String(payout?.status ?? "").toLowerCase();
      const newStatus = ["sent", "approved", "success", "completed"].includes(status)
        ? "complete"
        : ["failed", "declined", "canceled", "cancelled"].includes(status)
        ? "echoue"
        : null;
      if (!newStatus) { summary.pending++; continue; }
      const { data: changed, error: reconcileError } = await supabase.rpc("reconcile_withdrawal_status", {
        p_withdrawal_id: withdrawal.id,
        p_new_status: newStatus,
      });
      if (reconcileError || !changed) { summary.errors++; continue; }
      const { data: wallet } = await supabase
        .from("wallets")
        .select("owner_id")
        .eq("id", withdrawal.wallet_id)
        .maybeSingle();
      if (wallet?.owner_id) {
        await supabase.from("notifications").insert({
          user_id: wallet.owner_id,
          type: newStatus === "complete" ? "retrait_complete" : "retrait_echoue",
          related_id: withdrawal.id,
          title: newStatus === "complete" ? "Retrait validé" : "Retrait échoué",
          body: newStatus === "complete"
            ? `Votre retrait de ${withdrawal.amount} FCFA a été traité avec succès.`
            : `Votre retrait de ${withdrawal.amount} FCFA a échoué. Les fonds ont été restitués sur votre wallet.`,
        });
      }
      if (newStatus === "complete") summary.completed++;
      else summary.refunded++;
    } catch {
      summary.errors++;
    }
  }
  return response(summary);
});
