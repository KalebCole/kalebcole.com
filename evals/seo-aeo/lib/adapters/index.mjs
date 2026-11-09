// The adapter interface every provider implements. Real providers (SerpApi,
// OpenAI, Gemini) arrive in #189, #190 and #191; this scaffold ships only the
// offline fixture adapter.
//
// An adapter is an object:
//   id: string, matching config.json providers[].adapter
//   estimate({ provider, queries, repeats }): { calls, usdUpper }
//     The planned calls and a conservative spend ceiling before retries.
//   capture({ prompt, queryId, repeat, provider, locale, env }): Promise<Capture>
//     prompt is the exact query text and nothing else: facts never reach it.
//     env exposes has(name) and get(name) for the provider's requiredEnv keys.
//     Resolves to { status: 'ok' | 'absent', text?, citations?, organic?,
//     model?, costUsd?, raw }. raw is stored as-is under the ignored
//     artifacts directory.
//     Throws AdapterError on failure; retryable errors are retried up to
//     config.limits.maxRetries times.
import { createFixtureAdapter } from './fixture.mjs';

export { AdapterError, estimateFromConfig } from './shared.mjs';

/**
 * Builds the adapter registry. extra lets tests and later issues register
 * more adapters without touching the runner.
 */
export function createAdapterRegistry({ fixturePath, extra = {} } = {}) {
  const adapters = { fixture: createFixtureAdapter({ fixturePath }), ...extra };
  return {
    get: (id) => adapters[id] ?? null,
    ids: () => Object.keys(adapters),
  };
}
