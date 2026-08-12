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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Date du jour au format YYYY-MM-DD (UTC)
    const today = new Date().toISOString().split("T")[0];

    // Met à jour en "retard" toutes les périodes en_cours dont la deadline est dépassée
    const { data, error } = await supabase
      .from("rent_periods")
      .update({ status: "retard" })
      .eq("status", "en_cours")
      .lt("deadline_date", today)
      .select("id");

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
