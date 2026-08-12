import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Méthode non autorisée" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // ---- Étape 1 : Vérification du JWT appelant ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Non authentifié" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const jwt = authHeader.replace("Bearer ", "");
    
    // Client anon pour valider le JWT
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

    const callerId = authData.user.id;

    // ---- Étape 2 : Client service_role pour la sécurité et requêtes ---
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Vérifier que l'utilisateur est bien admin
    const { data: userProfile, error: userError } = await serviceClient
      .from('users')
      .select('role')
      .eq('id', callerId)
      .single();

    if (userError || userProfile?.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: "Accès refusé. Réservé aux administrateurs." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- Étape 3 : Requêtes de santé ----
    const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

    // 3.1 Paiements suspects (en attente depuis > 20 min)
    const { data: pendingPayments, error: paymentsError } = await serviceClient
      .from('payments')
      .select('id, fedapay_transaction_id, amount, created_at, tenant:users!payments_tenant_id_fkey(full_name)')
      .eq('status', 'en_attente')
      .lt('created_at', twentyMinsAgo)
      .order('created_at', { ascending: true });

    if (paymentsError) console.error("Erreur paiements:", paymentsError);

    // 3.2 Retraits en échec ou bloqués (> 5 jours en traitement)
    const { data: problematicWithdrawals, error: withdrawalsError } = await serviceClient
      .from('withdrawals')
      .select('id, amount, status, created_at, wallet:wallets(owner:users(full_name))')
      .or(`status.eq.echoue,and(status.eq.en_traitement,created_at.lt.${fiveDaysAgo})`)
      .order('created_at', { ascending: false });
    
    if (withdrawalsError) console.error("Erreur retraits:", withdrawalsError);

    // 3.3 État des crons (via fonction RPC RPC sécurisée service_role)
    const { data: cronHealth, error: cronError } = await serviceClient.rpc('admin_get_cron_health');

    if (cronError) console.error("Erreur crons:", cronError);

    // Formater la réponse
    const responseData = {
      pendingPayments: pendingPayments || [],
      failedWithdrawals: problematicWithdrawals || [],
      cronHealth: cronHealth || []
    };

    return new Response(
      JSON.stringify(responseData),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("Erreur inattendue :", err);
    return new Response(
      JSON.stringify({ error: "Erreur interne du serveur" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
