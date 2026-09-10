import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isServiceRoleCaller } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ── Helper : envoyer une notification push (best-effort) ──
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
    // Fonction interne réservée au cron : verify_jwt (config.toml) ne vérifie que
    // la validité de la signature, pas le rôle. Sans ce contrôle, n'importe quel
    // utilisateur authentifié pourrait déclencher ce traitement à volonté.
    if (!isServiceRoleCaller(req)) {
      return new Response(
        JSON.stringify({ error: "Accès réservé au service interne" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Date du jour au format YYYY-MM-DD (UTC)
    const today = new Date().toISOString().split("T")[0];

    // 1. Récupérer les périodes à passer en retard + locataire et propriétaire
    const { data, error } = await supabase
      .from("rent_periods")
      .update({ status: "retard" })
      .eq("status", "en_cours")
      .lt("deadline_date", today)
      .select("id, amount_due, lease_id, leases!inner(tenant_id, properties!inner(name, owner_id))");

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

    // Envoyer une notification in-app + push pour locataire ET propriétaire
    if (updatedCount > 0 && data) {
      type RentPeriodRow = {
        id: string;
        amount_due: number;
        lease_id: string;
        leases: {
          tenant_id: string;
          properties: { name: string; owner_id: string } | { name: string; owner_id: string }[];
        } | {
          tenant_id: string;
          properties: { name: string; owner_id: string } | { name: string; owner_id: string }[];
        }[];
      };

      for (const period of data as RentPeriodRow[]) {
        const leaseData = Array.isArray(period.leases) ? period.leases[0] : period.leases;
        const tenantId = leaseData?.tenant_id;
        const prop = Array.isArray(leaseData?.properties) ? leaseData?.properties[0] : leaseData?.properties;
        const propName = prop?.name || "votre logement";
        const ownerId = prop?.owner_id;

        // Notification locataire
        if (tenantId) {
          await supabase.from("notifications").insert({
            user_id: tenantId,
            type: "retard",
            related_id: period.id,
            title: "Loyer en retard",
            body: `Votre loyer pour ${propName} est en retard. Veuillez régulariser votre situation dans l'application.`,
          });

          await sendPush(
            tenantId,
            "⚠️ Loyer en retard",
            `Votre loyer pour ${propName} est en retard. Régularisez votre situation sur ImoFlex.`
          );
        }

        // Notification propriétaire
        if (ownerId) {
          await supabase.from("notifications").insert({
            user_id: ownerId,
            type: "retard",
            related_id: period.id,
            title: "Retard de loyer signalé",
            body: `Le loyer pour ${propName} n'a pas été réglé à l'échéance.`,
          });

          await sendPush(
            ownerId,
            "⚠️ Retard de loyer",
            `Le loyer pour ${propName} n'a pas été réglé à l'échéance.`
          );
        }
      }
    }

    // 2. Rappels automatiques d'échéance (J-3 avant la date limite)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 3);
    const inThreeDays = targetDate.toISOString().split("T")[0];

    const { data: upcomingPeriods } = await supabase
      .from("rent_periods")
      .select("id, amount_due, deadline_date, lease_id, leases!inner(tenant_id, properties!inner(name))")
      .eq("status", "en_cours")
      .eq("deadline_date", inThreeDays);

    let remindersCount = 0;

    if (upcomingPeriods && upcomingPeriods.length > 0) {
      const periodIds = upcomingPeriods.map((p) => p.id);
      const { data: existingRappels } = await supabase
        .from("notifications")
        .select("related_id")
        .eq("type", "rappel")
        .in("related_id", periodIds);

      const alreadyNotified = new Set((existingRappels || []).map((r) => r.related_id));

      for (const period of upcomingPeriods as any[]) {
        if (alreadyNotified.has(period.id)) continue;

        const leaseData = Array.isArray(period.leases) ? period.leases[0] : period.leases;
        const tenantId = leaseData?.tenant_id;
        const prop = Array.isArray(leaseData?.properties) ? leaseData?.properties[0] : leaseData?.properties;
        const propName = prop?.name || "votre logement";

        if (!tenantId) continue;

        await supabase.from("notifications").insert({
          user_id: tenantId,
          type: "rappel",
          related_id: period.id,
          title: "Rappel d'échéance de loyer",
          body: `Votre loyer de ${Number(period.amount_due || 0).toLocaleString("fr-FR")} FCFA pour ${propName} arrive à échéance dans 3 jours.`,
        });

        await sendPush(
          tenantId,
          "⏰ Rappel de loyer",
          `Votre loyer pour ${propName} arrive à échéance dans 3 jours.`
        );

        remindersCount++;
      }
    }

    return new Response(
      JSON.stringify({
        updated_overdue: updatedCount,
        reminders_sent: remindersCount,
        date_checked: today,
      }),
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
