import { supabase } from './supabase';
import { Operator } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Normalise un numéro de téléphone béninois au nouveau format 10 chiffres.
 * FedaPay exige le format { number: "0161000000", country: "BJ" } pour déclencher le Push USSD.
 * Cette fonction retire tout préfixe international (+229 ou 229).
 * Si le numéro fait 8 chiffres (ancien format), on lui ajoute le préfixe "01".
 *
 * Exemples :
 *   "+22997000000" → "97000000" → "0197000000"
 *   "229 01 97 00 00 00" → "0197000000"
 *   "01 97 00 00 00" → "0197000000"
 *   "97000000" → "0197000000"
 */
export function normalizeBjPhone(raw: string): string {
  // Retirer espaces, tirets, parenthèses
  let cleaned = raw.replace(/[\s\-().]/g, '');

  // Retirer le signe + si présent
  if (cleaned.startsWith('+')) cleaned = cleaned.slice(1);

  // Retirer le préfixe pays béninois : 229
  if (cleaned.startsWith('229')) cleaned = cleaned.slice(3);

  // Ajout du préfixe '01' si l'utilisateur a entré l'ancien format à 8 chiffres
  if (cleaned.length === 8) {
    cleaned = '01' + cleaned;
  }

  return cleaned; // Doit être 10 chiffres (commençant par 01)
}

async function callEdgeFunction<T>(
  slug: string,
  body: object,
  maxRetries = 2
): Promise<T> {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token || SUPABASE_ANON_KEY;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Backoff exponentiel entre les tentatives : 0ms, 800ms, 1600ms
    if (attempt > 0) {
      await new Promise(resolve => setTimeout(resolve, attempt * 800));
    }

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/${slug}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        // Ne pas retenter sur les erreurs client (4xx) sauf timeout
        if (response.status >= 400 && response.status < 500) {
          throw new Error(err.error || `Erreur serveur (${response.status})`);
        }
        lastError = new Error(err.error || `Erreur serveur (${response.status})`);
        continue; // Retenter sur les erreurs 5xx
      }

      const data = await response.json();
      if (data.error) throw new Error(data.error);
      return data as T;

    } catch (err: any) {
      // Erreur réseau (fetch échoue) → retenter
      if (err?.name === 'TypeError' || err?.message?.includes('Failed to fetch')) {
        lastError = err;
        continue;
      }
      throw err; // Erreur applicative → ne pas retenter
    }
  }

  throw lastError || new Error('Échec après plusieurs tentatives. Vérifiez votre connexion.');
}

export interface InitiatePaymentParams {
  amount: number;
  operator: Operator;
  rent_period_id: string;
  phone_number: string;
  idempotency_key?: string;
}

export interface InitiatePaymentResult {
  payment_id: string;
  fedapay_transaction_id: string;
  status: string;
  payment_url?: string;
}

export async function initiatePayment(
  params: InitiatePaymentParams
): Promise<InitiatePaymentResult> {
  // 🔴 CORRECTIF CRITIQUE : Normalisation du numéro au format FedaPay Push USSD 10 chiffres
  const normalizedPhone = normalizeBjPhone(params.phone_number);

  if (normalizedPhone.length !== 10) {
    throw new Error(`Numéro invalide : "${params.phone_number}". Entrez 10 chiffres locaux (ex: 0197000000)`);
  }

  const payload = {
    amount: params.amount,
    operator: params.operator,
    rent_period_id: params.rent_period_id,
    phone_number: normalizedPhone,
    idempotency_key: params.idempotency_key || crypto.randomUUID(),
  };

  return callEdgeFunction<InitiatePaymentResult>('initiate-payment', payload);
}

export interface RequestWithdrawalParams {
  wallet_id: string;
  amount: number;
  operator: Operator;
  destination_phone: string;
}

export interface RequestWithdrawalResult {
  withdrawal_id: string;
  fedapay_payout_id: string;
  status: string;
}

export async function requestWithdrawal(
  params: RequestWithdrawalParams
): Promise<RequestWithdrawalResult> {
  // 🔴 CORRECTIF CRITIQUE : Même normalisation pour les retraits Propriétaire
  const normalizedPhone = normalizeBjPhone(params.destination_phone);

  if (normalizedPhone.length !== 10) {
    throw new Error(`Numéro invalide : "${params.destination_phone}". Entrez 10 chiffres locaux (ex: 0197000000)`);
  }

  const payload = {
    wallet_id: params.wallet_id,
    amount: params.amount,
    operator: params.operator,
    destination_phone: normalizedPhone,
  };

  return callEdgeFunction<RequestWithdrawalResult>('request-withdrawal', payload);
}
