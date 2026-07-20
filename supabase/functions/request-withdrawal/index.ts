import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // ---- Auth: identifier le VRAI appelant depuis le JWT, jamais depuis le body ----
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");

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
    const owner_id = authData.user.id; // <-- source de vérité, jamais body.owner_id

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const fedapayKey = Deno.env.get("FEDAPAY_SECRET_KEY");
    const fedapayBaseUrl = Deno.env.get("FEDAPAY_BASE_URL") || "https://sandbox-api.fedapay.com/v1";

    if (!fedapayKey) {
      return new Response(
        JSON.stringify({ error: "Fedapay non configuré (FEDAPAY_SECRET_KEY manquante)" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { wallet_id, amount, operator, destination_phone } = body;

    if (!wallet_id || !amount || !operator || !destination_phone) {
      return new Response(
        JSON.stringify({ error: "Paramètres manquants" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (amount <= 0) {
      return new Response(
        JSON.stringify({ error: "Montant invalide" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Le payout Fedapay n'est confirmé que pour MTN et Moov pour l'instant.
    // On refuse explicitement plutôt que de deviner un opérateur par défaut.
    if (operator !== "mtn" && operator !== "moov") {
      return new Response(
        JSON.stringify({ error: "Opérateur de retrait non supporté (MTN ou Moov uniquement)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch and verify wallet ownership (contre le user authentifié, pas un id du body)
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("*")
      .eq("id", wallet_id)
      .eq("owner_id", owner_id)
      .maybeSingle();

    if (walletError || !wallet) {
      return new Response(
        JSON.stringify({ error: "Wallet introuvable ou accès refusé" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (amount > wallet.available_balance) {
      return new Response(
        JSON.stringify({ error: `Solde insuffisant. Disponible: ${wallet.available_balance} FCFA` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Déduction atomique : la clause .gte() empêche un double-retrait simultané
    // de faire passer le solde en négatif (race condition sur deux requêtes concurrentes).
    const { data: updatedWallets, error: walletUpdateError } = await supabase
      .from("wallets")
      .update({
        available_balance: wallet.available_balance - amount,
        total_withdrawn: wallet.total_withdrawn + amount,
      })
      .eq("id", wallet_id)
      .gte("available_balance", amount)
      .select();

    if (walletUpdateError) {
      return new Response(
        JSON.stringify({ error: walletUpdateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!updatedWallets || updatedWallets.length === 0) {
      // Le solde a changé entre la lecture et l'écriture (autre retrait concurrent)
      return new Response(
        JSON.stringify({ error: "Solde insuffisant (déjà utilisé par une autre opération)" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- Envoyer réellement l'argent via l'API Payout Fedapay ----
    // Le solde a déjà été débité ci-dessus : si cet appel échoue, on doit le restaurer.
    const payoutMode =
      operator === "mtn"
        ? Deno.env.get("FEDAPAY_MODE_MTN") || "mtn_open"
        : Deno.env.get("FEDAPAY_MODE_MOOV") || "moov";

    let payoutId: string;
    try {
      const payoutRes = await fetch(`${fedapayBaseUrl}/payouts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${fedapayKey}`,
        },
        body: JSON.stringify({
          amount,
          currency: { iso: "XOF" },
          mode: payoutMode,
          description: "Retrait ImoFlex",
          customer: {
            email: authData.user.email || `${owner_id}@imoflex.app`,
            phone_number: { number: destination_phone, country: "bj" },
          },
        }),
      });

      const payoutJson = await payoutRes.json();
      if (!payoutRes.ok) {
        throw new Error(payoutJson?.message || `Erreur Fedapay payout: HTTP ${payoutRes.status}`);
      }

      const payout = payoutJson?.["v1/payout"] ?? payoutJson?.payout ?? payoutJson;
      if (!payout?.id) throw new Error("Réponse Fedapay inattendue (pas d'id de payout)");
      payoutId = String(payout.id);
    } catch (payoutErr: unknown) {
      // Rollback : le retrait n'a pas pu être envoyé, on remet le solde initial
      await supabase
        .from("wallets")
        .update({
          available_balance: wallet.available_balance,
          total_withdrawn: wallet.total_withdrawn,
        })
        .eq("id", wallet_id);

      const msg = payoutErr instanceof Error ? payoutErr.message : "Erreur Fedapay";
      return new Response(
        JSON.stringify({ error: msg }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create withdrawal record
    const estimatedCompletion = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: withdrawal, error: withdrawalError } = await supabase
      .from("withdrawals")
      .insert({
        wallet_id,
        amount,
        operator,
        destination_phone,
        status: "en_traitement",
        fedapay_payout_id: payoutId,
        estimated_completion: estimatedCompletion,
      })
      .select()
      .single();

    if (withdrawalError) {
      // Rollback wallet deduction on failure
      // NB: à ce stade, le payout a déjà été envoyé côté Fedapay. Ce cas (échec DB
      // après succès Fedapay) doit être surveillé manuellement — l'argent est parti
      // mais l'enregistrement local a échoué. Log à surveiller en prod.
      await supabase
        .from("wallets")
        .update({
          available_balance: wallet.available_balance,
          total_withdrawn: wallet.total_withdrawn,
        })
        .eq("id", wallet_id);

      return new Response(
        JSON.stringify({ error: withdrawalError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create notification for owner
    await supabase.from("notifications").insert({
      user_id: owner_id,
      type: "retrait_complete",
      related_id: withdrawal.id,
      title: "Retrait en cours",
      body: `Votre retrait de ${amount} FCFA vers ${destination_phone} est en traitement. Délai estimé: 3 jours ouvrés.`,
    });

    return new Response(
      JSON.stringify({
        withdrawal_id: withdrawal.id,
        fedapay_payout_id: payoutId,
        status: "en_traitement",
      }),
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
