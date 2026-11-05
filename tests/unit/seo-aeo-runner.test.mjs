import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { AdapterError, createAdapterRegistry } from '../../evals/seo-aeo/lib/adapters/index.mjs';
import { loadEnv, parseEnvFile } from '../../evals/seo-aeo/lib/env.mjs';
import { loadDefinitions } from '../../evals/seo-aeo/lib/load.mjs';
import { executeRun, formatPlan, importManual, planRun, rescoreRun } from '../../evals/seo-aeo/lib/runner.mjs';
import { fixtures } from '../support/root.mjs';

const definitions = loadDefinitions();
const fixture = (name) => join(fixtures, 'seo-aeo', `${name}.json`);
const noKeys = { has: () => false, get: () => undefined };
const withKeys = (...keys) => ({ has: (name) => keys.includes(name), get: (name) => (keys.includes(name) ? 'test-value' : undefined) });
const noSleep = async () => {};
const clock = () => new Date('2026-11-05T22:00:00.000Z');

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'seo-aeo-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function withAdapter(definitionsOverride, providerPatch, adapter) {
  const copy = structuredClone(definitionsOverride);
  copy.dir = definitions.dir;
  copy.config.providers.push({ id: 'paid-test', adapter: 'paid-test', surface: 'paid-test', label: 'api-proxy', enabled: false, requiredEnv: ['PAID_TEST_KEY'], costPerCallUsdUpper: 0.1, maxCallsPerRun: 12, citations: true, organic: false, ...providerPatch });
  return { definitions: copy, registry: createAdapterRegistry({ extra: { 'paid-test': adapter } }) };
}

test('env files parse KEY=VALUE lines and blank values count as missing', (t) => {
  assert.deepEqual(parseEnvFile('# comment\nA=1\nexport B="two"\nC=\n'), { A: '1', B: 'two', C: '' });
  const dir = tempDir(t);
  writeFileSync(join(dir, '.env.local'), 'SERPAPI_API_KEY=from-file\nOPENAI_API_KEY=\n');
  const env = loadEnv({ dir, env: {} });
  assert.equal(env.has('SERPAPI_API_KEY'), true);
  assert.equal(env.has('OPENAI_API_KEY'), false);
  assert.equal(loadEnv({ dir, env: { SERPAPI_API_KEY: 'from-process' } }).get('SERPAPI_API_KEY'), 'from-process');
});

test('preflight lists calls and a conservative spend ceiling, and calls nothing', () => {
  let called = false;
  const setup = withAdapter(definitions, {}, { id: 'paid-test', estimate: ({ queries, repeats }) => ({ calls: queries.length * repeats, usdUpper: queries.length * repeats * 0.1 }), capture: async () => { called = true; } });
  setup.definitions.facts.status = 'approved';
  const plan = planRun({ ...setup, env: withKeys('PAID_TEST_KEY'), providerIds: ['paid-test'] });
  assert.equal(plan.totals.calls, 4);
  assert.equal(plan.totals.usdUpper, 0.4);
  assert.equal(plan.totals.worstCaseCalls, 12);
  assert.equal(plan.totals.worstCaseUsd, 1.2);
  assert.match(plan.blocked.join('\n'), /worst-case spend \$1\.20 .* exceeds maxCostUsdPerRun \$1\.00/);
  assert.match(formatPlan(plan), /Run paid-test \(api-proxy, paid-test\): 4 call\(s\), up to \$0\.40/);
  assert.equal(called, false);
  const lowered = planRun({ ...setup, env: withKeys('PAID_TEST_KEY'), providerIds: ['paid-test'], queryIds: ['name'], limits: { maxCostUsdPerRun: 0.5 } });
  assert.deepEqual(lowered.blocked, []);
});

test('a missing key skips the provider with a clear message', () => {
  const setup = withAdapter(definitions, {}, { id: 'paid-test', estimate: () => ({ calls: 4, usdUpper: 0 }), capture: async () => ({}) });
  const plan = planRun({ ...setup, env: noKeys, providerIds: ['paid-test', 'google-organic', 'fixture'] });
  assert.deepEqual(plan.runnable.map((entry) => entry.provider.id), ['fixture']);
  const reasons = plan.skipped.map((entry) => entry.reason).join('\n');
  assert.match(reasons, /paid-test: skipped, PAID_TEST_KEY is not set\. Add it to evals\/seo-aeo\/\.env\.local \(gitignored\)/);
  assert.match(reasons, /google-organic: skipped, SERPAPI_API_KEY is not set/);
  assert.match(reasons, /no adapter is built yet \(planned in #189\)/);
});

test('live providers stay blocked while facts are pending approval', async () => {
  const setup = withAdapter(definitions, {}, { id: 'paid-test', estimate: () => ({ calls: 4, usdUpper: 0 }), capture: async () => ({}) });
  const plan = planRun({ ...setup, env: withKeys('PAID_TEST_KEY'), providerIds: ['paid-test'] });
  assert.match(plan.blocked.join('\n'), /facts\.json is pending-approval/);
  await assert.rejects(() => executeRun({ definitions: setup.definitions, plan, env: noKeys, outDir: tmpdir() }), /Run blocked/);
});

test('adapters receive only the exact query prompt, never facts', async (t) => {
  const seen = [];
  const setup = withAdapter(definitions, { requiredEnv: [] }, {
    id: 'paid-test',
    estimate: () => ({ calls: 4, usdUpper: 0 }),
    capture: async (request) => {
      seen.push(request);
      return { status: 'ok', text: 'Kaleb Cole is a software engineer at Microsoft.', costUsd: 0, raw: {} };
    },
  });
  setup.definitions.facts.status = 'approved';
  const plan = planRun({ ...setup, env: noKeys, providerIds: ['paid-test'] });
  await executeRun({ definitions: setup.definitions, plan, env: noKeys, outDir: tempDir(t), now: clock, sleep: noSleep, runId: 'prompts' });
  assert.deepEqual(seen.map((request) => request.prompt), definitions.queries.queries.map((query) => query.prompt));
  for (const request of seen) {
    assert.deepEqual(Object.keys(request).sort(), ['env', 'locale', 'prompt', 'provider', 'queryId', 'repeat']);
    const sent = JSON.stringify({ ...request, env: undefined });
    for (const fact of definitions.facts.facts) {
      if (fact.id !== 'target-name') assert.equal(sent.includes(fact.claim), false, `${fact.id} leaked into the request`);
    }
    assert.equal(sent.includes('Atomwaffen'), false);
  }
});

test('a fixture run writes raw captures, answers, scores, a review queue and a report', async (t) => {
  const out = tempDir(t);
  const registry = createAdapterRegistry({ fixturePath: fixture('demo') });
  const plan = planRun({ definitions, registry, env: noKeys, providerIds: ['fixture'] });
  const result = await executeRun({ definitions, plan, env: noKeys, outDir: out, now: clock, sleep: noSleep, runId: 'demo' });
  for (const file of ['manifest.json', 'answers.jsonl', 'scores.json', 'review.jsonl', 'report.md', 'raw/fixture/who-is/1.json']) {
    assert.ok(existsSync(join(out, 'demo', file)), file);
  }
  const manifest = JSON.parse(readFileSync(join(out, 'demo', 'manifest.json'), 'utf8'));
  assert.equal(manifest.provisional, true);
  assert.equal(manifest.requests, 4);
  const report = readFileSync(join(out, 'demo', 'report.md'), 'utf8');
  assert.match(report, /Provisional: facts\.json is pending-approval/);
  assert.match(report, /offline fixture, not a real engine/);
  assert.match(report, /Nov 5, 2026, 2:00 PM PST/);
  assert.equal(report.includes('\u2014'), false);
  assert.equal(result.scores.groups[0].metrics.visibility.score, 100);
});

test('provider errors retry only when retryable, within the retry cap, and are recorded as errors', async (t) => {
  const out = tempDir(t);
  const sleeps = [];
  const registry = createAdapterRegistry({ fixturePath: fixture('provider-errors') });
  const plan = planRun({ definitions, registry, env: noKeys, providerIds: ['fixture'] });
  const result = await executeRun({ definitions, plan, env: noKeys, outDir: out, now: clock, sleep: async (ms) => sleeps.push(ms), runId: 'errors' });
  const byQuery = Object.fromEntries(result.answers.map((answer) => [answer.queryId, answer]));
  assert.deepEqual([byQuery.name.status, byQuery.name.attempts], ['ok', 2]);
  assert.deepEqual([byQuery['who-is'].status, byQuery['who-is'].attempts, byQuery['who-is'].reason], ['error', 1, 'HTTP 401 invalid key']);
  assert.deepEqual([byQuery['name-microsoft'].status, byQuery['name-microsoft'].attempts], ['error', 3]);
  assert.deepEqual(sleeps, [2000, 2000, 4000]);
  const [group] = result.scores.groups;
  assert.equal(group.missingness.error, 2);
  assert.equal(group.metrics.visibility.denominator, 2);
  const raw = JSON.parse(readFileSync(join(out, 'errors', 'raw', 'fixture', 'who-is', '1.json'), 'utf8'));
  assert.equal(raw.raw.error, 'HTTP 401 invalid key');
});

test('the request cap stops a run and marks the rest skipped', async (t) => {
  const registry = createAdapterRegistry({ fixturePath: fixture('provider-errors') });
  const plan = planRun({ definitions, registry, env: noKeys, providerIds: ['fixture'], limits: { maxRequestsPerRun: 4 } });
  const result = await executeRun({ definitions, plan, env: noKeys, outDir: tempDir(t), now: clock, sleep: noSleep, runId: 'capped' });
  const requests = result.answers.reduce((sum, answer) => sum + (answer.attempts ?? 0), 0);
  assert.equal(requests, 4);
  assert.equal(result.manifest.requests, 4);
  assert.ok(result.answers.some((answer) => answer.status === 'skipped' && /request cap 4 reached/.test(answer.reason)));
});

test('skipped providers show up in missingness instead of disappearing', async (t) => {
  const registry = createAdapterRegistry({ fixturePath: fixture('demo') });
  const plan = planRun({ definitions, registry, env: noKeys, providerIds: ['fixture', 'gemini-grounded'] });
  const result = await executeRun({ definitions, plan, env: noKeys, outDir: tempDir(t), now: clock, sleep: noSleep, runId: 'skips' });
  const gemini = result.scores.groups.find((group) => group.provider === 'gemini-grounded');
  assert.equal(gemini.missingness.skipped, 4);
  assert.equal(gemini.metrics.visibility.status, 'missing');
  assert.match(readFileSync(join(result.dir, 'report.md'), 'utf8'), /GEMINI_API_KEY is not set/);
});

test('manual UI captures import, validate and score per surface', (t) => {
  const out = tempDir(t);
  const result = importManual({ definitions, file: fixture('manual-import'), outDir: out, now: clock, runId: 'manual' });
  assert.deepEqual(result.scores.groups.map((group) => [group.surface, group.metrics.visibility.score]), [['chatgpt-ui', 100], ['gemini-ui', 0]]);

  const bad = join(out, 'bad.json');
  writeFileSync(bad, JSON.stringify({ captures: [{ provider: 'manual-ui', surface: 'chatgpt-ui', label: 'api-proxy', queryId: 'nope', prompt: 'who is kaleb cole at microsoft', repeat: 1, status: 'ok', capturedAt: '2026-11-05T22:00:00Z' }] }));
  assert.throws(() => importManual({ definitions, file: bad, outDir: out }), (error) => {
    assert.match(error.message, /label must be manual-ui/);
    assert.match(error.message, /unknown queryId nope/);
    return true;
  });
});

test('report rescoring applies review decisions from a file', async (t) => {
  const out = tempDir(t);
  const registry = createAdapterRegistry({ fixturePath: fixture('conflated') });
  const plan = planRun({ definitions, registry, env: noKeys, providerIds: ['fixture'], queryIds: ['name'] });
  const run = await executeRun({ definitions, plan, env: noKeys, outDir: out, now: clock, sleep: noSleep, runId: 'review' });
  assert.equal(run.scores.review[0].kind, 'classification');
  const reviewFile = join(out, 'decisions.json');
  writeFileSync(reviewFile, JSON.stringify([{ answerId: run.scores.review[0].answerId, reviewer: 'kaleb', reviewedAt: '2026-11-06', classification: 'conflated', citationSupport: false }]));
  const rescored = rescoreRun({ definitions, runDir: run.dir, reviewFile });
  assert.equal(rescored.scores.groups[0].critical.confirmedConflations.length, 1);
  assert.match(readFileSync(join(run.dir, 'report.md'), 'utf8'), /Confirmed conflation/);

  const regenerated = rescoreRun({ definitions, runDir: run.dir });
  assert.equal(regenerated.scores.groups[0].critical.confirmedConflations.length, 1, 'a plain report keeps earlier decisions');
  assert.ok(existsSync(join(run.dir, 'review-decisions.json')));
});

test('an AdapterError carries its retryable flag', () => {
  assert.equal(new AdapterError('x', { retryable: true }).retryable, true);
  assert.equal(new AdapterError('x').retryable, false);
});
