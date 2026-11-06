// Sends a frozen plan v2 only from exact request files. It does not rebuild
// answer text or questions, does not read label files, and does not retry.
import { spawn as nodeSpawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, cpSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync, writeSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { dirname, join } from 'node:path';
import { EVAL_DIR } from './load.mjs';
import {
  DECISION1_CAP_NANO,
  DECISION1_DEPLOYMENT,
  DECISION1_MAX_ATTEMPTS,
  DECISION1_NEW_RESERVE_NANO,
  DECISION1_PRIOR_NANO,
  DECISION1_QUESTIONS_SHA256,
  loadDecision1Questions,
  planningEnvelopeNano,
} from './decision1-strict.mjs';

export const PLAN_V2_SHA256 = '8b5fa698f1f4d3b50bc0bd86215b6132780d84db41078fdbd27f2b3eb4862abf';
export const DECISION1_ENDPOINT = 'https://kalebcole2021-0169-resource.cognitiveservices.azure.com/providers/microsoft/v1/systemone';
export const DECISION1_RESOURCE = 'https://cognitiveservices.azure.com';
export const PLAN_V2_REQUEST_BYTES = 57763;
export const DEFAULT_AZ_BIN = '/home/box/.local/share/azure-cli-venv/bin/az';
export const SYSTEMONE_PATH = '/providers/microsoft/v1/systemone';
const SPACING_MS = 5000;

/** Live delay. Tests may pass a different sleep; the CLI does not. */
export function liveSleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

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

export function canonicalQuestions(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalQuestions(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalQuestions(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function assertPlanV2Document(plan) {
  if (plan?.version !== 'strict-visibility-win-v1-8case-offline-plan-v2') throw new Error('plan version is not v2');
  if (plan.prediction_calls_made !== 0) throw new Error('plan records prediction calls');
  if (plan.labels_or_outcomes_read !== false) throw new Error('plan says labels were read');
  if (!Array.isArray(plan.items) || plan.items.length < 1 || plan.items.length > DECISION1_MAX_ATTEMPTS) {
    throw new Error('plan must contain 1 to 8 items');
  }
  if (new Set(plan.items.map((item) => item.id)).size !== plan.items.length) throw new Error('plan item ids must be unique');
  if (plan.wire_source?.sha256 !== DECISION1_QUESTIONS_SHA256) throw new Error('plan wire sha does not match the pinned questions');
  if (plan.budget_preflight?.new_planning_reserve_usd !== '0.005') throw new Error('plan reserve is not $0.005');
  if (plan.budget_preflight?.prior_estimated_usd !== '0.009095688') throw new Error('plan prior usage does not match the pin');
  if (plan.budget_preflight?.cumulative_cap_usd !== '0.05') throw new Error('plan cap is not $0.05');
  let total = 0;
  for (const item of plan.items) {
    if (item.judge_deployment !== DECISION1_DEPLOYMENT) throw new Error(`${item.id} judge deployment is not decision-1-eval`);
    if (!String(item.judge_model_version || '').startsWith('1')) throw new Error(`${item.id} judge model version is not 1`);
    if (item.question_spec_version !== 'strict-visibility-decision1-v1') throw new Error(`${item.id} question spec version mismatch`);
    if (item.body_sha256 !== item.reviewed_raw_body_sha256) throw new Error(`${item.id} raw body hashes disagree`);
    if (!item.judge_input_sha256 || !item.request_sha256 || !item.request_path) throw new Error(`${item.id} is missing request identity`);
    if (!item.request_path.startsWith('requests.v2/') || item.request_path.includes('..')) throw new Error(`${item.id} request path must stay under requests.v2`);
    total += item.request_utf8_bytes;
  }
  if (total !== plan.budget_preflight.serialized_payload_total_utf8_bytes) {
    throw new Error('request byte sum does not match the plan budget');
  }
  const envelope = planningEnvelopeNano(total, plan.items.length);
  if (envelope.tokens !== BigInt(plan.budget_preflight.conservative_planning_envelope_tokens)) {
    throw new Error('planning envelope token count does not match the plan');
  }
  if (envelope.costNano > DECISION1_NEW_RESERVE_NANO) throw new Error('planning envelope exceeds the $0.005 reserve');
  if (DECISION1_PRIOR_NANO + DECISION1_NEW_RESERVE_NANO > DECISION1_CAP_NANO) throw new Error('reserve exceeds the $0.05 cap');
  return { totalRequestBytes: total, envelope };
}

/** Reads exact request bytes. Never opens source_path and never rewrites the file. */
export function verifyFrozenRequest(item, runRoot, questions = loadDecision1Questions().document.questions) {
  const requestPath = join(runRoot, item.request_path);
  if (!existsSync(requestPath)) throw new Error(`${item.id} request file is missing; refusing to regenerate ${item.request_path}`);
  const bytes = readFileSync(requestPath);
  const digest = sha256(bytes);
  if (digest !== item.request_sha256) throw new Error(`${item.id} request sha does not match request_sha256; refusing to regenerate`);
  if (bytes.length !== item.request_utf8_bytes) throw new Error(`${item.id} request byte length does not match the plan`);
  const payload = JSON.parse(bytes.toString('utf8'));
  if (payload.model !== DECISION1_DEPLOYMENT) throw new Error(`${item.id} request model is not decision-1-eval`);
  const stateKeys = Object.keys(payload.state || {});
  if (stateKeys.length !== 1 || stateKeys[0] !== 'answer_text') throw new Error(`${item.id} state must be answer_text only`);
  for (const key of ['query', 'expected', 'gold', 'label', 'labels', 'provisional', 'query_metadata_only', 'capture_engine', 'capture_model']) {
    if (key in payload.state) throw new Error(`${item.id} state contains ${key}`);
  }
  const answer = payload.state.answer_text;
  if (typeof answer !== 'string') throw new Error(`${item.id} answer_text is not a string`);
  if (sha256(Buffer.from(answer)) !== item.judge_input_sha256) {
    throw new Error(`${item.id} answer_text hash does not match judge_input_sha256`);
  }
  if (item.transformation?.header_removed === true) {
    const prefix = item.transformation.removed_prefix_text_including_linebreak || '';
    if (prefix && answer.startsWith(prefix.trimEnd())) throw new Error(`${item.id} judge input still has the capture header`);
  }
  if (canonicalQuestions(payload.questions) !== canonicalQuestions(questions)) {
    throw new Error(`${item.id} questions do not match the pinned wire; refusing to regenerate`);
  }
  return { bytes, payload };
}

export function verifyPlanFiles(plan, runRoot) {
  assertPlanV2Document(plan);
  return plan.items.map((item) => ({ item, ...verifyFrozenRequest(item, runRoot) }));
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

function recordSpend(path, inputTokens) {
  const budget = readBudget(path);
  const spent = BigInt(budget.spentNewNano || '0') + (BigInt(inputTokens) * 42n);
  const cumulative = DECISION1_PRIOR_NANO + spent;
  const next = {
    ...budget,
    spentNewNano: spent.toString(),
    inputTokens: (budget.inputTokens || 0) + inputTokens,
    tokenBoundChecked: true,
    usageUnknown: false,
  };
  writeBudget(path, next);
  if (spent >= DECISION1_NEW_RESERVE_NANO) return { stopped: 'new-reserve' };
  if (cumulative >= DECISION1_CAP_NANO) return { stopped: 'cumulative-cap' };
  return { stopped: null };
}

function journalEntries(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function latestById(entries) {
  const map = new Map();
  for (const entry of entries) map.set(entry.id, entry);
  return map;
}

/**
 * Verifies a frozen plan. Sends only when execute is true and a transport
 * is supplied. This function's default is not to send.
 */
export async function executeFrozenPlan({ plan, runRoot, execute = false, transport, sleep = liveSleep, spacingMs = SPACING_MS }) {
  const verified = verifyPlanFiles(plan, runRoot);
  const summary = { verified: verified.length, calls: 0, sent: [], skipped: [], stopped: null, liveExecutor: false };
  if (!execute) return summary;
  if (typeof transport !== 'function') throw new Error('refusing to send without an explicit transport');
  const journalPath = join(runRoot, 'attempts.jsonl');
  const prior = journalEntries(journalPath);
  const state = latestById(prior);
  const armedRecords = prior.filter((entry) => entry.phase === 'armed').length;
  for (const entry of state.values()) {
    if (entry.phase === 'armed') {
      summary.stopped = 'ambiguous-attempt';
      return summary;
    }
    if (entry.phase === 'stopped') {
      summary.stopped = 'already-stopped';
      return summary;
    }
  }
  const budgetPath = join(runRoot, 'budget.json');
  mkdirSync(join(runRoot, 'responses'), { recursive: true });
  if (!existsSync(budgetPath)) {
    writeDurable(budgetPath, Buffer.from(`${JSON.stringify({
      priorUsageNano: DECISION1_PRIOR_NANO.toString(),
      newReserveNano: DECISION1_NEW_RESERVE_NANO.toString(),
      spentNewNano: '0',
      inputTokens: 0,
      capNano: DECISION1_CAP_NANO.toString(),
      tokenBoundChecked: false,
      usageUnknown: false,
      calls: 0,
      retries: 0,
    }, null, 2)}\n`), { exclusive: true });
  }
  const existingBudget = existsSync(budgetPath) ? readBudget(budgetPath) : null;
  if (existingBudget?.usageUnknown === true) {
    summary.stopped = 'missing-usage';
    return summary;
  }
  const spentSoFar = BigInt(existingBudget?.spentNewNano || '0');
  if (spentSoFar >= DECISION1_NEW_RESERVE_NANO || DECISION1_PRIOR_NANO + spentSoFar >= DECISION1_CAP_NANO) {
    summary.stopped = spentSoFar >= DECISION1_NEW_RESERVE_NANO ? 'new-reserve' : 'cumulative-cap';
    return summary;
  }
  let sends = 0;
  for (const { item, bytes } of verified) {
    const current = state.get(item.id);
    if (current?.phase === 'responded' || current?.phase === 'stopped') {
      summary.skipped.push(item.id);
      continue;
    }
    if (armedRecords + sends >= DECISION1_MAX_ATTEMPTS) {
      summary.stopped = 'attempt-cap';
      break;
    }
    if (sends > 0) await sleep(spacingMs);
    appendDurable(journalPath, `${JSON.stringify({ id: item.id, phase: 'armed', requestSha256: item.request_sha256 })}\n`);
    let http;
    try {
      http = await transport(bytes);
    } catch (error) {
      appendDurable(journalPath, `${JSON.stringify({ id: item.id, phase: 'stopped', reason: 'transport-error' })}\n`);
      summary.stopped = 'transport-error';
      summary.calls = sends;
      return summary;
    }
    sends += 1;
    summary.calls = sends;
    if (http?.incomplete === true) {
      const body = Buffer.isBuffer(http.body) ? http.body : Buffer.alloc(0);
      const status = Number.isInteger(http.status) ? http.status : null;
      const responsePath = join(runRoot, 'responses', `${item.id}.http`);
      writeDurable(responsePath, Buffer.from(JSON.stringify({ status, bodySha256: sha256(body), incomplete: true })), { exclusive: true });
      writeDurable(`${responsePath}.body`, body, { exclusive: true });
      appendDurable(join(runRoot, 'ledger.jsonl'), `${JSON.stringify({
        id: item.id,
        requestSha256: item.request_sha256,
        httpStatus: status,
        responseSha256: sha256(body),
        incomplete: true,
        usage: { status: 'unknown' },
      })}\n`);
      appendDurable(journalPath, `${JSON.stringify({ id: item.id, phase: 'stopped', reason: 'incomplete-response' })}\n`);
      summary.stopped = 'incomplete-response';
      summary.sent.push(item.id);
      return summary;
    }
    if (!http || !Number.isInteger(http.status) || !Buffer.isBuffer(http.body)) {
      appendDurable(journalPath, `${JSON.stringify({ id: item.id, phase: 'stopped', reason: 'malformed-transport' })}\n`);
      summary.stopped = 'malformed-transport';
      return summary;
    }
    const responsePath = join(runRoot, 'responses', `${item.id}.http`);
    writeDurable(responsePath, Buffer.from(JSON.stringify({ status: http.status, bodySha256: sha256(http.body) })), { exclusive: true });
    writeDurable(`${responsePath}.body`, http.body, { exclusive: true });
    let parsed = null;
    try {
      parsed = JSON.parse(http.body.toString('utf8'));
    } catch {
      parsed = null;
    }
    const usage = providerUsage(parsed?.usage);
    appendDurable(join(runRoot, 'ledger.jsonl'), `${JSON.stringify({
      id: item.id,
      requestSha256: item.request_sha256,
      httpStatus: http.status,
      responseSha256: sha256(http.body),
      usage: usage ? { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens } : { status: 'unknown' },
    })}\n`);
    if (http.status !== 200) {
      appendDurable(journalPath, `${JSON.stringify({ id: item.id, phase: 'stopped', reason: `http-${http.status}-no-retry` })}\n`);
      summary.stopped = `http-${http.status}`;
      summary.sent.push(item.id);
      return summary;
    }
    if (!usage) {
      const budget = readBudget(budgetPath);
      writeBudget(budgetPath, { ...budget, usageUnknown: true });
      appendDurable(journalPath, `${JSON.stringify({ id: item.id, phase: 'stopped', reason: 'missing-usage' })}\n`);
      summary.stopped = 'missing-usage';
      summary.sent.push(item.id);
      return summary;
    }
    const spent = recordSpend(budgetPath, usage.input_tokens);
    appendDurable(journalPath, `${JSON.stringify({ id: item.id, phase: 'responded', requestSha256: item.request_sha256 })}\n`);
    if (spent.stopped) {
      summary.stopped = spent.stopped;
      summary.sent.push(item.id);
      return summary;
    }
    summary.sent.push(item.id);
    state.set(item.id, { id: item.id, phase: 'responded' });
  }
  return summary;
}

const BUNDLE_FILES = [
  'lib/decision1-send.mjs',
  'lib/decision1-strict.mjs',
  'lib/load.mjs',
  'lib/schema.mjs',
  'lib/strict-visibility.mjs',
  'lib/frozen-path.mjs',
  'questions/questions.strict-visibility-decision1.v1.json',
  'plans/input-plan.v2.json',
];

/** Copies the sender and its local imports. Generated output is not committed. */
export function exportDecision1Sender(outDir) {
  for (const file of BUNDLE_FILES) {
    mkdirSync(join(outDir, dirname(file)), { recursive: true });
    cpSync(join(EVAL_DIR, file), join(outDir, file));
  }
  writeFileSync(join(outDir, 'send.mjs'), `#!/usr/bin/env node
import { main } from './lib/decision1-send.mjs';

main(process.argv.slice(2)).then((code) => process.exit(code ?? 0), (error) => {
  console.error(error.message);
  process.exit(1);
});
`);
  writeFileSync(join(outDir, 'README.md'), `# Decision-1 sender bundle

\`node send.mjs --plan plans/input-plan.v2.json\` verifies only.
\`--execute\` sleeps 5 seconds between requests and posts with node HTTPS. The token audience is https://cognitiveservices.azure.com. Do not pass it until review.
The token stays in memory. This folder must not contain tokens or account keys.
`);
  return outDir;
}

export function assertSystemoneEndpoint(url) {
  if (url !== DECISION1_ENDPOINT) throw new Error('endpoint is not the pinned systemone URL');
  return { host: 'kalebcole2021-0169-resource.cognitiveservices.azure.com', path: SYSTEMONE_PATH };
}

function redact(text, token) {
  if (!token) return String(text);
  return String(text).split(token).join('[redacted]');
}

/** Args for az account get-access-token. The token is not an argument. */
export function azTokenArgs(azBin = DEFAULT_AZ_BIN, resource) {
  if (resource !== DECISION1_RESOURCE) throw new Error('resource is not https://cognitiveservices.azure.com');
  return [azBin, 'account', 'get-access-token', '--resource', resource, '--query', 'accessToken', '-o', 'tsv'];
}

export function readAzAccessToken({ azBin, resource, spawnImpl = nodeSpawn }) {
  const args = azTokenArgs(azBin, resource).slice(1);
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl(azBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      reject(new Error('az failed to start'));
      return;
    }
    let out = '';
    child.stdout?.on('data', (chunk) => { out += chunk; });
    child.stderr?.on('data', () => {});
    child.on('error', () => reject(new Error('az failed to start')));
    child.on('close', (code) => {
      const token = out.trim();
      if (code !== 0 || token.length === 0) reject(new Error('az get-access-token failed'));
      else resolve(token);
    });
  });
}

/** POST exact bytes. Node does not follow redirects. Timeout destroys the socket. */
export function postHttps({ endpoint, body, token, timeoutMs = 60000, requestImpl = httpsRequest }) {
  const url = new URL(endpoint);
  assertSystemoneEndpoint(endpoint);
  return new Promise((resolve, reject) => {
    let settled = false;
    let started = false;
    let status = null;
    const chunks = [];
    const finish = (incomplete) => {
      if (settled) return;
      settled = true;
      resolve({ status, body: Buffer.concat(chunks), incomplete });
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

function option(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  return argv[index + 1];
}

/**
 * Opt-in sender. Without --execute it only verifies. With --execute it
 * acquires a token and then calls executeFrozenPlan. Tests inject spawn
 * and HTTPS. This process must not be pointed at a live endpoint.
 */
export async function main(argv, hooks = {}) {
  if (!option(argv, '--plan') || !option(argv, '--run-root') || !option(argv, '--plan-sha')) {
    throw new Error('missing --plan, --run-root, or --plan-sha');
  }
  const planPath = option(argv, '--plan');
  const runRoot = option(argv, '--run-root');
  const planSha = option(argv, '--plan-sha');
  const planBytes = readFileSync(planPath);
  if (sha256(planBytes) !== planSha) throw new Error('plan file does not match --plan-sha');
  if (planSha !== PLAN_V2_SHA256) throw new Error('plan pin is not the reviewed v2 plan');
  const plan = JSON.parse(planBytes.toString('utf8'));
  const ids = plan.items?.map((item) => item.id) ?? [];
  if (ids.length !== 8 || new Set(ids).size !== 8) throw new Error('plan must contain exactly 8 unique items');
  verifyPlanFiles(plan, runRoot);
  if (!argv.includes('--execute')) {
    console.log(`verified ${plan.items.length}; calls 0`);
    return 0;
  }
  const azBin = option(argv, '--az');
  const endpoint = option(argv, '--endpoint');
  const resource = option(argv, '--resource');
  if (!azBin || !existsSync(azBin)) throw new Error('az binary is missing');
  if (!endpoint || !resource) throw new Error('missing --endpoint or --resource');
  assertSystemoneEndpoint(endpoint);
  if (resource !== DECISION1_RESOURCE) throw new Error('resource is not https://cognitiveservices.azure.com');
  const token = await readAzAccessToken({ azBin, resource, spawnImpl: hooks.spawnImpl });
  const transport = (body) => postHttps({
    endpoint,
    body,
    token,
    timeoutMs: 60000,
    requestImpl: hooks.requestImpl,
  });
  const summary = await executeFrozenPlan({
    plan,
    runRoot,
    execute: true,
    transport,
    sleep: hooks.sleep ?? liveSleep,
    spacingMs: SPACING_MS,
  });
  console.log(JSON.stringify({ verified: summary.verified, calls: summary.calls, sent: summary.sent, skipped: summary.skipped, stopped: summary.stopped }));
  return summary.stopped ? 1 : 0;
}
