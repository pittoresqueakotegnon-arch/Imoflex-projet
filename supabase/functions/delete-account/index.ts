import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Supprime réellement le compte : anonymise le profil ET détruit l'utilisateur
// Auth (auth.admin.deleteUser) pour empêcher toute reconnexion — c'est cette
// deuxième partie qui manquait : anonymiser la ligne `users` seule ne bloque
// jamais l'accès, le compte Auth (email + mot de passe) restait actif.
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Non authentifié" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const jwt = authHeader.replace("Bearer ", "");

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );
    const { data: authData, error: authError } = await anonClient.auth.getUser(jwt);
    if (authError || !authData?.user) {
      return new Response(
        JSON.stringify({ error: "Session invalide" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const userId = authData.user.id;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Anonymiser le profil (garde l'historique référentiel : baux, paiements)
    const { error: updateErr } = await supabase
      .from("users")
      .update({
        is_active: false,
        full_name: "Compte supprimé",
        phone: null,
        mobile_money_number: null,
      })
      .eq("id", userId);

    if (updateErr) {
      console.error("Erreur anonymisation profil:", updateErr);
      return new Response(
        JSON.stringify({ error: "Échec de l'anonymisation du profil" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Détruire réellement le compte Auth — sans ça, l'utilisateur peut se
    // reconnecter immédiatement avec les mêmes identifiants après "suppression".
    const { error: deleteAuthErr } = await supabase.auth.admin.deleteUser(userId);
    if (deleteAuthErr) {
      console.error("Erreur suppression compte Auth:", deleteAuthErr);
      return new Response(
        JSON.stringify({ error: "Le profil a été anonymisé mais la suppression du compte a échoué. Contactez le support." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
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
