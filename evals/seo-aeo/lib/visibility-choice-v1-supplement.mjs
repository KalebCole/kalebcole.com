// Supplement for the two unsent visibility-choice-v1 slots. Default commands do not send.
// Does not read gold, change labels, or write the original run.
import { createHash } from 'node:crypto';
import { closeSync, cpSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DECISION1_BYTE_OVERHEAD,
  DECISION1_PLANNING_NANO_PER_TOKEN,
} from './decision1-strict.mjs';
import {
  DECISION1_ENDPOINT,
  assertSystemoneEndpoint,
  liveSleep,
  readAzAccessToken,
} from './decision1-send.mjs';
import { EVAL_DIR } from './load.mjs';
import {
  FREEZE_FILE,
  ORIGINAL_FREEZE_SHA256,
  QUESTION_FILE,
  PROFILE_FILE,
  RESOURCE,
  SPACING_MS,
  buildChoiceRequest,
  decideChoice,
  loadProfileText,
  plannedSlots,
  postChoice,
  verifyFreeze,
} from './visibility-choice-v1.mjs';

export const SUPPLEMENT_VERSION = 'visibility-choice-v1-supplement';
export const SUPPLEMENT_IDS = [
  'fresh-google-signed-out-who-is',
  'fresh-google-signed-out-name',
];
export const SUPPLEMENT_FILE = fileURLToPath(import.meta.url);
export const SUPPLEMENT_FREEZE_FILE = join(EVAL_DIR, 'visibility-choice-v1/supplement-freeze.json');
export const ORIGINAL_RUNNER_FILE = join(EVAL_DIR, 'lib/visibility-choice-v1.mjs');
export const ORIGINAL_RUNNER_SHA256 = 'ac7c77a85e50060054bb52b4225c031b61e52895f929c2b54c18673e70175d9d';
export const ORIGINAL_R2_SHA256 = '8e480e9049696e4da34c26255f2d9759824d815c60d567f5801f1605df6e11bc';
export const CONTEXT_WINDOW_TOKENS = 32768;
export const MAX_INPUT_TOKENS = 8151;
export const MAX_CALLS = 2;
export const PRIOR_USD = '0.010539228';
export const CAP_USD = '0.05';
export const NEW_MAX_USD = '0.00068376';
export const CUMULATIVE_USD = '0.011222988';
export const PRIOR_NANO = 10_539_228n;
export const CAP_NANO = 50_000_000n;
export const NEW_MAX_NANO = 683_760n;
export const CUMULATIVE_NANO = 11_222_988n;
export const ORIGINAL_NEW_MAX_NANO = 8_064_000n;
export const ORIGINAL_SPENT_NANO = 414_750n;
export const SUPPLEMENT_INPUTS = join(EVAL_DIR, 'visibility-choice-v1/supplement-inputs');
export const PINNED_REQUESTS = {
  'fresh-google-signed-out-who-is': {
    responseUtf8Bytes: 2740,
    requestUtf8Bytes: 4055,
    conservativeInputTokens: 8151,
    requestSha256: 'a034efed022caa32e00728a67bd248639eea379424d56db7fb0ce510aad1cabe',
  },
  'fresh-google-signed-out-name': {
    responseUtf8Bytes: 2718,
    requestUtf8Bytes: 4033,
    conservativeInputTokens: 8129,
    requestSha256: '5a7a37b320a9cb2e0b695bf1318f5d621b1390696c6f06c3393603bf9290d20e',
    capturedAtPacific: '2026-11-08 1:26 PM Pacific',
  },
};

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function usdToNano(text) {
  const [whole, frac = ''] = text.split('.');
  return BigInt(whole) * 1_000_000_000n + BigInt(`${frac}000000000`.slice(0, 9));
}

if (usdToNano(PRIOR_USD) !== PRIOR_NANO) throw new Error('supplement prior nano drifted');
if (usdToNano(CAP_USD) !== CAP_NANO) throw new Error('supplement cap nano drifted');
if (usdToNano(NEW_MAX_USD) !== NEW_MAX_NANO) throw new Error('supplement new max nano drifted');
if (usdToNano(CUMULATIVE_USD) !== CUMULATIVE_NANO) throw new Error('supplement cumulative nano drifted');
if ((8129n + 8151n) * DECISION1_PLANNING_NANO_PER_TOKEN !== NEW_MAX_NANO) {
  throw new Error('8129 plus 8151 times 42 nano is not the supplement max');
}
if (PRIOR_NANO + NEW_MAX_NANO !== CUMULATIVE_NANO) throw new Error('prior plus supplement max is not the cumulative bound');
if (MAX_INPUT_TOKENS >= CONTEXT_WINDOW_TOKENS) throw new Error('supplement bound is not under the documented context window');
if (ORIGINAL_SPENT_NANO + NEW_MAX_NANO > ORIGINAL_NEW_MAX_NANO) {
  throw new Error('supplement would exceed the original experiment maximum');
}
if (PRIOR_NANO + NEW_MAX_NANO > CAP_NANO) throw new Error('supplement would exceed the cumulative cap');
if (sha256(readFileSync(ORIGINAL_RUNNER_FILE)) !== ORIGINAL_RUNNER_SHA256) {
  throw new Error('original choice runner was modified');
}
if (sha256(readFileSync(FREEZE_FILE)) !== ORIGINAL_R2_SHA256) throw new Error('original r2 freeze was modified');
if (sha256(readFileSync(join(EVAL_DIR, 'visibility-choice-v1/freeze.json'))) !== ORIGINAL_FREEZE_SHA256) {
  throw new Error('original prompt freeze was modified');
}

function writeDurable(path, bytes) {
  let fd;
  try {
    fd = openSync(path, 'wx');
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

function writeBudget(path, budget) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeDurable(tmp, Buffer.from(`${JSON.stringify(budget, null, 2)}\n`));
  renameSync(tmp, path);
}

function journalEntries(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function usageOf(parsed) {
  const usage = parsed && typeof parsed === 'object' ? parsed.usage : undefined;
  const read = (key) => {
    if (!usage || typeof usage !== 'object' || !Object.hasOwn(usage, key)) return null;
    const value = usage[key];
    if (!Number.isInteger(value) || value < 0) return null;
    return value;
  };
  const input = read('input_tokens');
  const output = read('output_tokens');
  if (input === null || output === null) return null;
  return { input_tokens: input, output_tokens: output };
}

export function supplementSlots() {
  const byId = new Map(plannedSlots().map((slot) => [slot.id, slot]));
  return SUPPLEMENT_IDS.map((id) => {
    const slot = byId.get(id);
    if (!slot) throw new Error(`${id} is not an original planned slot`);
    return slot;
  });
}

function assertSeparateRun(root) {
  const planPath = join(root, 'plan.json');
  if (!existsSync(planPath)) return;
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  if (plan.version === 'visibility-choice-v1') throw new Error('refusing to write the supplement into the original run');
}

/** Inventory of the two eligible ids. A missing file stays missing. No stand-in answer is written. */
export function prepareSupplement({ answersRoot, outRoot } = {}) {
  if (outRoot) assertSeparateRun(outRoot);
  const items = [];
  for (const slot of supplementSlots()) {
    const path = answersRoot ? join(answersRoot, `${slot.id}.txt`) : null;
    if (!path || !existsSync(path)) {
      items.push({ ...slot, status: 'missing', responseSha256: null, requestSha256: null, conservativeInputTokens: null });
      continue;
    }
    const responseBytes = readFileSync(path);
    const built = buildChoiceRequest(responseBytes.toString('utf8'));
    const base = {
      ...slot,
      responseSha256: sha256(responseBytes),
      responseUtf8Bytes: responseBytes.length,
      requestUtf8Bytes: built.bytes.length,
      conservativeInputTokens: built.conservativeInputTokens,
    };
    const pin = PINNED_REQUESTS[slot.id];
    if (built.conservativeInputTokens > MAX_INPUT_TOKENS) {
      if (outRoot) {
        const preserved = join(outRoot, 'preserved', `${slot.id}.txt`);
        mkdirSync(dirname(preserved), { recursive: true });
        if (existsSync(preserved)) {
          if (Buffer.compare(readFileSync(preserved), responseBytes) !== 0) throw new Error(`refusing to overwrite ${preserved}`);
        } else {
          writeDurable(preserved, responseBytes);
        }
      }
      items.push({ ...base, status: 'blocked', requestSha256: null });
      continue;
    }
    if (
      responseBytes.length !== pin.responseUtf8Bytes
      || built.bytes.length !== pin.requestUtf8Bytes
      || built.conservativeInputTokens !== pin.conservativeInputTokens
      || built.sha256 !== pin.requestSha256
    ) {
      throw new Error(`${slot.id} does not match the pinned supplement request`);
    }
    if (outRoot) {
      const requestPath = join(outRoot, 'requests', `${slot.id}.json`);
      mkdirSync(dirname(requestPath), { recursive: true });
      if (existsSync(requestPath)) {
        if (Buffer.compare(readFileSync(requestPath), built.bytes) !== 0) throw new Error(`refusing to overwrite ${requestPath}`);
      } else {
        writeDurable(requestPath, built.bytes);
      }
    }
    items.push({
      ...base,
      status: 'ready',
      requestPath: `requests/${slot.id}.json`,
      requestSha256: built.sha256,
    });
  }
  const plan = {
    version: SUPPLEMENT_VERSION,
    questionsSha256: sha256(readFileSync(QUESTION_FILE)),
    profileSha256: sha256(readFileSync(PROFILE_FILE)),
    profileTextSha256: sha256(Buffer.from(loadProfileText())),
    runnerSha256: sha256(readFileSync(SUPPLEMENT_FILE)),
    originalRunnerSha256: ORIGINAL_RUNNER_SHA256,
    priorUsd: PRIOR_USD,
    capUsd: CAP_USD,
    newMaxUsd: NEW_MAX_USD,
    tokenBound: `request utf-8 bytes plus ${DECISION1_BYTE_OVERHEAD}`,
    maxInputTokens: MAX_INPUT_TOKENS,
    contextWindowTokens: CONTEXT_WINDOW_TOKENS,
    retries: 0,
    calls: 0,
    executeNow: false,
    items,
  };
  let planSha256 = null;
  if (outRoot) {
    const planPath = join(outRoot, 'plan.json');
    const body = Buffer.from(`${JSON.stringify(plan, null, 2)}\n`);
    if (existsSync(planPath)) {
      if (Buffer.compare(readFileSync(planPath), body) !== 0) throw new Error('refusing to overwrite plan.json');
    } else {
      writeDurable(planPath, body);
    }
    planSha256 = sha256(readFileSync(planPath));
  }
  return { plan, planSha256, calls: 0 };
}

export function assertSupplementPlan(plan) {
  if (plan?.version !== SUPPLEMENT_VERSION) throw new Error('plan version is not the supplement');
  if (plan.questionsSha256 !== sha256(readFileSync(QUESTION_FILE))) throw new Error('question file hash does not match the plan');
  if (plan.profileSha256 !== sha256(readFileSync(PROFILE_FILE))) throw new Error('profile file hash does not match the plan');
  if (plan.profileTextSha256 !== sha256(Buffer.from(loadProfileText()))) throw new Error('profile text hash does not match the plan');
  if (plan.runnerSha256 !== sha256(readFileSync(SUPPLEMENT_FILE))) throw new Error('supplement runner hash does not match the plan');
  if (plan.originalRunnerSha256 !== ORIGINAL_RUNNER_SHA256) throw new Error('plan does not pin the original runner');
  if (plan.priorUsd !== PRIOR_USD || plan.capUsd !== CAP_USD || plan.newMaxUsd !== NEW_MAX_USD) {
    throw new Error('plan budget does not match the supplement pins');
  }
  if (plan.maxInputTokens !== MAX_INPUT_TOKENS || plan.retries !== 0 || plan.executeNow !== false) {
    throw new Error('plan is not the two-call supplement');
  }
  if (!Array.isArray(plan.items) || plan.items.length !== SUPPLEMENT_IDS.length) throw new Error('plan must contain the two supplement slots');
  if (plan.items.some((item, index) => item.id !== SUPPLEMENT_IDS[index])) throw new Error('plan ids are not the two eligible slots');
  for (const item of plan.items) {
    if (item.status !== 'ready') continue;
    const pin = PINNED_REQUESTS[item.id];
    if (item.requestSha256 !== pin.requestSha256 || item.conservativeInputTokens !== pin.conservativeInputTokens) {
      throw new Error(`${item.id} ready request is not the pinned supplement input`);
    }
  }
  return plan;
}

export function verifySupplementFiles(plan, runRoot) {
  assertSupplementPlan(plan);
  assertSeparateRun(runRoot);
  for (const item of plan.items) {
    if (item.status !== 'ready') continue;
    const requestPath = join(runRoot, item.requestPath);
    if (!existsSync(requestPath)) throw new Error(`${item.id} request file is missing`);
    const bytes = readFileSync(requestPath);
    if (sha256(bytes) !== item.requestSha256) throw new Error(`${item.id} request hash does not match the plan`);
    if (bytes.length + DECISION1_BYTE_OVERHEAD > MAX_INPUT_TOKENS) throw new Error(`${item.id} exceeds the supplement token bound`);
    const payload = JSON.parse(bytes.toString('utf8'));
    const stateKeys = Object.keys(payload.state ?? {});
    if (stateKeys.length !== 2 || stateKeys[0] !== 'profile' || stateKeys[1] !== 'response') {
      throw new Error(`${item.id} state must be profile and response only`);
    }
    if (payload.state.profile !== loadProfileText()) throw new Error(`${item.id} profile does not match the pin`);
    if (Object.keys(payload.questions ?? {}).join() !== 'visibility') throw new Error(`${item.id} must ask only visibility`);
    if (payload.model !== 'decision-1-eval') throw new Error(`${item.id} model is not decision-1-eval`);
  }
}

export function verifySupplementFreeze(expectedSha) {
  verifyFreeze();
  const bytes = readFileSync(SUPPLEMENT_FREEZE_FILE);
  if (expectedSha && sha256(bytes) !== expectedSha) throw new Error('supplement freeze does not match --freeze-sha');
  const freeze = JSON.parse(bytes.toString('utf8'));
  if (freeze.candidate !== SUPPLEMENT_VERSION) throw new Error('supplement freeze candidate mismatch');
  if (freeze.promptFrozenAtUtc !== '2026-11-08T20:22:23Z') throw new Error('supplement dropped the prompt freeze time');
  if (freeze.codeFrozenAtUtc == null) throw new Error('supplement freeze time is missing');
  if (freeze.questionsSha256 !== sha256(readFileSync(QUESTION_FILE))) throw new Error('supplement question hash mismatch');
  if (freeze.profileSha256 !== sha256(readFileSync(PROFILE_FILE))) throw new Error('supplement profile hash mismatch');
  if (freeze.supplementRunnerSha256 !== sha256(readFileSync(SUPPLEMENT_FILE))) throw new Error('supplement runner hash mismatch');
  if (freeze.originalRunnerSha256 !== ORIGINAL_RUNNER_SHA256) throw new Error('supplement original runner pin mismatch');
  if (freeze.originalR2Sha256 !== ORIGINAL_R2_SHA256) throw new Error('supplement r2 pin mismatch');
  if (freeze.maxInputTokens !== MAX_INPUT_TOKENS || freeze.maxCalls !== MAX_CALLS) throw new Error('supplement limits mismatch');
  if (freeze.newMaxUsd !== NEW_MAX_USD || freeze.cumulativeUsd !== CUMULATIVE_USD) throw new Error('supplement budget pin mismatch');
  if (freeze.nameCapturedAtPacific !== PINNED_REQUESTS['fresh-google-signed-out-name'].capturedAtPacific) {
    throw new Error('supplement name capture time mismatch');
  }
  for (const [id, pin] of Object.entries(PINNED_REQUESTS)) {
    if (freeze.requests?.[id]?.requestSha256 !== pin.requestSha256) throw new Error(`supplement request pin mismatch for ${id}`);
  }
  return freeze;
}

function budgetBreach(spent, extra) {
  const next = spent + extra;
  if (next > NEW_MAX_NANO) return 'new-run-max';
  if (PRIOR_NANO + next > CAP_NANO) return 'cumulative-cap';
  if (ORIGINAL_SPENT_NANO + next > ORIGINAL_NEW_MAX_NANO) return 'original-experiment-max';
  return null;
}

export async function executeSupplement({ plan, runRoot, execute = false, transport, sleep = liveSleep, spacingMs = SPACING_MS }) {
  verifySupplementFiles(plan, runRoot);
  const summary = { verified: plan.items.length, calls: 0, sent: [], skipped: [], blocked: [], missing: [], stopped: null, retries: 0 };
  for (const item of plan.items) {
    if (item.status === 'blocked') summary.blocked.push(item.id);
    if (item.status === 'missing') summary.missing.push(item.id);
  }
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
      priorUsageNano: PRIOR_NANO.toString(),
      newMaxNano: NEW_MAX_NANO.toString(),
      capNano: CAP_NANO.toString(),
      originalSpentNano: ORIGINAL_SPENT_NANO.toString(),
      originalNewMaxNano: ORIGINAL_NEW_MAX_NANO.toString(),
      spentNewNano: '0',
      inputTokens: 0,
      calls: armedRecords,
      retries: 0,
      usageUnknown: false,
    }, null, 2)}\n`));
  }
  let sends = 0;
  for (const item of plan.items) {
    if (item.status !== 'ready') continue;
    const current = latest.get(item.id);
    if (current?.phase === 'responded' || current?.phase === 'stopped') {
      summary.skipped.push(item.id);
      continue;
    }
    if (armedRecords + sends >= MAX_CALLS) {
      summary.stopped = 'attempt-cap';
      break;
    }
    const spent = BigInt(JSON.parse(readFileSync(budgetPath, 'utf8')).spentNewNano || '0');
    const reserve = BigInt(item.conservativeInputTokens) * DECISION1_PLANNING_NANO_PER_TOKEN;
    const blocked = budgetBreach(spent, reserve);
    if (blocked) {
      summary.stopped = blocked;
      break;
    }
    if (sends > 0) await sleep(spacingMs);
    const bytes = readFileSync(join(runRoot, item.requestPath));
    appendDurable(journalPath, `${JSON.stringify({ id: item.id, phase: 'armed', requestSha256: item.requestSha256 })}\n`);
    const armedBudget = JSON.parse(readFileSync(budgetPath, 'utf8'));
    writeBudget(budgetPath, { ...armedBudget, calls: armedRecords + sends + 1, retries: 0 });
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
    const body = Buffer.isBuffer(http?.body) ? http.body : Buffer.alloc(0);
    const status = Number.isInteger(http?.status) ? http.status : null;
    const stem = join(runRoot, 'responses', item.id);
    writeDurable(`${stem}.status.json`, Buffer.from(`${JSON.stringify({ status, incomplete: http?.incomplete === true })}\n`));
    writeDurable(`${stem}.headers.json`, Buffer.from(`${JSON.stringify(http?.headers ?? {}, null, 2)}\n`));
    writeDurable(`${stem}.body`, body);
    if (http?.incomplete === true || status !== 200) {
      appendDurable(journalPath, `${JSON.stringify({ id: item.id, phase: 'stopped', reason: status === null ? 'malformed' : `http-${status}-no-retry` })}\n`);
      summary.stopped = status === null ? 'malformed' : `http-${status}`;
      summary.sent.push(item.id);
      return summary;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(body.toString('utf8'));
    } catch {
      parsed = null;
    }
    const usage = usageOf(parsed);
    if (!usage || usage.input_tokens > MAX_INPUT_TOKENS || usage.input_tokens > item.conservativeInputTokens) {
      const budget = JSON.parse(readFileSync(budgetPath, 'utf8'));
      writeBudget(budgetPath, { ...budget, usageUnknown: !usage, retries: 0 });
      appendDurable(journalPath, `${JSON.stringify({ id: item.id, phase: 'stopped', reason: usage ? 'usage-over-bound' : 'bad-usage' })}\n`);
      summary.stopped = usage ? 'usage-over-bound' : 'bad-usage';
      summary.sent.push(item.id);
      return summary;
    }
    const budget = JSON.parse(readFileSync(budgetPath, 'utf8'));
    const spentNew = BigInt(budget.spentNewNano || '0') + (BigInt(usage.input_tokens) * DECISION1_PLANNING_NANO_PER_TOKEN);
    writeBudget(budgetPath, {
      ...budget,
      spentNewNano: spentNew.toString(),
      inputTokens: (budget.inputTokens || 0) + usage.input_tokens,
      retries: 0,
    });
    const decision = decideChoice(parsed);
    if (decision.outcome === 'invalid') {
      appendDurable(journalPath, `${JSON.stringify({ id: item.id, phase: 'stopped', reason: 'bad-probabilities' })}\n`);
      summary.stopped = 'bad-probabilities';
      summary.sent.push(item.id);
      return summary;
    }
    appendDurable(journalPath, `${JSON.stringify({ id: item.id, phase: 'responded', requestSha256: item.requestSha256 })}\n`);
    summary.sent.push(item.id);
    latest.set(item.id, { phase: 'responded' });
    const after = budgetBreach(spentNew, 0n);
    if (after) {
      summary.stopped = after;
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

/** Default: print the two slots and calls 0. --execute is opt-in and is not used by tests against a network. */
export async function mainSupplement(argv, hooks = {}) {
  if (!argv.includes('--answers') && !argv.includes('--execute')) {
    verifySupplementFreeze();
    const prepared = prepareSupplement({ answersRoot: SUPPLEMENT_INPUTS });
    console.log(JSON.stringify({
      candidate: SUPPLEMENT_VERSION,
      calls: 0,
      retries: 0,
      planned: prepared.plan.items.length,
      ready: prepared.plan.items.filter((item) => item.status === 'ready').length,
      missing: prepared.plan.items.filter((item) => item.status === 'missing').length,
      blocked: prepared.plan.items.filter((item) => item.status === 'blocked').length,
      questionsSha256: prepared.plan.questionsSha256,
      profileSha256: prepared.plan.profileSha256,
      maxInputTokens: MAX_INPUT_TOKENS,
      newMaxUsd: NEW_MAX_USD,
      cumulativeUsd: CUMULATIVE_USD,
      ids: prepared.plan.items.map((item) => item.id),
      requestSha256: Object.fromEntries(prepared.plan.items.map((item) => [item.id, item.requestSha256])),
    }));
    return 0;
  }
  if (!argv.includes('--execute')) {
    const answers = option(argv, '--answers');
    const out = option(argv, '--out');
    if (!answers || !out) throw new Error('prepare needs --answers and --out');
    const prepared = prepareSupplement({ answersRoot: answers, outRoot: out });
    console.log(JSON.stringify({
      calls: 0,
      planSha256: prepared.planSha256,
      ready: prepared.plan.items.filter((item) => item.status === 'ready').length,
      blocked: prepared.plan.items.filter((item) => item.status === 'blocked').length,
      missing: prepared.plan.items.filter((item) => item.status === 'missing').length,
    }));
    return 0;
  }
  const planPath = option(argv, '--plan');
  const planSha = option(argv, '--plan-sha');
  const freezeSha = option(argv, '--freeze-sha');
  const runRoot = option(argv, '--run-root');
  if (!planPath || !planSha || !freezeSha || !runRoot) throw new Error('execute needs --plan, --plan-sha, --freeze-sha, and --run-root');
  if (option(argv, '--budget-prior') !== PRIOR_USD || option(argv, '--budget-cap') !== CAP_USD || option(argv, '--budget-new') !== NEW_MAX_USD) {
    throw new Error('execute budget flags do not match the pinned prior, cap, and new max');
  }
  if (sha256(readFileSync(SUPPLEMENT_FREEZE_FILE)) !== freezeSha) throw new Error('supplement freeze does not match --freeze-sha');
  if (sha256(readFileSync(planPath)) !== planSha) throw new Error('plan file does not match --plan-sha');
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  assertSupplementPlan(plan);
  verifySupplementFiles(plan, runRoot);
  verifySupplementFreeze(freezeSha);
  const endpoint = option(argv, '--endpoint');
  const resource = option(argv, '--resource');
  const azBin = option(argv, '--az');
  if (endpoint !== DECISION1_ENDPOINT) throw new Error('endpoint is not the pinned systemone URL');
  assertSystemoneEndpoint(endpoint);
  if (resource !== RESOURCE) throw new Error('resource is not https://cognitiveservices.azure.com');
  if (!azBin || !existsSync(azBin)) throw new Error('az binary is missing');
  const token = await readAzAccessToken({ azBin, resource, spawnImpl: hooks.spawnImpl });
  const summary = await executeSupplement({
    plan,
    runRoot,
    execute: true,
    transport: (body) => postChoice({ endpoint, body, token, requestImpl: hooks.requestImpl }),
    sleep: hooks.sleep ?? liveSleep,
    spacingMs: SPACING_MS,
  });
  console.log(JSON.stringify({ verified: summary.verified, calls: summary.calls, sent: summary.sent, blocked: summary.blocked, missing: summary.missing, stopped: summary.stopped, retries: summary.retries }));
  return summary.stopped ? 1 : 0;
}

export function exportSupplementBundle(outDir) {
  const files = [
    'lib/visibility-choice-v1-supplement.mjs',
    'lib/visibility-choice-v1.mjs',
    'lib/decision1-send.mjs',
    'lib/decision1-strict.mjs',
    'lib/strict-visibility-v2.mjs',
    'lib/strict-visibility.mjs',
    'lib/load.mjs',
    'lib/schema.mjs',
    'lib/frozen-path.mjs',
    'visibility-choice-v1/profile.json',
    'visibility-choice-v1/question.json',
    'visibility-choice-v1/freeze.json',
    'visibility-choice-v1/freeze-r2.json',
    'visibility-choice-v1/supplement-freeze.json',
  ];
  for (const file of files) {
    mkdirSync(join(outDir, dirname(file)), { recursive: true });
    cpSync(join(EVAL_DIR, file), join(outDir, file));
  }
  writeFileSync(join(outDir, 'prepare.mjs'), `#!/usr/bin/env node
import { mainSupplement } from './lib/visibility-choice-v1-supplement.mjs';

mainSupplement(process.argv.slice(2)).then((code) => process.exit(code ?? 0), (error) => {
  console.error(error.message);
  process.exit(1);
});
`);
  writeFileSync(join(outDir, 'README.md'), `# Visibility choice v1 supplement preflight

This bundle is the two-slot supplement. It does not replace the original 24-slot run.
\`node prepare.mjs\` prints the two eligible ids and calls 0. It does not send.
The per-call ceiling is 8151 conservative tokens (request UTF-8 bytes plus 4096), which is the larger of the two measured requests and is under the documented 32768-token context window. The new maximum is exactly $0.00068376, the sum of the measured 8129 and 8151 token bounds at 42 nanodollars per token. A larger request is preserved and not sent. The name file is the later 1:26 PM Pacific capture, not a fill of the original missing slot.
--freeze-sha is supplement-freeze.json. The original prompt freeze remains 2026-11-08T20:22:23Z. freeze.json and freeze-r2.json in this folder are copies and must stay byte-identical to the original experiment.
Do not pass --execute until a separate review. This bundle does not authorize a call.
`);
  return outDir;
}
