import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isServiceRoleCaller } from "../_shared/security.ts";
import {
  classifyPayoutStatus,
  fetchPayoutById,
  fetchPayoutByReference,
  startPayout,
} from "../_shared/payouts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const MINUTE = 60_000;
// Un retrait sans identifiant de payout n'est examiné qu'après ce délai (laisse finir la requête d'origine).
const LOOKUP_AFTER_MINUTES = 10;
// Un payout encore « pending » est relancé (start) après ce délai.
const RESTART_AFTER_MINUTES = 3;
// Alerte d'audit (une seule fois, à ~2 h) pour un payout qui ne démarre pas.
const STUCK_ALERT_MINUTES = 120;

/**
 * Rapproche les retraits en traitement avec FedaPay, sans jamais déduire un succès d'un timeout.
 *  - retrait AVEC identifiant de payout : lecture du statut, finalisation ou remboursement ;
 *    un payout encore « pending » est lancé (PUT /payouts/start) ;
 *  - retrait SANS identifiant de payout : recherche par référence marchande ;
 *    introuvable (404) = jamais créé chez FedaPay => remboursement ; autre erreur => attente.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Méthode non autorisée" }, 405);
  if (!isServiceRoleCaller(req)) return response({ error: "Accès réservé au service interne" }, 403);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const fedapayKey = Deno.env.get("FEDAPAY_SECRET_KEY");
  if (!fedapayKey) return response({ error: "Configuration FedaPay manquante" }, 500);

  const { data: withdrawals, error } = await supabase
    .from("withdrawals")
    .select("id, fedapay_payout_id, amount, wallet_id, created_at")
    .eq("status", "en_traitement")
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) return response({ error: "Lecture des retraits impossible" }, 500);

  const summary = { checked: 0, completed: 0, refunded: 0, restarted: 0, linked: 0, pending: 0, skipped: 0, errors: 0 };

  async function ownerOf(walletId: string): Promise<string | null> {
    const { data } = await supabase.from("wallets").select("owner_id").eq("id", walletId).maybeSingle();
    return data?.owner_id ?? null;
  }

  async function notify(withdrawal: { id: string; amount: number; wallet_id: string }, completed: boolean) {
    const ownerId = await ownerOf(withdrawal.wallet_id);
    if (!ownerId) return;
    await supabase.from("notifications").insert({
      user_id: ownerId,
      type: completed ? "retrait_complete" : "retrait_echoue",
      related_id: withdrawal.id,
      title: completed ? "Retrait validé" : "Retrait échoué",
      body: completed
        ? `Votre retrait de ${withdrawal.amount} FCFA a été traité avec succès.`
        : `Votre retrait de ${withdrawal.amount} FCFA a échoué. Les fonds ont été restitués sur votre wallet.`,
    });
  }

  async function audit(withdrawalId: string, action: string, details: Record<string, unknown>) {
    const { data: wallet } = await supabase
      .from("withdrawals")
      .select("wallets(owner_id)")
      .eq("id", withdrawalId)
      .maybeSingle();
    const ownerId = (wallet as { wallets?: { owner_id?: string } } | null)?.wallets?.owner_id ?? null;
    await supabase.from("audit_logs").insert({
      user_id: ownerId,
      action,
      entity_type: "withdrawals",
      entity_id: withdrawalId,
      details,
    });
  }

  for (const withdrawal of withdrawals ?? []) {
    summary.checked++;
    try {
      const ageMinutes = (Date.now() - Date.parse(withdrawal.created_at)) / MINUTE;
      let payoutId: string | null = withdrawal.fedapay_payout_id;

      if (!payoutId) {
        if (ageMinutes < LOOKUP_AFTER_MINUTES) { summary.skipped++; continue; }
        const lookup = await fetchPayoutByReference(fedapayKey, withdrawal.id);
        if (lookup.payout?.id) {
          payoutId = String(lookup.payout.id);
          await supabase.from("withdrawals").update({ fedapay_payout_id: payoutId }).eq("id", withdrawal.id);
          summary.linked++;
        } else if (lookup.status === 404) {
          // Jamais créé chez FedaPay : aucun argent n'a pu partir, on rembourse.
          const { data: refunded, error: refundError } = await supabase.rpc("fail_withdrawal_and_refund", {
            p_withdrawal_id: withdrawal.id,
          });
          if (refundError || !refunded) { summary.errors++; continue; }
          await audit(withdrawal.id, "withdrawal_refunded_no_payout", { age_minutes: Math.round(ageMinutes) });
          await notify(withdrawal, false);
          summary.refunded++;
          continue;
        } else {
          summary.errors++;
          continue;
        }
      }

      const { status: httpStatus, payout } = await fetchPayoutById(fedapayKey, payoutId);
      if (!payout) { if (httpStatus >= 400) summary.errors++; continue; }

      const rawStatus = String(payout.status ?? "").toLowerCase();
      const outcome = classifyPayoutStatus(rawStatus);

      if (outcome === "pending") {
        summary.pending++;
        // Payout créé mais jamais lancé (échec de l'étape « start » à la création) : on le lance.
        if (rawStatus === "pending" && ageMinutes >= RESTART_AFTER_MINUTES) {
          const started = await startPayout(fedapayKey, payoutId);
          if (started.ok) summary.restarted++;
          else await audit(withdrawal.id, "payout_start_failed", { fedapay_payout_id: payoutId, http_status: started.status });
        }
        if (ageMinutes >= STUCK_ALERT_MINUTES && ageMinutes < STUCK_ALERT_MINUTES + 10) {
          await audit(withdrawal.id, "withdrawal_stuck_pending", {
            fedapay_payout_id: payoutId,
            fedapay_status: rawStatus,
            age_minutes: Math.round(ageMinutes),
            action: "Vérifier chez FedaPay puis utiliser admin_resolve_withdrawal",
          });
        }
        continue;
      }

      const newStatus = outcome === "sent" ? "complete" : "echoue";
      const { data: changed, error: reconcileError } = await supabase.rpc("reconcile_withdrawal_status", {
        p_withdrawal_id: withdrawal.id,
        p_new_status: newStatus,
      });
      if (reconcileError || !changed) { summary.errors++; continue; }

      await notify(withdrawal, newStatus === "complete");
      if (newStatus === "complete") summary.completed++;
      else summary.refunded++;
    } catch (_error) {
      summary.errors++;
    }
  }

  return response(summary);
});
