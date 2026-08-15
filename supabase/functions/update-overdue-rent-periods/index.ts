import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ── Helper : envoyer une notification push (best-effort) ─────────────────────
async function sendPush(userId: string, title: string, body: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return;
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ user_id: userId, title, body }),
    });
  } catch (e) {
    console.warn("sendPush failed (non-blocking):", e);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Date du jour au format YYYY-MM-DD (UTC)
    const today = new Date().toISOString().split("T")[0];

    // Récupérer les périodes à mettre en retard + l'id du locataire associé
    const { data, error } = await supabase
      .from("rent_periods")
      .update({ status: "retard" })
      .eq("status", "en_cours")
      .lt("deadline_date", today)
      .select("id, lease_id, leases!inner(tenant_id)");

    if (error) {
      console.error("update-overdue-rent-periods error:", error.message);
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const updatedCount = data?.length || 0;
    console.log(`update-overdue-rent-periods: ${updatedCount} période(s) passée(s) en retard.`);

    // Envoyer une notification push + in-app pour chaque locataire concerné
    if (updatedCount > 0 && data) {
      type RentPeriodRow = { id: string; lease_id: string; leases: { tenant_id: string } | { tenant_id: string }[] };
      for (const period of data as RentPeriodRow[]) {
        const leaseData = Array.isArray(period.leases) ? period.leases[0] : period.leases;
        const tenantId = leaseData?.tenant_id;
        if (!tenantId) continue;

        // Notification in-app
        await supabase.from("notifications").insert({
          user_id: tenantId,
          type: "retard",
          related_id: period.id,
          title: "Loyer en retard",
          body: "Votre loyer du mois est en retard. Veuillez régulariser votre situation dans l'application.",
        });

        // Notification push native
        await sendPush(
          tenantId,
          "⚠️ Loyer en retard",
          "Votre loyer est en retard. Régularisez votre situation sur ImoFlex."
        );
      }
    }

    return new Response(
      JSON.stringify({ updated: updatedCount, date_checked: today }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur interne";
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
