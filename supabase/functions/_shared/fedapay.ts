// Helper partagé pour les appels à l'API Fedapay.
//
// ⚠️ IMPORTANT AVANT DE PASSER EN PROD ⚠️
// La forme exacte de la réponse JSON de Fedapay peut varier légèrement
// selon la version d'API de ton compte. Teste d'abord en sandbox avec un
// petit montant (100 FCFA) et regarde les logs de la Edge Function
// (`supabase functions logs initiate-payment`) : si `transactionId` ou
// `paymentUrl` ressortent `undefined`, colle-moi la réponse JSON brute et
// j'ajuste l'extraction en 2 minutes.

const FEDAPAY_BASE_URL = Deno.env.get("FEDAPAY_BASE_URL") || "https://sandbox-api.fedapay.com/v1";

// Codes de "mode" Fedapay pour le push Mobile Money sans redirection.
// Vérifiables/ajustables dans le dashboard Fedapay (Paramètres > API) si besoin.
export const FEDAPAY_MODES: Record<string, string> = {
  mtn: Deno.env.get("FEDAPAY_MODE_MTN") || "mtn_open",
  moov: Deno.env.get("FEDAPAY_MODE_MOOV") || "moov",
};

function extractResource(json: any, singularKey: string): any {
  // Fedapay enveloppe parfois la ressource sous une clé du type "v1/transaction".
  // On essaie plusieurs formes connues avant de retomber sur l'objet brut.
  return (
    json?.[`v1/${singularKey}`] ??
    json?.[singularKey] ??
    json
  );
}

export async function createTransaction(params: {
  amount: number;
  description: string;
  email: string;
  phoneNumber: string;
  callbackUrl?: string;
}): Promise<{ id: string | number; raw: any }> {
  const fedapayKey = Deno.env.get("FEDAPAY_SECRET_KEY");
  if (!fedapayKey) throw new Error("FEDAPAY_SECRET_KEY non configurée");

  const res = await fetch(`${FEDAPAY_BASE_URL}/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${fedapayKey}`,
    },
    body: JSON.stringify({
      description: params.description,
      amount: params.amount,
      currency: { iso: "XOF" },
      callback_url: params.callbackUrl,
      customer: {
        email: params.email,
        phone_number: { number: params.phoneNumber, country: "bj" },
      },
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.message || `Erreur Fedapay (création transaction): HTTP ${res.status}`);
  }

  const tx = extractResource(json, "transaction");
  if (!tx?.id) throw new Error("Réponse Fedapay inattendue (pas d'id de transaction)");

  return { id: tx.id, raw: json };
}

export async function generateToken(
  transactionId: string | number
): Promise<{ token: string; paymentUrl?: string }> {
  const fedapayKey = Deno.env.get("FEDAPAY_SECRET_KEY")!;

  const res = await fetch(`${FEDAPAY_BASE_URL}/transactions/${transactionId}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${fedapayKey}`,
    },
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.message || `Erreur Fedapay (génération token): HTTP ${res.status}`);
  }

  const tokenData = extractResource(json, "token");
  return { token: tokenData.token, paymentUrl: tokenData.url };
}

// Push Mobile Money direct (sans redirection). Uniquement MTN/Moov Bénin.
export async function sendDirectPush(
  mode: string,
  token: string,
  phoneNumber: string
): Promise<any> {
  const fedapayKey = Deno.env.get("FEDAPAY_SECRET_KEY")!;

  const res = await fetch(`${FEDAPAY_BASE_URL}/${mode}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${fedapayKey}`,
    },
    body: JSON.stringify({
      token,
      phone_number: { number: phoneNumber, country: "bj" },
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.message || `Erreur Fedapay (push ${mode}): HTTP ${res.status}`);
  }
  return json;
}
