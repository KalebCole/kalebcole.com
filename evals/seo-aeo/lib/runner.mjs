// Plans, runs, imports and rescores eval runs. Preflight shows every call and
// a conservative spend ceiling before anything runs, and the request, retry,
// quota and cost caps stop a run from growing past what was planned.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { missingKeyMessage } from './env.mjs';
import { loadSchema, readJson } from './load.mjs';
import { renderReport } from './report.mjs';
import { validate } from './schema.mjs';
import { answerId, scoreRun } from './score.mjs';

const round = (value) => Math.round(value * 10000) / 10000;

function selectQueries(queries, queryIds) {
  const enabled = queries.queries.filter((query) => query.enabled);
  if (!queryIds?.length) return enabled;
  const unknown = queryIds.filter((id) => !queries.queries.some((query) => query.id === id));
  if (unknown.length) throw new Error(`Unknown query id(s): ${unknown.join(', ')}`);
  return queries.queries.filter((query) => queryIds.includes(query.id));
}

function selectProviders(config, providerIds) {
  if (!providerIds?.length) return config.providers.filter((provider) => provider.enabled);
  const unknown = providerIds.filter((id) => !config.providers.some((provider) => provider.id === id));
  if (unknown.length) throw new Error(`Unknown provider id(s): ${unknown.join(', ')}. Known: ${config.providers.map((provider) => provider.id).join(', ')}`);
  return config.providers.filter((provider) => providerIds.includes(provider.id));
}

/**
 * Builds the preflight plan without calling anything. A plan with a
 * blocked reason must not run.
 */
export function planRun({ definitions, registry, env, providerIds, queryIds, repeats, limits = {} }) {
  const { config, facts, queries } = definitions;
  const effectiveLimits = { ...config.limits, ...Object.fromEntries(Object.entries(limits).filter(([, value]) => value !== undefined)) };
  const runRepeats = repeats ?? config.repeats;
  const selectedQueries = selectQueries(queries, queryIds);
  const runnable = [];
  const skipped = [];

  for (const provider of selectProviders(config, providerIds)) {
    if (provider.adapter === 'manual') {
      skipped.push({ provider, reason: `${provider.id}: skipped, manual UI captures come in through the import command.` });
      continue;
    }
    const adapter = provider.adapter ? registry.get(provider.adapter) : null;
    const reasons = provider.requiredEnv.filter((key) => !env.has(key)).map((key) => missingKeyMessage(provider.id, key));
    if (!adapter) {
      const planned = provider.plannedIssue ? ` (planned in #${provider.plannedIssue})` : '';
      reasons.push(`${provider.id}: skipped, no adapter is built yet${planned}.`);
    }
    if (reasons.length) {
      skipped.push({ provider, reason: reasons.join(' ') });
      continue;
    }
    const estimate = adapter.estimate({ provider, queries: selectedQueries, repeats: runRepeats });
    const maxAttempts = 1 + effectiveLimits.maxRetries;
    runnable.push({
      provider,
      adapter,
      calls: estimate.calls,
      worstCaseCalls: estimate.calls * maxAttempts,
      usdUpper: round(estimate.usdUpper),
      worstCaseUsd: round(estimate.usdUpper * maxAttempts),
    });
  }

  const totals = {
    calls: runnable.reduce((sum, entry) => sum + entry.calls, 0),
    worstCaseCalls: runnable.reduce((sum, entry) => sum + entry.worstCaseCalls, 0),
    usdUpper: round(runnable.reduce((sum, entry) => sum + entry.usdUpper, 0)),
    worstCaseUsd: round(runnable.reduce((sum, entry) => sum + entry.worstCaseUsd, 0)),
  };

  const blocked = [];
  const live = runnable.filter((entry) => entry.provider.label !== 'fixture');
  if (live.length && facts.status !== 'approved') {
    blocked.push(`facts.json is ${facts.status}. Live providers (${live.map((entry) => entry.provider.id).join(', ')}) stay off until Kaleb approves the facts.`);
  }
  if (totals.calls > effectiveLimits.maxRequestsPerRun) {
    blocked.push(`planned ${totals.calls} calls exceed maxRequestsPerRun ${effectiveLimits.maxRequestsPerRun}.`);
  }
  if (totals.worstCaseUsd > effectiveLimits.maxCostUsdPerRun) {
    blocked.push(`worst-case spend $${totals.worstCaseUsd.toFixed(2)} (with ${effectiveLimits.maxRetries} retries per call) exceeds maxCostUsdPerRun $${effectiveLimits.maxCostUsdPerRun.toFixed(2)}.`);
  }
  for (const entry of runnable) {
    if (entry.calls > entry.provider.maxCallsPerRun) {
      blocked.push(`${entry.provider.id}: planned ${entry.calls} calls exceed its maxCallsPerRun ${entry.provider.maxCallsPerRun}.`);
    }
  }

  return { queries: selectedQueries, repeats: runRepeats, limits: effectiveLimits, runnable, skipped, totals, blocked };
}

export function formatPlan(plan) {
  const lines = [`Queries: ${plan.queries.map((query) => JSON.stringify(query.prompt)).join(', ')}`, `Repeats: ${plan.repeats}`];
  for (const entry of plan.runnable) {
    lines.push(`Run ${entry.provider.id} (${entry.provider.label}, ${entry.provider.surface}): ${entry.calls} call(s), up to $${entry.usdUpper.toFixed(2)}; worst case with retries ${entry.worstCaseCalls} call(s), $${entry.worstCaseUsd.toFixed(2)}`);
  }
  for (const entry of plan.skipped) lines.push(`Skip ${entry.reason}`);
  lines.push(`Total: ${plan.totals.calls} call(s), up to $${plan.totals.usdUpper.toFixed(2)}; worst case ${plan.totals.worstCaseCalls} call(s), $${plan.totals.worstCaseUsd.toFixed(2)}`);
  lines.push(`Caps: ${plan.limits.maxRequestsPerRun} requests, ${plan.limits.maxRetries} retries per call, $${plan.limits.maxCostUsdPerRun.toFixed(2)} per run`);
  if (plan.blocked.length) lines.push(...plan.blocked.map((reason) => `Blocked: ${reason}`));
  return lines.join('\n');
}

function gitCommit(dir) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

function runIdFor(now, suffix) {
  return `${now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-${suffix}`;
}

export function artifactsRoot(definitions, outDir) {
  if (outDir) return isAbsolute(outDir) ? outDir : resolve(outDir);
  return join(definitions.dir, definitions.config.artifactsDir);
}

const hash = (value) => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');

function writeJson(path, value) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeJsonl(path, rows) {
  writeFileSync(path, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
}

function manifestFor({ definitions, runId, kind, plan, startedAt, finishedAt }) {
  const { queries, facts, rubric, config } = definitions;
  return {
    runId,
    kind,
    startedAt,
    finishedAt,
    commit: gitCommit(definitions.dir),
    versions: { queries: queries.version, facts: facts.version, rubric: rubric.version, config: config.version },
    factsStatus: facts.status,
    provisional: facts.status !== 'approved',
    locale: config.locale,
    repeats: plan?.repeats ?? null,
    limits: plan?.limits ?? config.limits,
    plan: plan
      ? {
        totals: plan.totals,
        runnable: plan.runnable.map((entry) => ({ provider: entry.provider.id, label: entry.provider.label, surface: entry.provider.surface, calls: entry.calls, usdUpper: entry.usdUpper })),
        skipped: plan.skipped.map((entry) => ({ provider: entry.provider.id, reason: entry.reason })),
      }
      : null,
  };
}

function finishRun({ definitions, dir, manifest, answers, reviews = [] }) {
  const scores = scoreRun({ answers, definitions, reviews });
  writeJson(join(dir, 'manifest.json'), manifest);
  writeJsonl(join(dir, 'answers.jsonl'), answers);
  writeJson(join(dir, 'scores.json'), scores);
  writeJsonl(join(dir, 'review.jsonl'), scores.review);
  writeFileSync(join(dir, 'report.md'), renderReport({ manifest, scores, timeZone: definitions.config.locale.timeZone }));
  return { runId: manifest.runId, dir, answers, scores, manifest };
}

const defaultSleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

/**
 * Runs a plan: calls each adapter with only the query prompt, retries
 * retryable errors with exponential backoff, stops at the request cap, and
 * writes raw captures, answers, scores, the review queue and a report.
 */
export async function executeRun({ definitions, plan, env, outDir, now = () => new Date(), sleep = defaultSleep, runId }) {
  if (plan.blocked.length) throw new Error(`Run blocked:\n- ${plan.blocked.join('\n- ')}`);
  const startedAt = now();
  const id = runId ?? runIdFor(startedAt, plan.runnable.map((entry) => entry.provider.id).join('+') || 'none');
  const dir = join(artifactsRoot(definitions, outDir), id);
  mkdirSync(dir, { recursive: true });

  const answers = [];
  let requests = 0;
  let spentUsd = 0;
  const { maxRetries, retryBaseDelayMs, maxRequestsPerRun, maxCostUsdPerRun } = plan.limits;

  for (const { provider, reason } of plan.skipped) {
    for (const query of plan.queries) {
      for (let repeat = 1; repeat <= plan.repeats; repeat += 1) {
        answers.push({ provider: provider.id, surface: provider.surface, label: provider.label, queryId: query.id, prompt: query.prompt, repeat, status: 'skipped', reason, capturedAt: now().toISOString() });
      }
    }
  }

  for (const { provider, adapter } of plan.runnable) {
    let providerCalls = 0;
    for (const query of plan.queries) {
      for (let repeat = 1; repeat <= plan.repeats; repeat += 1) {
        const record = { provider: provider.id, surface: provider.surface, label: provider.label, queryId: query.id, prompt: query.prompt, repeat };
        let attempts = 0;
        let outcome = null;
        let lastError = null;
        const started = Date.now();
        while (attempts <= maxRetries) {
          if (requests >= maxRequestsPerRun || providerCalls >= provider.maxCallsPerRun) {
            lastError = new Error(requests >= maxRequestsPerRun ? `request cap ${maxRequestsPerRun} reached` : `${provider.id} quota ${provider.maxCallsPerRun} reached`);
            lastError.capped = true;
            break;
          }
          if (spentUsd + provider.costPerCallUsdUpper > maxCostUsdPerRun) {
            lastError = new Error(`cost cap $${maxCostUsdPerRun.toFixed(2)} reached`);
            lastError.capped = true;
            break;
          }
          attempts += 1;
          requests += 1;
          providerCalls += 1;
          try {
            outcome = await adapter.capture({ prompt: query.prompt, queryId: query.id, repeat, provider, locale: definitions.config.locale, env });
            spentUsd += outcome.costUsd ?? provider.costPerCallUsdUpper;
            break;
          } catch (error) {
            spentUsd += provider.costPerCallUsdUpper;
            lastError = error;
            if (!error.retryable || attempts > maxRetries) break;
            await sleep(retryBaseDelayMs * 2 ** (attempts - 1));
          }
        }

        const capturedAt = now().toISOString();
        const raw = outcome ? outcome.raw : { error: lastError?.message, detail: lastError?.raw };
        writeJson(join(dir, 'raw', provider.id, query.id, `${repeat}.json`), { ...record, attempts, capturedAt, raw });
        if (outcome) {
          answers.push({
            ...record,
            status: outcome.status,
            ...(outcome.text !== undefined && { text: outcome.text }),
            ...(outcome.citations && { citations: outcome.citations }),
            ...(outcome.organic && { organic: outcome.organic }),
            ...(outcome.model && { model: outcome.model }),
            attempts,
            costUsd: outcome.costUsd ?? provider.costPerCallUsdUpper,
            latencyMs: Date.now() - started,
            capturedAt,
            rawHash: hash(raw),
          });
        } else {
          answers.push({ ...record, status: lastError?.capped ? 'skipped' : 'error', reason: lastError?.message ?? 'unknown error', attempts, capturedAt, rawHash: hash(raw) });
        }
      }
    }
  }

  const manifest = manifestFor({ definitions, runId: id, kind: 'run', plan, startedAt: startedAt.toISOString(), finishedAt: now().toISOString() });
  manifest.requests = requests;
  manifest.spentUsdUpper = round(spentUsd);
  return finishRun({ definitions, dir, manifest, answers });
}

/**
 * Imports manual UI captures (ChatGPT, Gemini, Google AI Mode in a fresh
 * chat) from a JSON file of answer records, validated against
 * schemas/answer.schema.json, and scores them as their own run.
 */
export function importManual({ definitions, file, outDir, now = () => new Date(), runId }) {
  const input = readJson(file);
  const captures = Array.isArray(input) ? input : input.captures;
  if (!Array.isArray(captures) || captures.length === 0) throw new Error(`${file}: expected a non-empty captures array`);
  const schema = loadSchema('answer', definitions.dir);
  const knownQueries = new Set(definitions.queries.queries.map((query) => query.id));
  const errors = [];
  captures.forEach((capture, index) => {
    for (const problem of validate(schema, capture)) errors.push(`captures[${index}]: ${problem}`);
    if (capture.label !== 'manual-ui') errors.push(`captures[${index}]: label must be manual-ui for an import`);
    if (!knownQueries.has(capture.queryId)) errors.push(`captures[${index}]: unknown queryId ${capture.queryId}`);
    const query = definitions.queries.queries.find((entry) => entry.id === capture.queryId);
    if (query && capture.prompt !== undefined && capture.prompt !== query.prompt) errors.push(`captures[${index}]: prompt must be the exact query text ${JSON.stringify(query.prompt)}`);
  });
  const ids = captures.map((capture) => answerId(capture));
  for (const id of ids.filter((value, index) => ids.indexOf(value) !== index)) errors.push(`duplicate capture ${id}`);
  if (errors.length) throw new Error(`Invalid manual import:\n- ${errors.join('\n- ')}`);

  const startedAt = now();
  const id = runId ?? runIdFor(startedAt, 'manual');
  const dir = join(artifactsRoot(definitions, outDir), id);
  mkdirSync(dir, { recursive: true });
  writeJson(join(dir, 'raw', 'manual-import.json'), input);
  const answers = captures.map((capture) => ({ ...capture, rawHash: capture.rawHash ?? hash(capture) }));
  const manifest = manifestFor({ definitions, runId: id, kind: 'manual-import', plan: null, startedAt: startedAt.toISOString(), finishedAt: now().toISOString() });
  manifest.importedFrom = file;
  return finishRun({ definitions, dir, manifest, answers });
}

/** Reads review decisions (JSON array, or JSONL) and validates them. */
export function readReviews(definitions, file) {
  const text = readFileSync(file, 'utf8').trim();
  const reviews = text.startsWith('[') ? JSON.parse(text) : text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const problems = validate(loadSchema('review', definitions.dir), reviews);
  if (problems.length) throw new Error(`Invalid review file ${file}:\n- ${problems.join('\n- ')}`);
  return reviews;
}

/** Rescores an existing run directory, optionally with review decisions. */
export function rescoreRun({ definitions, runDir, reviewFile }) {
  const manifestPath = join(runDir, 'manifest.json');
  const answersPath = join(runDir, 'answers.jsonl');
  if (!existsSync(manifestPath) || !existsSync(answersPath)) throw new Error(`${runDir} is not a run directory (needs manifest.json and answers.jsonl)`);
  const manifest = readJson(manifestPath);
  const answers = readFileSync(answersPath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const reviews = reviewFile ? readReviews(definitions, reviewFile) : [];
  if (reviewFile) manifest.reviewFile = reviewFile;
  return finishRun({ definitions, dir: runDir, manifest, answers, reviews });
}
