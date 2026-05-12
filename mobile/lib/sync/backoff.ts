// Exponential backoff with cap. attempts=0 → 1s, doubles each step, cap 5min.
// At MAX_ATTEMPTS we move the op to 'dead'.

const BASE_MS = 1_000;
const CAP_MS = 5 * 60 * 1_000;
export const MAX_ATTEMPTS = 8;

export function nextDelayMs(attempts: number): number {
  const exp = Math.min(BASE_MS * 2 ** attempts, CAP_MS);
  // small jitter so multiple ops don't fire at the same moment
  const jitter = Math.floor(Math.random() * 200);
  return exp + jitter;
}
