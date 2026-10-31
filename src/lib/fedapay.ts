import { supabase } from './supabase';
import { Operator } from './supabase';

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

export async function callEdgeFunction<T>(
  slug: string,
  body: object,
  maxRetries = 2
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise(resolve => setTimeout(resolve, attempt * 800));
    }

    try {
      const { data, error } = await supabase.functions.invoke(slug, {
        body,
      });

      if (error) {
        let errorMsg = error.message;

        // Extraire la réponse détaillée du backend (ex: { error, details })
        if (error && typeof (error as any).context?.json === 'function') {
          try {
            const bodyErr = await (error as any).context.json();
            errorMsg = bodyErr.details || bodyErr.error || bodyErr.message || errorMsg;
          } catch {
            // Ignorer l'échec de parsing JSON
          }
        }

        // Si 401 Unauthorized
        if ((error as any).context?.status === 401 || errorMsg.includes('Non authentifié') || errorMsg.includes('JWT')) {
          throw new Error('Votre session a expiré. Veuillez vous reconnecter pour continuer.');
        }

        // Si 400 Bad Request ou erreur de validation (ne pas retenter)
        if (
          (error as any).context?.status === 400 ||
          errorMsg.includes('plafond') ||
          errorMsg.includes('invalide') ||
          errorMsg.includes('minimum')
        ) {
          throw new Error(errorMsg);
        }

        lastError = new Error(errorMsg);
        continue;
      }

      if ((data as any)?.error) {
        throw new Error((data as any).error);
      }

      return data as T;
    } catch (err: any) {
      // Erreurs applicatives non récupérables : ne pas retenter
      const msg = err?.message || '';
      if (
        msg.includes('plafond') ||
        msg.includes('invalide') ||
        msg.includes('session a expiré') ||
        msg.includes('minimum')
      ) {
        throw err;
      }

      lastError = err;
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
  authorization_id: string;
  pin: string;
  idempotency_key: string;
}

export interface RequestWithdrawalResult {
  withdrawal_id: string;
  fedapay_payout_id?: string;
  status: string;
}

export async function requestWithdrawal(
  params: RequestWithdrawalParams
): Promise<RequestWithdrawalResult> {
  const payload = {
    wallet_id: params.wallet_id,
    authorization_id: params.authorization_id,
    pin: params.pin,
    idempotency_key: params.idempotency_key,
  };

  // Un retrait déclenche un mouvement d'argent : le serveur garantit
  // l'idempotence, mais le client ne doit pas le rejouer automatiquement.
  return callEdgeFunction<RequestWithdrawalResult>('request-withdrawal', payload, 0);
}

export interface CheckPaymentStatusResult {
  status: string;
  synced: boolean;
  already_final?: boolean;
  fedapay_status?: string;
  message?: string;
}

/**
 * Interroge directement l'API FedaPay (via Edge Function) pour synchroniser
 * manuellement le statut d'un paiement en attente.
 * À appeler quand le locataire est bloqué en attente USSD > 45 secondes.
 * L'appel est limité à 3 fois par minute côté serveur.
 */
export async function checkPaymentStatus(
  paymentId: string
): Promise<CheckPaymentStatusResult> {
  return callEdgeFunction<CheckPaymentStatusResult>(
    'check-payment-status',
    { payment_id: paymentId },
    0 // Pas de retry automatique côté client pour cette opération
  );
}
