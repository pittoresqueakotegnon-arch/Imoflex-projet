import * as crypto from "node:crypto";
import { Buffer } from "node:buffer";

/**
 * Vérification de la signature des webhooks FedaPay.
 *
 * La documentation FedaPay indique que l'en-tête X-FEDAPAY-SIGNATURE contient un
 * horodatage vérifié avec la signature, et que les bibliothèques officielles
 * (Webhook.constructEvent) vérifient ce format. Cette fonction accepte :
 *   1) le format horodaté « t=<horodatage>,s=<signature> » (signature = HMAC-SHA256
 *      de « <horodatage>.<corps brut> ») avec une tolérance de 5 minutes ;
 *   2) l'ancien format du projet : HMAC-SHA256 hexadécimal du corps brut seul.
 * Le format horodaté doit être confirmé par un webhook réel (voir CORRECTIFS.md).
 */
export interface SignatureCheck {
  valid: boolean;
  scheme?: "timestamped" | "legacy";
  reason?: string;
}

function hmacHex(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  if (!/^[0-9a-fA-F]+$/.test(a) || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

export function verifyFedapaySignature(
  rawBody: string,
  header: string,
  secret: string,
  nowMs: number = Date.now(),
  toleranceSeconds = 300,
): SignatureCheck {
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
    const numeric = Number(timestamp);
    if (!Number.isFinite(numeric)) return { valid: false, reason: "timestamp_invalid" };
    const timestampMs = numeric > 1e12 ? numeric : numeric * 1000;
    if (Math.abs(nowMs - timestampMs) > toleranceSeconds * 1000) {
      return { valid: false, reason: "timestamp_out_of_tolerance" };
    }
    const expected = hmacHex(secret, `${timestamp}.${rawBody}`);
    return signatures.some((signature) => safeEqualHex(signature, expected))
      ? { valid: true, scheme: "timestamped" }
      : { valid: false, reason: "signature_mismatch" };
  }

  const legacyExpected = hmacHex(secret, rawBody);
  return safeEqualHex(header.trim(), legacyExpected)
    ? { valid: true, scheme: "legacy" }
    : { valid: false, reason: "signature_mismatch" };
}
