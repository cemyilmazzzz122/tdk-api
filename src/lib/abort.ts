/**
 * Returns a signal that aborts when `signal` aborts or after `timeoutMs`,
 * whichever comes first (`AbortSignal.any` needs Node 20.3+, so this links
 * them by hand). Call `dispose()` once the request settles to drop the timer
 * and listener.
 */
export function linkedTimeoutSignal(
  signal: AbortSignal | undefined,
  timeoutMs: number
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms.`, "TimeoutError")),
    timeoutMs
  );
  const onAbort = () => controller.abort(signal!.reason);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener("abort", onAbort, { once: true });

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

/**
 * Settles with `promise`, or rejects with the abort reason as soon as
 * `signal` aborts. The underlying work keeps running, which is what shared
 * loads (e.g. the headword list other callers wait on) need.
 */
export function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}
