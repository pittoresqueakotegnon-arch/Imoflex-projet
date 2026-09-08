import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Méthode non autorisée" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // ---- Étape 1 : Vérification du JWT de l'appelant ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Non authentifié" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const jwt = authHeader.replace("Bearer ", "");

    // Client anon pour vérifier le JWT sans privilèges élevés
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );
    const { data: authData, error: authError } = await anonClient.auth.getUser(jwt);

    if (authError || !authData?.user) {
      return new Response(
        JSON.stringify({ error: "Non authentifié" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerId = authData.user.id; // Source de vérité — jamais le body

    // ---- Étape 2 : Client service_role pour les opérations DB ----
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ---- Étape 3 : Vérifier que l'utilisateur est bien propriétaire ----
    const { data: userProfile, error: profileError } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", callerId)
      .maybeSingle();

    if (profileError || !userProfile) {
      return new Response(
        JSON.stringify({ error: "Profil utilisateur introuvable" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (userProfile.role !== "proprietaire") {
      return new Response(
        JSON.stringify({ error: "Seuls les propriétaires peuvent avoir un wallet" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- Étape 4 : Retourner le wallet existant ou en créer un ----
    const { data: existing } = await supabase
      .from("wallets")
      .select("*")
      .eq("owner_id", callerId)
      .maybeSingle();

    if (existing) {
      // Le wallet existe déjà — on le renvoie directement (idempotent)
      return new Response(
        JSON.stringify({ wallet: existing, created: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Création du wallet à zéro via service_role (contourne RLS)
    const { data: created, error: insertError } = await supabase
      .from("wallets")
      .insert({
        owner_id: callerId,
        available_balance: 0,
        pending_balance: 0,
        total_earned: 0,
        total_withdrawn: 0,
      })
      .select()
      .single();

    if (insertError) {
      console.error("create-wallet insert error:", insertError.message);
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`create-wallet: wallet créé pour owner_id=${callerId}`);

    return new Response(
      JSON.stringify({ wallet: created, created: true }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur interne";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
