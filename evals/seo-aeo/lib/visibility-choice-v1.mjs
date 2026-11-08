// Single-choice visibility candidate. Default commands do not send.
// Does not read gold or expected labels. Does not modify the v1 sender.
import { createHash } from 'node:crypto';
import { closeSync, cpSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync, writeSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
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
import { PROSPECTIVE_QUERIES } from './strict-visibility-v2.mjs';

export const CHOICE_VERSION = 'visibility-choice-v1';
export const CHOICE_DIR = join(EVAL_DIR, 'visibility-choice-v1');
export const PROFILE_FILE = join(CHOICE_DIR, 'profile.json');
export const QUESTION_FILE = join(CHOICE_DIR, 'question.json');
export const FREEZE_FILE = join(CHOICE_DIR, 'freeze.json');
export const RUNNER_FILE = fileURLToPath(import.meta.url);
export const MAX_INPUT_TOKENS = 8000;
export const MAX_CALLS = 24;
export const PRIOR_USD = '0.010124478';
export const CAP_USD = '0.05';
export const NEW_MAX_USD = '0.008064';
export const PRIOR_NANO = 10_124_478n;
export const CAP_NANO = 50_000_000n;
export const NEW_MAX_NANO = 8_064_000n;
export const SPACING_MS = 5000;
export const RESOURCE = 'https://cognitiveservices.azure.com';

const BOUNDARY = [
  ['boundary-clear-target', 'Yes'],
  ['boundary-no-citation', 'Yes'],
  ['boundary-minor-factual-error', 'Yes'],
  ['boundary-crime-only', 'No'],
  ['boundary-disclaimer', 'No'],
  ['boundary-disambiguation', 'No'],
  ['boundary-cannot-identify', 'No'],
  ['boundary-name-only', 'No'],
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function usdToNano(text) {
  const [whole, frac = ''] = text.split('.');
  return BigInt(whole) * 1_000_000_000n + BigInt(`${frac}000000000`.slice(0, 9));
}

if (usdToNano(PRIOR_USD) !== PRIOR_NANO) throw new Error('prior nano drifted');
if (usdToNano(CAP_USD) !== CAP_NANO) throw new Error('cap nano drifted');
if (usdToNano(NEW_MAX_USD) !== NEW_MAX_NANO) throw new Error('new max nano drifted');
if (MAX_INPUT_TOKENS * MAX_CALLS * Number(DECISION1_PLANNING_NANO_PER_TOKEN) !== Number(NEW_MAX_NANO)) {
  throw new Error('24 by 8000 by 42 nano is not the new run max');
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

export function loadProfileText() {
  const parsed = JSON.parse(readFileSync(PROFILE_FILE, 'utf8'));
  if (typeof parsed.text !== 'string' || parsed.text.length === 0) throw new Error('profile text is missing');
  return parsed.text;
}

export function loadWireQuestion() {
  const parsed = JSON.parse(readFileSync(QUESTION_FILE, 'utf8'));
  if (parsed.type !== 'choice') throw new Error('question type is not choice');
  if (typeof parsed.instructions !== 'string' || !parsed.criteria?.Yes || !parsed.criteria?.No) {
    throw new Error('question must be one Yes or No choice');
  }
  if (Object.keys(parsed.criteria).length !== 2) throw new Error('question has extra choices');
  return {
    type: 'choice',
    instructions: parsed.instructions,
    criteria: { Yes: parsed.criteria.Yes, No: parsed.criteria.No },
  };
}

export function plannedSlots() {
  const queries = PROSPECTIVE_QUERIES.map((query) => ({ id: query.id, prompt: query.prompt }));
  const engineSlots = (bucket, engine) => queries.map((query) => ({
    id: `${bucket}-${engine}-signed-out-${query.id}`,
    bucket,
    engine,
    session: 'signed-out',
    queryId: query.id,
    prompt: query.prompt,
  }));
  return [
    ...engineSlots('known', 'google'),
    ...engineSlots('known', 'gemini'),
    ...BOUNDARY.map(([id]) => ({
      id,
      bucket: 'boundary',
      engine: 'synthetic',
      session: 'fixture',
      queryId: null,
      prompt: null,
    })),
    ...engineSlots('fresh', 'google'),
    ...engineSlots('fresh', 'gemini'),
  ];
}

export function buildChoiceRequest(responseText) {
  if (typeof responseText !== 'string') throw new Error('response must be a string');
  const payload = {
    model: 'decision-1-eval',
    state: { profile: loadProfileText(), response: responseText },
    questions: { visibility: loadWireQuestion() },
  };
  const bytes = Buffer.from(JSON.stringify(payload));
  const conservativeInputTokens = bytes.length + DECISION1_BYTE_OVERHEAD;
  return { payload, bytes, sha256: sha256(bytes), conservativeInputTokens };
}

export function responseFile(slot) {
  if (slot.bucket === 'boundary') return join(CHOICE_DIR, 'synthetic', `${slot.id}.txt`);
  return null;
}

function stagedResponse(answersRoot, slot) {
  if (!answersRoot) return null;
  const path = join(answersRoot, `${slot.id}.txt`);
  if (!existsSync(path)) return null;
  return path;
}

/** Inventory and optional pin. Does not send. Oversize responses are preserved and not requested. */
export function prepareChoice({ answersRoot, outRoot } = {}) {
  const slots = plannedSlots();
  if (slots.length !== 24 || new Set(slots.map((slot) => slot.id)).size !== 24) {
    throw new Error('plan is not 24 unique slots');
  }
  const items = [];
  for (const slot of slots) {
    const repoPath = responseFile(slot);
    const staged = stagedResponse(answersRoot, slot);
    if (slot.bucket === 'boundary' && staged) {
      const repoBytes = readFileSync(repoPath);
      const stagedBytes = readFileSync(staged);
      if (Buffer.compare(repoBytes, stagedBytes) !== 0) throw new Error(`${slot.id} staged synthetic does not match the fixture`);
    }
    const path = staged ?? repoPath;
    if (!path) {
      items.push({ ...slot, status: 'missing', responseSha256: null, requestSha256: null, conservativeInputTokens: null });
      continue;
    }
    const responseBytes = readFileSync(path);
    const responseText = responseBytes.toString('utf8');
    const built = buildChoiceRequest(responseText);
    const base = {
      ...slot,
      responseSha256: sha256(responseBytes),
      responseUtf8Bytes: responseBytes.length,
      requestUtf8Bytes: built.bytes.length,
      conservativeInputTokens: built.conservativeInputTokens,
    };
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
    if (outRoot) {
      const requestPath = join(outRoot, 'requests', `${slot.id}.json`);
      mkdirSync(dirname(requestPath), { recursive: true });
      if (existsSync(requestPath)) {
        const current = readFileSync(requestPath);
        if (Buffer.compare(current, built.bytes) !== 0) throw new Error(`refusing to overwrite ${requestPath}`);
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
    version: CHOICE_VERSION,
    questionsSha256: sha256(readFileSync(QUESTION_FILE)),
    profileSha256: sha256(readFileSync(PROFILE_FILE)),
    profileTextSha256: sha256(Buffer.from(loadProfileText())),
    runnerSha256: sha256(readFileSync(RUNNER_FILE)),
    priorUsd: PRIOR_USD,
    capUsd: CAP_USD,
    newMaxUsd: NEW_MAX_USD,
    tokenBound: `request utf-8 bytes plus ${DECISION1_BYTE_OVERHEAD}`,
    maxInputTokens: MAX_INPUT_TOKENS,
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
      const current = readFileSync(planPath);
      if (Buffer.compare(current, body) !== 0) throw new Error('refusing to overwrite plan.json');
    } else {
      writeDurable(planPath, body);
    }
    planSha256 = sha256(readFileSync(planPath));
  }
  return { plan, planSha256, calls: 0 };
}

export function assertChoicePlan(plan) {
  if (plan?.version !== CHOICE_VERSION) throw new Error('plan version is not visibility-choice-v1');
  if (plan.questionsSha256 !== sha256(readFileSync(QUESTION_FILE))) throw new Error('question file hash does not match the plan');
  if (plan.profileSha256 !== sha256(readFileSync(PROFILE_FILE))) throw new Error('profile file hash does not match the plan');
  if (plan.profileTextSha256 !== sha256(Buffer.from(loadProfileText()))) throw new Error('profile text hash does not match the plan');
  if (plan.runnerSha256 !== sha256(readFileSync(RUNNER_FILE))) throw new Error('runner file hash does not match the plan');
  if (plan.priorUsd !== PRIOR_USD || plan.capUsd !== CAP_USD || plan.newMaxUsd !== NEW_MAX_USD) {
    throw new Error('plan budget does not match the pinned prior, cap, and new max');
  }
  if (plan.retries !== 0 || plan.executeNow !== false) throw new Error('plan is not a no-retry plan');
  if (!Array.isArray(plan.items) || plan.items.length !== 24) throw new Error('plan must contain 24 slots');
  const expected = plannedSlots().map((slot) => slot.id);
  if (plan.items.some((item, index) => item.id !== expected[index])) throw new Error('plan ids are not the ordered 24');
  return plan;
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

function probability(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Max Yes or No probability. Ties and schema gaps are not a semantic No. Confidence is ignored. */
export function decideChoice(parsed) {
  const answer = parsed && typeof parsed === 'object' ? parsed.answers?.visibility : undefined;
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
    return { outcome: 'invalid', problems: ['visibility answer is missing'] };
  }
  if (answer.type !== 'choice') return { outcome: 'invalid', problems: ['visibility type is not choice'] };
  const probabilities = answer.probabilities;
  if (!probabilities || typeof probabilities !== 'object' || Array.isArray(probabilities)) {
    return { outcome: 'invalid', problems: ['probabilities are missing'] };
  }
  if (Object.hasOwn(answer, 'probs') && !Object.hasOwn(answer, 'probabilities')) {
    return { outcome: 'invalid', problems: ['probs is not probabilities'] };
  }
  if (!probability(probabilities.Yes) || !probability(probabilities.No)) {
    return { outcome: 'invalid', problems: ['Yes and No probabilities must be finite and nonnegative'] };
  }
  if (probabilities.Yes === probabilities.No) {
    return { outcome: 'tie', problems: ['Yes and No probabilities tie'], probabilities };
  }
  const picked = probabilities.Yes > probabilities.No ? 'Yes' : 'No';
  if (answer.choice !== picked) {
    return { outcome: 'invalid', problems: ['choice does not match the higher probability'], probabilities };
  }
  return { outcome: picked === 'Yes' ? 'yes' : 'no', problems: [], probabilities, choice: picked };
}

function readBudget(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Sends only ready slots when execute is true. Blocked and missing slots are not armed.
 * A bad response stops the run after the raw bytes are stored.
 */
export function verifyChoiceFiles(plan, runRoot) {
  assertChoicePlan(plan);
  for (const item of plan.items) {
    if (item.status !== 'ready') continue;
    const requestPath = join(runRoot, item.requestPath);
    if (!existsSync(requestPath)) throw new Error(`${item.id} request file is missing`);
    const bytes = readFileSync(requestPath);
    if (sha256(bytes) !== item.requestSha256) throw new Error(`${item.id} request hash does not match the plan`);
    if (bytes.length + DECISION1_BYTE_OVERHEAD > MAX_INPUT_TOKENS) throw new Error(`${item.id} exceeds the token bound`);
    const payload = JSON.parse(bytes.toString('utf8'));
    const stateKeys = Object.keys(payload.state ?? {});
    if (stateKeys.length !== 2 || stateKeys[0] !== 'profile' || stateKeys[1] !== 'response') {
      throw new Error(`${item.id} state must be profile and response only`);
    }
    if (payload.state.profile !== loadProfileText()) throw new Error(`${item.id} profile does not match the pin`);
    if (Object.keys(payload.questions ?? {}).join() !== 'visibility') throw new Error(`${item.id} must ask only visibility`);
  }
}

export async function executeChoice({ plan, runRoot, execute = false, transport, sleep = liveSleep, spacingMs = SPACING_MS }) {
  verifyChoiceFiles(plan, runRoot);
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
      spentNewNano: '0',
      inputTokens: 0,
      calls: armedRecords,
      retries: 0,
      usageUnknown: false,
    }, null, 2)}\n`));
  }
  let sends = 0;
  const reserve = BigInt(MAX_INPUT_TOKENS) * DECISION1_PLANNING_NANO_PER_TOKEN;
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
    const spent = BigInt(readBudget(budgetPath).spentNewNano || '0');
    if (spent + reserve > NEW_MAX_NANO) {
      summary.stopped = 'new-run-max';
      break;
    }
    if (PRIOR_NANO + spent + reserve > CAP_NANO) {
      summary.stopped = 'cumulative-cap';
      break;
    }
    if (sends > 0) await sleep(spacingMs);
    const bytes = readFileSync(join(runRoot, item.requestPath));
    appendDurable(journalPath, `${JSON.stringify({ id: item.id, phase: 'armed', requestSha256: item.requestSha256 })}\n`);
    const armedBudget = readBudget(budgetPath);
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
    const folder = join(runRoot, 'responses');
    const stem = join(folder, item.id);
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
      const budget = readBudget(budgetPath);
      writeBudget(budgetPath, { ...budget, usageUnknown: !usage, retries: 0 });
      appendDurable(journalPath, `${JSON.stringify({ id: item.id, phase: 'stopped', reason: usage ? 'usage-over-bound' : 'bad-usage' })}\n`);
      summary.stopped = usage ? 'usage-over-bound' : 'bad-usage';
      summary.sent.push(item.id);
      return summary;
    }
    const budget = readBudget(budgetPath);
    const spentNew = BigInt(budget.spentNewNano || '0') + (BigInt(usage.input_tokens) * DECISION1_PLANNING_NANO_PER_TOKEN);
    writeBudget(budgetPath, {
      ...budget,
      spentNewNano: spentNew.toString(),
      inputTokens: (budget.inputTokens || 0) + usage.input_tokens,
      retries: 0,
    });
    appendDurable(journalPath, `${JSON.stringify({ id: item.id, phase: 'responded', requestSha256: item.requestSha256 })}\n`);
    summary.sent.push(item.id);
    latest.set(item.id, { phase: 'responded' });
    if (spentNew > NEW_MAX_NANO || PRIOR_NANO + spentNew > CAP_NANO) {
      summary.stopped = spentNew > NEW_MAX_NANO ? 'new-run-max' : 'cumulative-cap';
      return summary;
    }
  }
  return summary;
}

export function accountChoice(plan, decisions = new Map(), labels = new Map()) {
  const rows = plan.items.map((item) => {
    const decision = decisions.get(item.id);
    let outcome = item.status === 'blocked' ? 'blocked' : item.status === 'missing' ? 'missing' : 'unsent';
    if (decision) outcome = decision.outcome;
    const label = labels.has(item.id) ? labels.get(item.id) : undefined;
    return { id: item.id, bucket: item.bucket, engine: item.engine, outcome, label: label ?? null };
  });
  if (rows.length !== 24) throw new Error('accounted row count is not 24');
  const tally = (name) => rows.filter((row) => row.outcome === name).length;
  const outcomes = {
    yes: tally('yes'),
    no: tally('no'),
    tie: tally('tie'),
    invalid: tally('invalid'),
    missing: tally('missing'),
    blocked: tally('blocked'),
    unsent: tally('unsent'),
  };
  const accounted = Object.values(outcomes).reduce((sum, count) => sum + count, 0);
  if (accounted !== 24) throw new Error(`accounted ${accounted} of 24`);
  let falseYes = 0;
  let falseNo = 0;
  for (const row of rows) {
    if (row.label !== 'Yes' && row.label !== 'No') continue;
    if (row.outcome === 'yes' && row.label === 'No') falseYes += 1;
    if (row.outcome === 'no' && row.label === 'Yes') falseNo += 1;
  }
  const buckets = {};
  for (const row of rows) {
    const bucket = buckets[row.bucket] ?? { planned: 0, yes: 0, no: 0, tie: 0, invalid: 0, missing: 0, blocked: 0, unsent: 0 };
    bucket.planned += 1;
    bucket[row.outcome] += 1;
    buckets[row.bucket] = bucket;
  }
  return {
    candidate: CHOICE_VERSION,
    planned: 24,
    accounted,
    calls: 0,
    outcomes,
    falseYes,
    falseNo,
    buckets,
    fullPipeline: { yes: outcomes.yes, denominator: 24 },
    decisiveConditional: {
      yes: outcomes.yes,
      no: outcomes.no,
      denominator: outcomes.yes + outcomes.no,
      coverageDenominator: 24,
    },
    rows,
  };
}

export function verifyFreeze(expectedSha) {
  const bytes = readFileSync(FREEZE_FILE);
  if (expectedSha && sha256(bytes) !== expectedSha) throw new Error('freeze file does not match --freeze-sha');
  const freeze = JSON.parse(bytes.toString('utf8'));
  const check = (file, expected) => {
    if (sha256(readFileSync(file)) !== expected) throw new Error(`freeze hash mismatch for ${file}`);
  };
  check(QUESTION_FILE, freeze.questionsSha256);
  check(PROFILE_FILE, freeze.profileSha256);
  check(RUNNER_FILE, freeze.runnerSha256);
  if (freeze.frozenAtUtc == null || freeze.candidate !== CHOICE_VERSION) throw new Error('freeze record is incomplete');
  return freeze;
}

function option(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  return argv[index + 1];
}

function redact(text, token) {
  return token ? String(text).split(token).join('[redacted]') : String(text);
}

export function postChoice({ endpoint, body, token, timeoutMs = 60000, requestImpl = httpsRequest }) {
  if (endpoint !== DECISION1_ENDPOINT) throw new Error('endpoint is not the pinned systemone URL');
  assertSystemoneEndpoint(endpoint);
  const url = new URL(endpoint);
  return new Promise((resolve, reject) => {
    let settled = false;
    let started = false;
    let status = null;
    let headers = {};
    const chunks = [];
    const finish = (incomplete) => {
      if (settled) return;
      settled = true;
      resolve({ status, headers, body: Buffer.concat(chunks), incomplete });
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const req = requestImpl(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'content-length': body.length,
      },
      timeout: timeoutMs,
    }, (res) => {
      started = true;
      status = res.statusCode;
      headers = res.headers ?? {};
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => finish(false));
      res.on('error', () => finish(true));
      res.on('aborted', () => finish(true));
    });
    req.on('timeout', () => {
      req.destroy();
      fail(new Error('request timed out'));
    });
    req.on('error', (error) => {
      if (started) finish(true);
      else fail(new Error(redact(error.message, token)));
    });
    req.end(body);
  });
}

/** Default: print the 24-slot inventory. --execute is not used by tests against a network. */
export async function mainChoice(argv, hooks = {}) {
  if (!argv.includes('--answers') && !argv.includes('--execute')) {
    verifyFreeze();
    const prepared = prepareChoice();
    console.log(JSON.stringify({
      candidate: CHOICE_VERSION,
      calls: 0,
      retries: 0,
      planned: prepared.plan.items.length,
      ready: prepared.plan.items.filter((item) => item.status === 'ready').length,
      missing: prepared.plan.items.filter((item) => item.status === 'missing').length,
      blocked: prepared.plan.items.filter((item) => item.status === 'blocked').length,
      questionsSha256: prepared.plan.questionsSha256,
      profileSha256: prepared.plan.profileSha256,
      priorUsd: PRIOR_USD,
      capUsd: CAP_USD,
      newMaxUsd: NEW_MAX_USD,
      ids: prepared.plan.items.map((item) => item.id),
    }));
    return 0;
  }
  if (!argv.includes('--execute')) {
    const answers = option(argv, '--answers');
    const out = option(argv, '--out');
    if (!answers || !out) throw new Error('prepare needs --answers and --out');
    const prepared = prepareChoice({ answersRoot: answers, outRoot: out });
    console.log(JSON.stringify({ calls: 0, planSha256: prepared.planSha256, ready: prepared.plan.items.filter((item) => item.status === 'ready').length, blocked: prepared.plan.items.filter((item) => item.status === 'blocked').length, missing: prepared.plan.items.filter((item) => item.status === 'missing').length }));
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
  const freezeBytes = readFileSync(FREEZE_FILE);
  if (sha256(freezeBytes) !== freezeSha) throw new Error('freeze file does not match --freeze-sha');
  const planBytes = readFileSync(planPath);
  if (sha256(planBytes) !== planSha) throw new Error('plan file does not match --plan-sha');
  const plan = JSON.parse(planBytes.toString('utf8'));
  assertChoicePlan(plan);
  verifyChoiceFiles(plan, runRoot);
  verifyFreeze(freezeSha);
  const endpoint = option(argv, '--endpoint');
  const resource = option(argv, '--resource');
  const azBin = option(argv, '--az');
  if (endpoint !== DECISION1_ENDPOINT) throw new Error('endpoint is not the pinned systemone URL');
  assertSystemoneEndpoint(endpoint);
  if (resource !== RESOURCE) throw new Error('resource is not https://cognitiveservices.azure.com');
  if (!azBin || !existsSync(azBin)) throw new Error('az binary is missing');
  const token = await readAzAccessToken({ azBin, resource, spawnImpl: hooks.spawnImpl });
  const summary = await executeChoice({
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

export function exportChoiceBundle(outDir) {
  const files = [
    'lib/visibility-choice-v1.mjs',
    'lib/visibility-choice-v1-report.mjs',
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
  ];
  for (const file of files) {
    mkdirSync(join(outDir, dirname(file)), { recursive: true });
    cpSync(join(EVAL_DIR, file), join(outDir, file));
  }
  for (const name of BOUNDARY.map(([id]) => id)) {
    const relative = `visibility-choice-v1/synthetic/${name}.txt`;
    mkdirSync(join(outDir, dirname(relative)), { recursive: true });
    cpSync(join(EVAL_DIR, relative), join(outDir, relative));
  }
  writeFileSync(join(outDir, 'prepare.mjs'), `#!/usr/bin/env node
import { mainChoice } from './lib/visibility-choice-v1.mjs';

mainChoice(process.argv.slice(2)).then((code) => process.exit(code ?? 0), (error) => {
  console.error(error.message);
  process.exit(1);
});
`);
  writeFileSync(join(outDir, 'README.md'), `# Visibility choice v1 preflight

\`node prepare.mjs\` prints 24 slots and calls 0. It does not send.
\`node prepare.mjs --answers <dir> --out <dir>\` pins request bytes for staged responses. Synthetic fixtures come from this folder. A response whose request bytes plus 4096 exceed 8000 is copied under preserved/ and is not requested.
Do not pass --execute until a separate review. The freeze does not authorize a call.
The v1 eight-question sender is a different command.

Answer files are \`<id>.txt\` in the answers directory. Labels stay outside this folder and are not part of a request.
`);
  return outDir;
}
