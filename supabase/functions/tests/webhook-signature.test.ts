import { verifyFedapaySignature } from "../_shared/webhook_signature.ts";
import * as crypto from "node:crypto";

const secret = "wh_test_secret";
const body = JSON.stringify({ name: "transaction.approved", entity: { id: 1 } });
const hmac = (payload: string) => crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
const now = 1_700_000_000_000;
const t = String(Math.floor(now / 1000));

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("Signature horodatée valide", () => {
  const header = `t=${t},s=${hmac(`${t}.${body}`)}`;
  const result = verifyFedapaySignature(body, header, secret, now);
  assert(result.valid && result.scheme === "timestamped", "doit être valide");
});

Deno.test("Signature horodatée trop ancienne", () => {
  const header = `t=${t},s=${hmac(`${t}.${body}`)}`;
  const result = verifyFedapaySignature(body, header, secret, now + 10 * 60 * 1000);
  assert(!result.valid && result.reason === "timestamp_out_of_tolerance", "doit être refusée");
});

Deno.test("Corps modifié", () => {
  const header = `t=${t},s=${hmac(`${t}.${body}`)}`;
  const result = verifyFedapaySignature(body + " ", header, secret, now);
  assert(!result.valid, "doit être refusée");
});

Deno.test("Ancien format (HMAC du corps) accepté", () => {
  const result = verifyFedapaySignature(body, hmac(body), secret, now);
  assert(result.valid && result.scheme === "legacy", "doit être valide");
});

Deno.test("Signature absente ou secret absent", () => {
  assert(!verifyFedapaySignature(body, "", secret, now).valid, "signature absente");
  assert(!verifyFedapaySignature(body, hmac(body), "", now).valid, "secret absent");
});
