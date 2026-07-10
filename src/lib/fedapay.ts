import { supabase } from './supabase';
import { Operator } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
  return callEdgeFunction<InitiatePaymentResult>('initiate-payment', params);
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
  return callEdgeFunction<RequestWithdrawalResult>('request-withdrawal', params);
}
