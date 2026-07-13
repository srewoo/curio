import { RETRY } from '@/config/constants';
import { AdapterError } from './provider';

// Exponential backoff with jitter for transient provider failures (PRD §6.9).
// Only rate-limit (429) and server (5xx)/network errors are retried; auth and
// content-block errors fail fast.
const RETRYABLE = new Set(['rate_limited', 'server', 'network']);

function delayFor(attempt: number): number {
  const exp = Math.min(RETRY.maxDelayMs, RETRY.baseDelayMs * 2 ** attempt);
  const jitter = exp * 0.25 * Math.random();
  return exp + jitter;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < RETRY.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const code = err instanceof AdapterError ? err.code : 'unknown';
      if (!RETRYABLE.has(code) || attempt === RETRY.maxAttempts - 1) throw err;
      await sleep(delayFor(attempt));
    }
  }
  throw lastErr;
}
