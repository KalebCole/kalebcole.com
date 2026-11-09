// Prepares eight Decision-1 requests for strict-visibility-win-v2.
// The default is a preflight. --execute is implemented and is not run here.
// This file does not change the v1 sender pin.
import { spawn as nodeSpawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, cpSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildDecision1Request, DECISION1_PLANNING_NANO_PER_TOKEN } from './decision1-strict.mjs';
import {
  assertSystemoneEndpoint,
  canonicalQuestions,
  DECISION1_ENDPOINT,
  liveSleep,
  postHttps,
  readAzAccessToken,
  verifyFrozenRequest,
} from './decision1-send.mjs';
import { EVAL_DIR } from './load.mjs';
import { DECISION1_V2_QUESTIONS_SHA256, loadDecision1V2Questions, prospectiveV2Slots } from './strict-visibility-v2.mjs';

export const V2_PRIOR_USD = '0.009587634';
export const V2_CAP_USD = '0.05';
export const V2_NEW_RESERVE_USD = '0.005';
export const V2_PRIOR_NANO = 9_587_634n;
export const V2_CAP_NANO = 50_000_000n;
export const V2_NEW_RESERVE_NANO = 5_000_000n;
export const V2_PLAN_VERSION = 'strict-visibility-decision1-v2-8case-plan';

const SPACING_MS = 5000;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function usdToNano(text) {
  const [whole, frac = ''] = text.split('.');
  return BigInt(whole) * 1_000_000_000n + BigInt((`${frac}000000000`).slice(0, 9));
}

if (usdToNano(V2_PRIOR_USD) !== V2_PRIOR_NANO) throw new Error('v2 prior nano drifted');
if (usdToNano(V2_CAP_USD) !== V2_CAP_NANO) throw new Error('v2 cap nano drifted');
if (usdToNano(V2_NEW_RESERVE_USD) !== V2_NEW_RESERVE_NANO) throw new Error('v2 reserve nano drifted');

function writeDurable(path, bytes, { exclusive = false } = {}) {
  let fd;
  try {
    fd = openSync(path, exclusive ? 'wx' : 'w');
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`refusing to overwrite ${path}`);
    throw error;
  }
  try {
    writeSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function appendDurable(path, line) {
  const fd = openSync(path, 'a');
  try {
    writeSync(fd, line);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function writeExclusiveOrSame(path, bytes) {
  if (existsSync(path)) {
    const current = readFileSync(path);
    if (Buffer.compare(current, bytes) !== 0) throw new Error(`refusing to overwrite ${path}`);
    return;
  }
  writeDurable(path, bytes, { exclusive: true });
}

export function answerPathFor(slot) {
  return `answers/${slot.engine}/${slot.session}/${slot.queryId}.txt`;
}

export function requestPathFor(slot) {
  return `requests.v2/${slot.engine}__${slot.session}__${slot.queryId}.json`;
}

/** Inventory only. Does not read captures and does not send. */
export function preflightV2() {
  const bundle = loadDecision1V2Questions();
  if (bundle.sha256 !== DECISION1_V2_QUESTIONS_SHA256) throw new Error('v2 question pin drifted');
  const slots = prospectiveV2Slots();
  const ids = slots.map((slot) => slot.id);
  if (ids.length !== 8 || new Set(ids).size !== 8) throw new Error('prospective grid is not 8 unique slots');
  return {
    candidate: 'strict-visibility-win-v2',
    questionsSha256: bundle.sha256,
    calls: 0,
    retries: 0,
    execute: false,
    priorUsd: V2_PRIOR_USD,
    capUsd: V2_CAP_USD,
    newReserveUsd: V2_NEW_RESERVE_USD,
    slots: slots.map((slot) => ({
      id: slot.id,
      engine: slot.engine,
      session: slot.session,
      queryId: slot.queryId,
      prompt: slot.prompt,
      answerPath: answerPathFor(slot),
      requestPath: requestPathFor(slot),
    })),
  };
}

/**
 * Writes exact request bytes from answer files. Does not strip text and does not send.
 * Missing files fail closed.
 */
export function prepareV2({ answersRoot, outRoot }) {
  const inventory = preflightV2();
  const bundle = loadDecision1V2Questions();
  const items = [];
  for (const slot of inventory.slots) {
    const source = join(answersRoot, slot.answerPath);
    if (!existsSync(source)) throw new Error(`missing answer file ${slot.answerPath}`);
    const answerText = readFileSync(source, 'utf8');
    const built = buildDecision1Request({ answerText }, bundle);
    if (canonicalQuestions(built.payload.questions) !== canonicalQuestions(bundle.document.questions)) {
      throw new Error(`${slot.id} request questions are not the v2 wire`);
    }
    const requestPath = slot.requestPath;
    mkdirSync(join(outRoot, 'requests.v2'), { recursive: true });
    writeExclusiveOrSame(join(outRoot, requestPath), built.bytes);
    items.push({
      id: slot.id,
      engine: slot.engine,
      session: slot.session,
      queryId: slot.queryId,
      prompt: slot.prompt,
      request_path: requestPath,
      request_sha256: built.sha256,
      request_utf8_bytes: built.bytes.length,
      judge_input_sha256: built.answerBodySha256,
      judge_deployment: 'decision-1-eval',
      question_spec_version: 'strict-visibility-decision1-v2',
    });
  }
  const ids = items.map((item) => item.id);
  if (ids.length !== 8 || new Set(ids).size !== 8) throw new Error('prepared plan is not 8 unique items');
  const total = items.reduce((sum, item) => sum + item.request_utf8_bytes, 0);
  const envelopeTokens = BigInt(total + (4096 * items.length));
  const envelopeNano = envelopeTokens * DECISION1_PLANNING_NANO_PER_TOKEN;
  if (envelopeNano > V2_NEW_RESERVE_NANO) throw new Error('planning envelope exceeds the $0.005 reserve');
  const plan = {
    version: V2_PLAN_VERSION,
    candidate: 'strict-visibility-win-v2',
    questionsSha256: bundle.sha256,
    prediction_calls_made: 0,
    execute_now: false,
    retries: 0,
    priorUsd: V2_PRIOR_USD,
    capUsd: V2_CAP_USD,
    newReserveUsd: V2_NEW_RESERVE_USD,
    serialized_payload_total_utf8_bytes: total,
    items,
  };
  const planBytes = Buffer.from(`${JSON.stringify(plan, null, 2)}\n`);
  writeExclusiveOrSame(join(outRoot, 'plan.v2-judge.json'), planBytes);
  return { plan, planSha256: sha256(planBytes), calls: 0 };
}

function journalEntries(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function providerUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const input = usage.input_tokens;
  const output = usage.output_tokens;
  if (!Number.isInteger(input) || !Number.isInteger(output) || input < 0 || output < 0) return null;
  return { input_tokens: input, output_tokens: output };
}

function readBudget(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeBudget(path, budget) {
  const tmp = `${path}.tmp`;
  writeDurable(tmp, Buffer.from(`${JSON.stringify(budget, null, 2)}\n`), { exclusive: true });
  renameSync(tmp, path);
}

export function assertV2Plan(plan) {
  if (plan?.version !== V2_PLAN_VERSION) throw new Error('plan is not the v2 judge plan');
  if (plan.questionsSha256 !== DECISION1_V2_QUESTIONS_SHA256) throw new Error('plan questions hash is not the v2 pin');
  if (plan.prediction_calls_made !== 0 || plan.retries !== 0 || plan.execute_now !== false) {
    throw new Error('plan is not a no-retry offline plan');
  }
  if (plan.priorUsd !== V2_PRIOR_USD || plan.capUsd !== V2_CAP_USD || plan.newReserveUsd !== V2_NEW_RESERVE_USD) {
    throw new Error('plan budget does not match the pinned cap and prior');
  }
  const expected = new Set(prospectiveV2Slots().map((slot) => slot.id));
  if (!Array.isArray(plan.items) || plan.items.length !== 8) throw new Error('plan must contain exactly 8 items');
  const ids = plan.items.map((item) => item.id);
  if (new Set(ids).size !== 8 || ids.some((id) => !expected.has(id))) throw new Error('plan ids are not the 8 pinned slots');
  for (const item of plan.items) {
    if (!item.request_path.startsWith('requests.v2/') || item.request_path.includes('..')) {
      throw new Error(`${item.id} request path must stay under requests.v2`);
    }
  }
  return plan;
}

/**
 * Verifies a prepared v2 plan. Sends only when execute is true and a transport
 * is supplied. Retries stay 0. This default does not send.
 */
export async function executeV2Plan({ plan, runRoot, execute = false, transport, sleep = liveSleep, spacingMs = SPACING_MS }) {
  assertV2Plan(plan);
  const questions = loadDecision1V2Questions().document.questions;
  const verified = plan.items.map((item) => ({ item, ...verifyFrozenRequest(item, runRoot, questions) }));
  const summary = { verified: verified.length, calls: 0, sent: [], skipped: [], stopped: null, retries: 0 };
  if (!execute) return summary;
  if (typeof transport !== 'function') throw new Error('refusing to send without an explicit transport');
  const journalPath = join(runRoot, 'attempts.jsonl');
  const prior = journalEntries(journalPath);
  const latest = new Map();
  for (const entry of prior) latest.set(entry.id, entry);
  for (const entry of latest.values()) {
    if (entry.phase === 'armed') {
      summary.stopped = 'ambiguous-attempt';
      return summary;
    }
    if (entry.phase === 'stopped') {
      summary.stopped = 'already-stopped';
      return summary;
    }
  }
  const armedRecords = prior.filter((entry) => entry.phase === 'armed').length;
  const budgetPath = join(runRoot, 'budget.json');
  mkdirSync(join(runRoot, 'responses'), { recursive: true });
  if (!existsSync(budgetPath)) {
    writeDurable(budgetPath, Buffer.from(`${JSON.stringify({
      priorUsageNano: V2_PRIOR_NANO.toString(),
      newReserveNano: V2_NEW_RESERVE_NANO.toString(),
      spentNewNano: '0',
      inputTokens: 0,
      capNano: V2_CAP_NANO.toString(),
      usageUnknown: false,
      calls: armedRecords,
      retries: 0,
    }, null, 2)}\n`), { exclusive: true });
  }
  const existing = readBudget(budgetPath);
  if (existing.usageUnknown === true) {
    summary.stopped = 'missing-usage';
    return summary;
  }
  const spentSoFar = BigInt(existing.spentNewNano || '0');
  if (spentSoFar >= V2_NEW_RESERVE_NANO || V2_PRIOR_NANO + spentSoFar >= V2_CAP_NANO) {
    summary.stopped = spentSoFar >= V2_NEW_RESERVE_NANO ? 'new-reserve' : 'cumulative-cap';
    return summary;
  }
  let sends = 0;
  for (const { item, bytes } of verified) {
    const current = latest.get(item.id);
    if (current?.phase === 'responded' || current?.phase === 'stopped') {
      summary.skipped.push(item.id);
      continue;
    }
    if (armedRecords + sends >= 8) {
      summary.stopped = 'attempt-cap';
      break;
    }
    if (sends > 0) await sleep(spacingMs);
    appendDurable(journalPath, `${JSON.stringify({ id: item.id, phase: 'armed', requestSha256: item.request_sha256 })}\n`);
    const budget = readBudget(budgetPath);
    writeBudget(budgetPath, { ...budget, calls: armedRecords + sends + 1, retries: 0 });
    let http;
    try {
      http = await transport(bytes);
    } catch {
      appendDurable(journalPath, `${JSON.stringify({ id: item.id, phase: 'stopped', reason: 'transport-error' })}\n`);
      summary.stopped = 'transport-error';
      summary.calls = sends;
      return summary;
    }
    sends += 1;
    summary.calls = sends;
    if (http?.incomplete === true || !http || !Number.isInteger(http.status) || !Buffer.isBuffer(http.body)) {
      const body = Buffer.isBuffer(http?.body) ? http.body : Buffer.alloc(0);
      const status = Number.isInteger(http?.status) ? http.status : null;
      const responsePath = join(runRoot, 'responses', `${item.id.replaceAll(':', '__')}.http`);
      writeDurable(responsePath, Buffer.from(JSON.stringify({ status, bodySha256: sha256(body), incomplete: true })), { exclusive: true });
      writeDurable(`${responsePath}.body`, body, { exclusive: true });
      appendDurable(journalPath, `${JSON.stringify({ id: item.id, phase: 'stopped', reason: 'incomplete-or-malformed' })}\n`);
      summary.stopped = 'incomplete-or-malformed';
      summary.sent.push(item.id);
      return summary;
    }
    const responsePath = join(runRoot, 'responses', `${item.id.replaceAll(':', '__')}.http`);
    writeDurable(responsePath, Buffer.from(JSON.stringify({ status: http.status, bodySha256: sha256(http.body) })), { exclusive: true });
    writeDurable(`${responsePath}.body`, http.body, { exclusive: true });
    let parsed = null;
    try {
      parsed = JSON.parse(http.body.toString('utf8'));
    } catch {
      parsed = null;
    }
    const usage = providerUsage(parsed?.usage);
    if (http.status !== 200) {
      appendDurable(journalPath, `${JSON.stringify({ id: item.id, phase: 'stopped', reason: `http-${http.status}-no-retry` })}\n`);
      summary.stopped = `http-${http.status}`;
      summary.sent.push(item.id);
      return summary;
    }
    if (!usage) {
      writeBudget(budgetPath, { ...readBudget(budgetPath), usageUnknown: true, retries: 0 });
      appendDurable(journalPath, `${JSON.stringify({ id: item.id, phase: 'stopped', reason: 'missing-usage' })}\n`);
      summary.stopped = 'missing-usage';
      summary.sent.push(item.id);
      return summary;
    }
    const spent = BigInt(readBudget(budgetPath).spentNewNano || '0') + (BigInt(usage.input_tokens) * 42n);
    writeBudget(budgetPath, {
      ...readBudget(budgetPath),
      spentNewNano: spent.toString(),
      inputTokens: (readBudget(budgetPath).inputTokens || 0) + usage.input_tokens,
      retries: 0,
    });
    appendDurable(journalPath, `${JSON.stringify({ id: item.id, phase: 'responded', requestSha256: item.request_sha256 })}\n`);
    summary.sent.push(item.id);
    latest.set(item.id, { id: item.id, phase: 'responded' });
    if (spent >= V2_NEW_RESERVE_NANO || V2_PRIOR_NANO + spent >= V2_CAP_NANO) {
      summary.stopped = spent >= V2_NEW_RESERVE_NANO ? 'new-reserve' : 'cumulative-cap';
      return summary;
    }
  }
  return summary;
}

function option(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  return argv[index + 1];
}

/** Opt-in v2 sender. Without --execute it only prepares or prints the preflight. */
export async function mainV2(argv, hooks = {}) {
  if (!argv.includes('--answers') && !argv.includes('--execute')) {
    console.log(JSON.stringify(preflightV2()));
    return 0;
  }
  if (!argv.includes('--execute')) {
    const answers = option(argv, '--answers');
    const out = option(argv, '--out');
    if (!answers || !out) throw new Error('prepare needs --answers and --out');
    const prepared = prepareV2({ answersRoot: answers, outRoot: out });
    console.log(JSON.stringify({ calls: 0, planSha256: prepared.planSha256, items: prepared.plan.items.length, questionsSha256: prepared.plan.questionsSha256 }));
    return 0;
  }
  const planPath = option(argv, '--plan');
  const planSha = option(argv, '--plan-sha');
  const runRoot = option(argv, '--run-root');
  if (!planPath || !planSha || !runRoot) throw new Error('execute needs --plan, --plan-sha, and --run-root');
  const planBytes = readFileSync(planPath);
  if (sha256(planBytes) !== planSha) throw new Error('plan file does not match --plan-sha');
  const plan = JSON.parse(planBytes.toString('utf8'));
  assertV2Plan(plan);
  plan.items.forEach((item) => verifyFrozenRequest(item, runRoot, loadDecision1V2Questions().document.questions));
  const azBin = option(argv, '--az');
  const endpoint = option(argv, '--endpoint');
  const resource = option(argv, '--resource');
  if (!azBin || !existsSync(azBin)) throw new Error('az binary is missing');
  if (endpoint !== DECISION1_ENDPOINT) throw new Error('endpoint is not the pinned systemone URL');
  assertSystemoneEndpoint(endpoint);
  if (resource !== 'https://cognitiveservices.azure.com') throw new Error('resource is not https://cognitiveservices.azure.com');
  const token = await readAzAccessToken({ azBin, resource, spawnImpl: hooks.spawnImpl ?? nodeSpawn });
  const summary = await executeV2Plan({
    plan,
    runRoot,
    execute: true,
    transport: (body) => postHttps({ endpoint, body, token, requestImpl: hooks.requestImpl }),
    sleep: hooks.sleep,
    spacingMs: SPACING_MS,
  });
  console.log(JSON.stringify({ verified: summary.verified, calls: summary.calls, sent: summary.sent, skipped: summary.skipped, stopped: summary.stopped, retries: summary.retries }));
  return summary.stopped ? 1 : 0;
}

const EXPORT_FILES = [
  'lib/decision1-v2-run.mjs',
  'lib/decision1-send.mjs',
  'lib/decision1-strict.mjs',
  'lib/strict-visibility-v2.mjs',
  'lib/strict-visibility.mjs',
  'lib/load.mjs',
  'lib/schema.mjs',
  'lib/frozen-path.mjs',
  'questions/questions.strict-visibility-decision1.v2.json',
  'schemas/strict-extraction.schema.json',
];

/** Copies the v2 preparer. Generated output is not committed. */
export function exportDecision1V2(outDir) {
  for (const file of EXPORT_FILES) {
    mkdirSync(join(outDir, dirname(file)), { recursive: true });
    cpSync(join(EVAL_DIR, file), join(outDir, file));
  }
  writeFileSync(join(outDir, 'prepare.mjs'), `#!/usr/bin/env node
import { mainV2 } from './lib/decision1-v2-run.mjs';

mainV2(process.argv.slice(2)).then((code) => process.exit(code ?? 0), (error) => {
  console.error(error.message);
  process.exit(1);
});
`);
  writeFileSync(join(outDir, 'README.md'), `# Decision-1 v2 preflight

\`node prepare.mjs\` prints the eight slots, the v2 question hash, and calls 0.
\`node prepare.mjs --answers <dir> --out <dir>\` pins request bytes. It does not send.
\`--execute\` is implemented and is not authorized by the freeze. Do not pass it until a separate review.
The v1 sender is not this command. The token stays in memory.
`);
  return outDir;
}
