/** A provider failure. Retryable errors are retried up to config.limits.maxRetries. */
export class AdapterError extends Error {
  constructor(message, { retryable = false, raw } = {}) {
    super(message);
    this.name = 'AdapterError';
    this.retryable = retryable;
    this.raw = raw;
  }
}

/** Default estimate: one call per query and repeat at config.json costPerCallUsdUpper. */
export function estimateFromConfig({ provider, queries, repeats }) {
  const calls = queries.length * repeats;
  return { calls, usdUpper: calls * provider.costPerCallUsdUpper };
}
