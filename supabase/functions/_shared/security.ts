/**
 * Shared security utilities for ImoFlex Edge Functions
 * - Log sanitization (phone masking, token redacting)
 * - Circuit breaker (fetch with retry + 503 fallback)
 */

// ---- Log Sanitization ----

/** Masque un numéro de téléphone : garde le préfixe, cache le milieu, affiche 2 derniers chiffres */
export function maskPhone(phone: string): string {
  if (!phone) return "[no-phone]";
  const clean = phone.replace(/\s/g, "");
  if (clean.length <= 4) return "***";
  // Ex: +22997123456 -> +229***56
  const prefix = clean.slice(0, Math.min(4, clean.length - 2));
  const suffix = clean.slice(-2);
  return `${prefix}***${suffix}`;
}

/** Caviarde un token JWT ou secret (garde les 6 premiers et 4 derniers chars) */
export function maskToken(token: string): string {
  if (!token) return "[no-token]";
  if (token.length <= 12) return "***redacted***";
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

/** Remplace récursivement les valeurs sensibles dans un objet avant logging */
export function sanitizeForLog(obj: unknown, depth = 0): unknown {
  if (depth > 5) return "[deep]";
  if (typeof obj === "string") {
    // Tokens JWT (eyJ...)
    if (obj.startsWith("eyJ")) return maskToken(obj);
    // Numéros de téléphone (contient au moins 8 chiffres)
    if (/^\+?\d[\d\s-]{7,}$/.test(obj)) return maskPhone(obj);
    return obj;
  }
  if (Array.isArray(obj)) return obj.map((v) => sanitizeForLog(v, depth + 1));
  if (obj && typeof obj === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      const lk = key.toLowerCase();
      if (["token", "secret", "key", "password", "authorization"].some((k) => lk.includes(k))) {
        sanitized[key] = "***redacted***";
      } else if (["phone", "mobile", "tel", "destination"].some((k) => lk.includes(k))) {
        sanitized[key] = typeof val === "string" ? maskPhone(val) : "***";
      } else {
        sanitized[key] = sanitizeForLog(val, depth + 1);
      }
    }
    return sanitized;
  }
  return obj;
}

export function safeLog(label: string, data: unknown): void {
  console.log(label, JSON.stringify(sanitizeForLog(data)));
}

// ---- Circuit Breaker / Fetch with Retry ----

interface FetchWithRetryOptions {
  maxRetries?: number;        // défaut : 3
  timeoutMs?: number;         // défaut : 10000
  retryDelayMs?: number;      // délai fixe entre tentatives
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const { maxRetries = 3, timeoutMs = 10000, retryDelayMs = 500 } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // On ne rejoue pas les erreurs 4xx (erreur client, pas de réseau)
      if (response.status >= 400 && response.status < 500) {
        return response;
      }

      // 5xx ou succès -> on retourne
      if (response.ok || response.status < 500) {
        return response;
      }

      // 5xx PSP -> on retente
      lastError = new Error(`HTTP ${response.status} from PSP (attempt ${attempt})`);
      console.warn(`[circuit-breaker] Attempt ${attempt}/${maxRetries} failed: HTTP ${response.status}`);

    } catch (err: unknown) {
      const isTimeout = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
      lastError = new Error(
        isTimeout
          ? `Timeout PSP (${timeoutMs}ms) - attempt ${attempt}`
          : `Network error (attempt ${attempt}): ${err instanceof Error ? err.message : String(err)}`
      );
      console.warn(`[circuit-breaker] Attempt ${attempt}/${maxRetries}: ${lastError.message}`);
    }

    if (attempt < maxRetries) {
      await new Promise((res) => setTimeout(res, retryDelayMs * attempt));
    }
  }

  // Toutes les tentatives épuisées -> Circuit ouvert
  throw new ServiceUnavailableError(
    `Le service de paiement est temporairement indisponible après ${maxRetries} tentatives. Veuillez réessayer dans quelques instants.`,
    lastError
  );
}

export class ServiceUnavailableError extends Error {
  public readonly cause: Error | null;
  constructor(message: string, cause: Error | null = null) {
    super(message);
    this.name = "ServiceUnavailableError";
    this.cause = cause;
  }
}
