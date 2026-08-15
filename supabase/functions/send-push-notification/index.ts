import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * send-push-notification — Edge Function ImoFlex
 *
 * Envoie une notification push native via Firebase Cloud Messaging (FCM HTTP v1).
 * Doit être appelée en interne (par d'autres Edge Functions) avec la service role key.
 *
 * Body attendu (JSON):
 * {
 *   user_id: string,       // Destinataire
 *   title: string,         // Titre de la notification
 *   body: string,          // Corps du message
 *   data?: Record<string, string>  // Données supplémentaires (optionnel)
 * }
 *
 * Variables d'environnement requises:
 *   FIREBASE_PROJECT_ID          — ID du projet Firebase (ex: imoflex-app)
 *   FIREBASE_SERVICE_ACCOUNT_KEY — JSON stringifié de la clé de service Firebase
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ── Helper : obtenir un access token OAuth2 pour FCM HTTP v1 ─────────────────
async function getFcmAccessToken(serviceAccountJson: string): Promise<string> {
  const serviceAccount = JSON.parse(serviceAccountJson);

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  };

  // Encoder en base64url
  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  // Importer la clé privée RSA
  const pemKey = serviceAccount.private_key as string;
  const pemBody = pemKey.replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const keyBuffer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const jwt = `${signingInput}.${sigB64}`;

  // Échanger le JWT contre un access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`Impossible d'obtenir le token FCM: ${JSON.stringify(tokenData)}`);
  }

  return tokenData.access_token;
}

// ── Handler principal ─────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Méthode non autorisée" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID");
    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_KEY");

    if (!firebaseProjectId || !serviceAccountJson) {
      console.warn("send-push-notification: Firebase non configuré, notification ignorée.");
      return new Response(JSON.stringify({ skipped: true, reason: "firebase_not_configured" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id, title, body, data } = await req.json() as {
      user_id: string;
      title: string;
      body: string;
      data?: Record<string, string>;
    };

    if (!user_id || !title || !body) {
      return new Response(JSON.stringify({ error: "user_id, title et body sont requis" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Récupérer le token FCM de l'utilisateur
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("fcm_token")
      .eq("id", user_id)
      .maybeSingle();

    if (userError) {
      throw userError;
    }

    if (!user?.fcm_token) {
      // Pas de token — l'utilisateur n'a pas encore accordé les permissions
      return new Response(JSON.stringify({ skipped: true, reason: "no_fcm_token" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Obtenir le token OAuth2 pour FCM HTTP v1
    const accessToken = await getFcmAccessToken(serviceAccountJson);

    // Construire le message FCM
    const fcmMessage = {
      message: {
        token: user.fcm_token,
        notification: { title, body },
        android: {
          notification: {
            icon: "ic_notification",
            color: "#7C3AED",
            channel_id: "imoflex_default",
          },
        },
        data: data || {},
      },
    };

    // Envoyer via FCM HTTP v1
    const fcmRes = await fetch(
      `https://fcm.googleapis.com/v1/projects/${firebaseProjectId}/messages:send`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(fcmMessage),
      }
    );

    const fcmData = await fcmRes.json();

    if (!fcmRes.ok) {
      // Si le token est invalide/expiré, on le supprime pour ne pas réessayer
      if (fcmData?.error?.details?.some((d: { errorCode: string }) => d.errorCode === "UNREGISTERED")) {
        await supabase.from("users").update({ fcm_token: null }).eq("id", user_id);
        console.warn(`send-push-notification: token FCM supprimé pour user ${user_id} (UNREGISTERED).`);
      }
      console.error("FCM Error:", JSON.stringify(fcmData));
      return new Response(JSON.stringify({ error: "FCM a renvoyé une erreur", details: fcmData }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`send-push-notification: notification envoyée à ${user_id}. FCM message_id: ${fcmData.name}`);

    return new Response(JSON.stringify({ sent: true, fcm_message_id: fcmData.name }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur interne";
    console.error("send-push-notification fatal error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
