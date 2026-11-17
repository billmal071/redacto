/** Retry transient Google API errors (429/500/503) with linear backoff. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { tries?: number; baseMs?: number; onRetry?: (attempt: number) => void } = {},
): Promise<T> {
  const { tries = 3, baseMs = 1500, onRetry } = opts;
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (i >= tries || !/\[(429|500|503)\b/.test(msg)) throw e;
      onRetry?.(i);
      await new Promise((r) => setTimeout(r, baseMs * i));
    }
  }
}
