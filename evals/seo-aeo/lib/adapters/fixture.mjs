// Offline adapter that replays a fixture file instead of calling a provider.
// A fixture file maps query ids (or "*" for any query) to a capture:
//   { "status": "ok", "text": "...", "citations": [...], "organic": [...] }
//   { "status": "absent" }                      an AI block that did not show
//   { "error": { "message": "...", "retryable": true } }    always fails
//   { "error": {...}, "failTimes": 1, "then": { "status": "ok", ... } }
//                                                fails, then succeeds
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixtures } from '../../../../tests/support/root.mjs';
import { AdapterError, estimateFromConfig } from './shared.mjs';

export const DEFAULT_FIXTURE = join(fixtures, 'seo-aeo', 'demo.json');

export function createFixtureAdapter({ fixturePath = DEFAULT_FIXTURE } = {}) {
  let fixture;
  const attempts = new Map();
  const load = () => {
    fixture ??= JSON.parse(readFileSync(fixturePath, 'utf8'));
    return fixture;
  };

  return {
    id: 'fixture',
    estimate: estimateFromConfig,
    async capture({ prompt, queryId, repeat }) {
      const { responses } = load();
      const response = responses[queryId] ?? responses['*'];
      if (!response) throw new AdapterError(`fixture has no response for ${queryId}`);
      const key = `${queryId}:${repeat}`;
      const attempt = (attempts.get(key) ?? 0) + 1;
      attempts.set(key, attempt);
      if (response.error && (response.failTimes === undefined || attempt <= response.failTimes)) {
        throw new AdapterError(response.error.message, { retryable: Boolean(response.error.retryable), raw: response.error });
      }
      const capture = response.then ?? response;
      return {
        status: capture.status ?? 'ok',
        text: capture.text,
        citations: capture.citations,
        organic: capture.organic,
        model: capture.model ?? 'fixture',
        costUsd: 0,
        raw: { fixture: fixturePath.split(/[\\/]/).slice(-1)[0], prompt, capture },
      };
    },
  };
}
