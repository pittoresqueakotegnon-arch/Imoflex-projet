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

    const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
    const refuse = (error: string, code: string) =>
      new Response(JSON.stringify({ error, code }), { status: 409, headers: jsonHeaders });

    // 0. Contrôles préalables : aucune suppression tant que de l'argent ou un bail est en jeu
    const { data: wallet } = await supabase
      .from("wallets")
      .select("id, available_balance")
      .eq("owner_id", userId)
      .maybeSingle();

    if (wallet && Number(wallet.available_balance) > 0) {
      return refuse(
        `Votre wallet contient ${wallet.available_balance} FCFA. Retirez vos fonds avant de supprimer votre compte.`,
        "wallet_not_empty",
      );
    }
    if (wallet) {
      const { count: pendingWithdrawals } = await supabase
        .from("withdrawals")
        .select("id", { count: "exact", head: true })
        .eq("wallet_id", wallet.id)
        .eq("status", "en_traitement");
      if ((pendingWithdrawals ?? 0) > 0) {
        return refuse("Un retrait est en cours de traitement. Réessayez une fois celui-ci terminé.", "withdrawal_pending");
      }
    }

    const { count: activeTenantLeases } = await supabase
      .from("leases")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", userId)
      .eq("status", "actif");
    if ((activeTenantLeases ?? 0) > 0) {
      return refuse("Vous avez un bail actif. Il doit être terminé avant de supprimer votre compte.", "active_lease");
    }

    const { data: ownedProperties } = await supabase.from("properties").select("id").eq("owner_id", userId);
    const ownedPropertyIds = (ownedProperties ?? []).map((property: { id: string }) => property.id);
    let ownerHasLeases = false;
    if (ownedPropertyIds.length > 0) {
      const { count: activeOwnerLeases } = await supabase
        .from("leases")
        .select("id", { count: "exact", head: true })
        .in("property_id", ownedPropertyIds)
        .eq("status", "actif");
      if ((activeOwnerLeases ?? 0) > 0) {
        return refuse("Un de vos logements a un locataire actif. Terminez le bail avant de supprimer votre compte.", "active_lease");
      }
      const { count: allOwnerLeases } = await supabase
        .from("leases")
        .select("id", { count: "exact", head: true })
        .in("property_id", ownedPropertyIds);
      ownerHasLeases = (allOwnerLeases ?? 0) > 0;
    }

    const { count: pendingPayments } = await supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", userId)
      .eq("status", "en_attente");
    if ((pendingPayments ?? 0) > 0) {
      return refuse("Un paiement est en attente de confirmation. Réessayez une fois celui-ci terminé.", "payment_pending");
    }

    const { count: tenantLeaseCount } = await supabase
      .from("leases")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", userId);
    const { count: tenantPaymentCount } = await supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", userId);

    // Historique financier ou locatif à conserver : on anonymise et on désactive le compte
    // au lieu de le supprimer (les clés étrangères RESTRICT interdisent de supprimer ces lignes).
    const hasHistory = (tenantLeaseCount ?? 0) > 0 || (tenantPaymentCount ?? 0) > 0 || !!wallet || ownerHasLeases;
    const anonymizedEmail = `deleted-${userId}@imoflex.invalid`;

    // 1. Anonymiser le profil (y compris l'e-mail)
    const { error: updateErr } = await supabase
      .from("users")
      .update({
        is_active: false,
        full_name: "Compte supprimé",
        phone: null,
        mobile_money_number: null,
        email: anonymizedEmail,
        avatar_url: null,
        fcm_token: null,
      })
      .eq("id", userId);

    if (updateErr) {
      console.error("Erreur anonymisation profil:", updateErr);
      return new Response(
        JSON.stringify({ error: "Échec de l'anonymisation du profil" }),
        { status: 500, headers: jsonHeaders }
      );
    }

    // 2. Empêcher toute reconnexion
    try {
      await supabase.auth.admin.signOut(jwt, "global");
    } catch (signOutErr) {
      console.warn("Révocation des sessions impossible (non bloquant):", signOutErr);
    }

    if (hasHistory) {
      const { error: banErr } = await supabase.auth.admin.updateUserById(userId, {
        email: anonymizedEmail,
        email_confirm: true,
        password: `${crypto.randomUUID()}${crypto.randomUUID()}`,
        ban_duration: "876000h",
        user_metadata: {},
      });
      if (banErr) {
        console.error("Erreur désactivation compte Auth:", banErr);
        return new Response(
          JSON.stringify({ error: "Le profil a été anonymisé mais la désactivation du compte a échoué. Contactez le support." }),
          { status: 500, headers: jsonHeaders }
        );
      }
      return new Response(JSON.stringify({ success: true, mode: "anonymized" }), { status: 200, headers: jsonHeaders });
    }

    const { error: deleteAuthErr } = await supabase.auth.admin.deleteUser(userId);
    if (deleteAuthErr) {
      console.error("Erreur suppression compte Auth:", deleteAuthErr);
      return new Response(
        JSON.stringify({ error: "Le profil a été anonymisé mais la suppression du compte a échoué. Contactez le support." }),
        { status: 500, headers: jsonHeaders }
      );
    }

    return new Response(JSON.stringify({ success: true, mode: "deleted" }), { status: 200, headers: jsonHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur interne";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
