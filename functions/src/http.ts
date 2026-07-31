/** Fetch with timeout + jittered exponential backoff on 429 / network / 5xx. */
export async function fetchWithRetry(
  url: string,
  opts?: { timeoutMs?: number; maxRetries?: number },
): Promise<Response> {
  const timeoutMs = opts?.timeoutMs ?? 10_000;
  const maxRetries = opts?.maxRetries ?? 2;
  let attempt = 0;

  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timer);

      if (res.status === 429 && attempt < maxRetries) {
        await sleep(backoffMs(attempt));
        attempt += 1;
        continue;
      }
      if (res.status >= 500 && attempt < maxRetries) {
        await sleep(backoffMs(attempt));
        attempt += 1;
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      if (attempt < maxRetries) {
        await sleep(backoffMs(attempt));
        attempt += 1;
        continue;
      }
      throw err;
    }
  }
}

function backoffMs(attempt: number): number {
  const base = 1000 * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runWithConcurrencyLimit<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function runOne(): Promise<void> {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await worker(items[i]!);
    }
  }

  const runners = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    () => runOne(),
  );
  await Promise.all(runners);
  return results;
}
