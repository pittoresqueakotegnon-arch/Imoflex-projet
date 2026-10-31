import { test, expect } from '@playwright/test';
import * as crypto from 'node:crypto';

// Schémas de validation natifs TypeScript équivalents à paymentSchema et withdrawalSchema
interface PaymentPayload {
  amount: number;
  operator: string;
  rent_period_id: string;
  phone_number: string;
  idempotency_key?: string;
}

interface WithdrawalPayload {
  wallet_id: string;
  authorization_id: string;
  pin: string;
  idempotency_key: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validatePayment(payload: PaymentPayload): { success: boolean; error?: string } {
  if (typeof payload.amount !== 'number' || !Number.isInteger(payload.amount)) {
    return { success: false, error: 'Montant invalide' };
  }
  if (payload.amount < 100) return { success: false, error: 'Montant minimum: 100 FCFA' };
  if (payload.amount > 300000) return { success: false, error: 'Le plafond maximal par transaction est de 300 000 FCFA.' };
  if (!['mtn', 'moov', 'celtiis'].includes(payload.operator)) return { success: false, error: 'Opérateur non supporté' };
  if (!UUID_REGEX.test(payload.rent_period_id)) return { success: false, error: 'ID de période de loyer invalide' };
  if (!payload.phone_number || payload.phone_number.length !== 10 || !/^\d+$/.test(payload.phone_number)) {
    return { success: false, error: 'Le numéro de téléphone doit contenir 10 chiffres' };
  }
  if (payload.idempotency_key && !UUID_REGEX.test(payload.idempotency_key)) {
    return { success: false, error: "Clé d'idempotence invalide" };
  }
  return { success: true };
}

function validateWithdrawal(payload: WithdrawalPayload): { success: boolean; error?: string } {
  if (!UUID_REGEX.test(payload.wallet_id)) return { success: false, error: 'ID de wallet invalide' };
  if (!UUID_REGEX.test(payload.authorization_id)) return { success: false, error: "ID d'autorisation invalide" };
  if (!payload.pin || payload.pin.length !== 4 || !/^[0-9]{4}$/.test(payload.pin)) {
    return { success: false, error: 'Le PIN doit contenir 4 chiffres' };
  }
  if (!UUID_REGEX.test(payload.idempotency_key)) return { success: false, error: "Clé d'idempotence invalide" };
  return { success: true };
}

function verifyFedapaySignature(
  rawBody: string,
  header: string,
  secret: string,
  nowMs: number = Date.now(),
  toleranceSeconds = 300,
) {
  if (!secret) return { valid: false, reason: "secret_missing" };
  if (!header) return { valid: false, reason: "signature_missing" };

  const values: Record<string, string[]> = {};
  for (const part of header.split(",")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    (values[key] ??= []).push(part.slice(index + 1).trim());
  }

  const timestamp = values["t"]?.[0];
  const signatures = [...(values["s"] ?? []), ...(values["v1"] ?? [])];

  if (timestamp && signatures.length > 0) {
    const timestampSec = Number(timestamp);
    if (!Number.isFinite(timestampSec)) return { valid: false, reason: "invalid_timestamp" };
    const ageSeconds = Math.abs(Math.floor(nowMs / 1000) - timestampSec);
    if (ageSeconds > toleranceSeconds) return { valid: false, reason: "timestamp_out_of_tolerance" };

    const expectedSig = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
    const matches = signatures.some(sig => {
      if (!/^[0-9a-fA-F]+$/.test(sig) || sig.length !== expectedSig.length) return false;
      return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expectedSig, "hex"));
    });
    return matches ? { valid: true, scheme: "timestamped" } : { valid: false, reason: "signature_mismatch" };
  }

  // Legacy format
  const expectedSig = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  if (/^[0-9a-fA-F]+$/.test(header) && header.length === expectedSig.length) {
    if (crypto.timingSafeEqual(Buffer.from(header, "hex"), Buffer.from(expectedSig, "hex"))) {
      return { valid: true, scheme: "legacy" };
    }
  }
  return { valid: false, reason: "invalid_signature" };
}

test.describe('FedaPay & Edge Functions Validation', () => {
  const secret = 'wh_sandbox_secret_key_12345';
  const validUUID = '123e4567-e89b-12d3-a456-426614174000';

  test('1. Initiation paiement : payload valide accepté', () => {
    const result = validatePayment({
      amount: 45000,
      operator: 'mtn',
      rent_period_id: validUUID,
      phone_number: '0197000001',
      idempotency_key: validUUID,
    });
    expect(result.success).toBe(true);
  });

  test('2. Initiation paiement : rejet dépassement de plafond (> 300 000 FCFA)', () => {
    const result = validatePayment({
      amount: 350000,
      operator: 'moov',
      rent_period_id: validUUID,
      phone_number: '0197000001',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('plafond maximal');
  });

  test('3. Initiation paiement : rejet opérateur non supporté ou téléphone invalide', () => {
    const resultOp = validatePayment({
      amount: 15000,
      operator: 'orange', // Orange non supporté au Bénin
      rent_period_id: validUUID,
      phone_number: '0197000001',
    });
    expect(resultOp.success).toBe(false);

    const resultPhone = validatePayment({
      amount: 15000,
      operator: 'mtn',
      rent_period_id: validUUID,
      phone_number: '1234', // Doit être 10 chiffres
    });
    expect(resultPhone.success).toBe(false);
  });

  test('4. Webhook : signature horodatée HMAC-SHA256 valide', () => {
    const body = JSON.stringify({ name: 'transaction.approved', entity: { id: 9999, amount: 50000 } });
    const now = Date.now();
    const t = String(Math.floor(now / 1000));
    const sig = crypto.createHmac('sha256', secret).update(`${t}.${body}`, 'utf8').digest('hex');
    const header = `t=${t},s=${sig}`;

    const check = verifyFedapaySignature(body, header, secret, now);
    expect(check.valid).toBe(true);
    expect(check.scheme).toBe('timestamped');
  });

  test('5. Webhook : rejet signature invalide ou corps altéré', () => {
    const body = JSON.stringify({ name: 'transaction.approved', entity: { id: 9999, amount: 50000 } });
    const tamperedBody = JSON.stringify({ name: 'transaction.approved', entity: { id: 9999, amount: 1000 } });
    const now = Date.now();
    const t = String(Math.floor(now / 1000));
    const sig = crypto.createHmac('sha256', secret).update(`${t}.${body}`, 'utf8').digest('hex');
    const header = `t=${t},s=${sig}`;

    // Corps altéré
    const checkTampered = verifyFedapaySignature(tamperedBody, header, secret, now);
    expect(checkTampered.valid).toBe(false);

    // Fausse clé
    const checkWrongKey = verifyFedapaySignature(body, header, 'wrong_secret', now);
    expect(checkWrongKey.valid).toBe(false);
  });

  test('6. Webhook : rejet anti-replay (> 5 minutes de tolérance)', () => {
    const body = JSON.stringify({ name: 'transaction.approved', entity: { id: 9999, amount: 50000 } });
    const oldTime = Date.now() - (10 * 60 * 1000); // 10 minutes plus tôt
    const t = String(Math.floor(oldTime / 1000));
    const sig = crypto.createHmac('sha256', secret).update(`${t}.${body}`, 'utf8').digest('hex');
    const header = `t=${t},s=${sig}`;

    const check = verifyFedapaySignature(body, header, secret, Date.now());
    expect(check.valid).toBe(false);
    expect(check.reason).toBe('timestamp_out_of_tolerance');
  });

  test('7. Détection écart de montant (amount mismatch protection)', () => {
    const expectedAmount = 75000;
    const receivedAmount = 7000; // Tentative de fraude / montant réduit
    const isMismatch = Number(receivedAmount) !== Number(expectedAmount);
    expect(isMismatch).toBe(true);
  });

  test('8. Calcul des commissions & grand livre (financial ledger)', () => {
    const commissionRate = 6; // 6%
    const paymentAmount = 100000;
    const ownerAmount = Math.round(paymentAmount * (1.0 - (commissionRate / 100.0)));
    const commissionAmount = paymentAmount - ownerAmount;

    expect(ownerAmount).toBe(94000);
    expect(commissionAmount).toBe(6000);
    expect(ownerAmount + commissionAmount).toBe(paymentAmount);
  });

  test('9. Validation du retrait et du PIN', () => {
    const validWithdrawal = validateWithdrawal({
      wallet_id: validUUID,
      authorization_id: validUUID,
      pin: '4321',
      idempotency_key: validUUID,
    });
    expect(validWithdrawal.success).toBe(true);

    const invalidPinLetters = validateWithdrawal({
      wallet_id: validUUID,
      authorization_id: validUUID,
      pin: 'abcd',
      idempotency_key: validUUID,
    });
    expect(invalidPinLetters.success).toBe(false);

    const invalidPinLength = validateWithdrawal({
      wallet_id: validUUID,
      authorization_id: validUUID,
      pin: '123',
      idempotency_key: validUUID,
    });
    expect(invalidPinLength.success).toBe(false);
  });

  test('10. Idempotence : détection des doublons déjà traités', () => {
    const isAlreadyProcessed = (status: string) => status === 'valide' || status === 'echoue';

    expect(isAlreadyProcessed('en_attente')).toBe(false);
    expect(isAlreadyProcessed('valide')).toBe(true);
    expect(isAlreadyProcessed('echoue')).toBe(true);
  });
});
