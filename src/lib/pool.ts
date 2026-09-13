/**
 * Maps `items` through `fn` with at most `concurrency` calls in flight,
 * preserving input order in the result. Stops scheduling new calls after the
 * first rejection (or once `signal` aborts) and rejects with that reason.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;

  const worker = async () => {
    while (!failed && next < items.length) {
      if (signal?.aborted) throw signal.reason;
      const index = next++;
      try {
        results[index] = await fn(items[index], index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker);
  await Promise.all(workers);
  return results;
}
