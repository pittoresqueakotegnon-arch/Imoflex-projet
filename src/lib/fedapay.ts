import { supabase } from './supabase';
import { Operator } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Normalise un numéro de téléphone béninois en 8 chiffres locaux.
 * FedaPay exige le format { number: "61000000", country: "BJ" } pour déclencher le Push USSD.
 * Cette fonction retire tout préfixe international (+229 ou 229) pour ne garder que les 8 chiffres.
 *
 * Exemples :
 *   "+22997000000" → "97000000"
 *   "229 97 00 00 00" → "97000000"
 *   "97000000" → "97000000"
 */
export function normalizeBjPhone(raw: string): string {
  // Retirer espaces, tirets, parenthèses
  let cleaned = raw.replace(/[\s\-().]/g, '');

  // Retirer le signe + si présent
  if (cleaned.startsWith('+')) cleaned = cleaned.slice(1);

  // Retirer le préfixe pays béninois : 229
  if (cleaned.startsWith('229')) cleaned = cleaned.slice(3);

  // Retirer le zéro d'appel national éventuel
  if (cleaned.startsWith('0') && cleaned.length === 9) cleaned = cleaned.slice(1);

  return cleaned; // Doit être 8 chiffres
}

async function callEdgeFunction<T>(
  slug: string,
  body: object
): Promise<T> {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token || SUPABASE_ANON_KEY;

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
    throw new Error(err.error || `Erreur serveur (${response.status})`);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data as T;
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
  // 🔴 CORRECTIF CRITIQUE : Normalisation du numéro au format FedaPay Push USSD
  // FedaPay exige : { number: "8 chiffres locaux", country: "BJ" }
  const normalizedPhone = normalizeBjPhone(params.phone_number);

  if (normalizedPhone.length !== 8) {
    throw new Error(`Numéro invalide : "${params.phone_number}" → "${normalizedPhone}". Entrez 8 chiffres locaux (ex: 97000000)`);
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

  if (normalizedPhone.length !== 8) {
    throw new Error(`Numéro invalide : "${params.destination_phone}". Entrez 8 chiffres locaux (ex: 97000000)`);
  }

  const payload = {
    wallet_id: params.wallet_id,
    amount: params.amount,
    operator: params.operator,
    destination_phone: normalizedPhone,
  };

  return callEdgeFunction<RequestWithdrawalResult>('request-withdrawal', payload);
}
