import { fetchWithRetry } from "./security.ts";

/**
 * Helpers FedaPay pour les payouts.
 *
 * Rappel (documentation FedaPay) : un payout créé par POST /payouts est « pending ».
 * Il n'est réellement envoyé qu'après un appel PUT /payouts/start.
 * La référence marchande (merchant_reference) permet de retrouver un payout
 * (GET /payouts/merchant/{reference}) même si l'identifiant FedaPay est inconnu.
 *
 * NB : dans fetchWithRetry, `maxRetries` est le nombre total de tentatives.
 * Les écritures (POST/PUT) utilisent donc maxRetries: 1 (aucune relance).
 */

export type PayoutOutcome = "sent" | "failed" | "pending";

export function getFedapayBaseUrl(): string {
  return Deno.env.get("FEDAPAY_BASE_URL") || "https://api.fedapay.com/v1";
}

export function classifyPayoutStatus(status: unknown): PayoutOutcome {
  const value = String(status ?? "").toLowerCase();
  if (["sent", "approved", "success", "completed"].includes(value)) return "sent";
  if (["failed", "declined", "canceled", "cancelled"].includes(value)) return "failed";
  return "pending";
}

export function unwrapPayout(json: unknown): Record<string, unknown> {
  const value = json as Record<string, unknown> | null;
  return (value?.["v1/payout"] ?? value?.["payout"] ?? value ?? {}) as Record<string, unknown>;
}

function authHeaders(apiKey: string): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 200);
  }
}

/** Lance l'envoi d'un payout créé (PUT /payouts/start). */
export async function startPayout(
  apiKey: string,
  payoutId: string,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const id = /^\d+$/.test(payoutId) ? Number(payoutId) : payoutId;
  const res = await fetchWithRetry(
    `${getFedapayBaseUrl()}/payouts/start`,
    {
      method: "PUT",
      headers: authHeaders(apiKey),
      body: JSON.stringify({ payouts: [{ id }] }),
    },
    { maxRetries: 1, timeoutMs: 15000, retryDelayMs: 0 },
  );
  return { ok: res.ok, status: res.status, body: await readJson(res) };
}

/** Lit un payout par identifiant FedaPay. */
export async function fetchPayoutById(
  apiKey: string,
  payoutId: string,
): Promise<{ status: number; payout: Record<string, unknown> | null }> {
  const res = await fetchWithRetry(
    `${getFedapayBaseUrl()}/payouts/${encodeURIComponent(payoutId)}`,
    { method: "GET", headers: authHeaders(apiKey) },
    { maxRetries: 2, timeoutMs: 10000, retryDelayMs: 300 },
  );
  if (!res.ok) return { status: res.status, payout: null };
  return { status: res.status, payout: unwrapPayout(await readJson(res)) };
}

/** Retrouve un payout par référence marchande (identifiant du retrait ImoFlex). */
export async function fetchPayoutByReference(
  apiKey: string,
  reference: string,
): Promise<{ status: number; payout: Record<string, unknown> | null }> {
  const res = await fetchWithRetry(
    `${getFedapayBaseUrl()}/payouts/merchant/${encodeURIComponent(reference)}`,
    { method: "GET", headers: authHeaders(apiKey) },
    { maxRetries: 2, timeoutMs: 10000, retryDelayMs: 300 },
  );
  if (!res.ok) return { status: res.status, payout: null };
  return { status: res.status, payout: unwrapPayout(await readJson(res)) };
}
