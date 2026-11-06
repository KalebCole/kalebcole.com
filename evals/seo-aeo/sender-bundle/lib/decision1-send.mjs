// Sends a frozen plan v2 only from exact request files. It does not rebuild
// answer text or questions, does not read label files, and does not retry.
import { createHash } from 'node:crypto';
import { closeSync, cpSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
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
export const PLAN_V2_REQUEST_BYTES = 57763;
export const DEFAULT_AZ_BIN = '/home/box/.local/share/azure-cli-venv/bin/az';
export const SYSTEMONE_PATH = '/providers/microsoft/v1/systemone';
const SPACING_MS = 5000;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function writeDurable(path, bytes) {
  const fd = openSync(path, 'w');
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
    if (item.request_path.includes('..') || item.request_path.startsWith('/')) throw new Error(`${item.id} request path must stay under the run root`);
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
export async function executeFrozenPlan({ plan, runRoot, execute = false, transport, sleep = () => Promise.resolve(), spacingMs = SPACING_MS }) {
  const verified = verifyPlanFiles(plan, runRoot);
  const summary = { verified: verified.length, calls: 0, sent: [], skipped: [], stopped: null, liveExecutor: false };
  if (!execute) return summary;
  if (typeof transport !== 'function') throw new Error('refusing to send without an explicit transport');
  const journalPath = join(runRoot, 'attempts.jsonl');
  const prior = journalEntries(journalPath);
  if (prior.length > DECISION1_MAX_ATTEMPTS) throw new Error('attempt journal already exceeds 8');
  const state = latestById(prior);
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
  const armed = prior.filter((entry) => entry.phase === 'armed').length;
  const budgetPath = join(runRoot, 'budget.json');
  mkdirSync(join(runRoot, 'responses'), { recursive: true });
  if (!existsSync(budgetPath)) {
    writeDurable(budgetPath, Buffer.from(`${JSON.stringify({
      priorUsageNano: DECISION1_PRIOR_NANO.toString(),
      newReserveNano: DECISION1_NEW_RESERVE_NANO.toString(),
      capNano: DECISION1_CAP_NANO.toString(),
      tokenBoundChecked: false,
      calls: 0,
      retries: 0,
    }, null, 2)}\n`));
  }
  let sends = 0;
  for (const { item, bytes } of verified) {
    const current = state.get(item.id);
    if (current?.phase === 'responded' || current?.phase === 'stopped') {
      summary.skipped.push(item.id);
      continue;
    }
    if (armed + sends >= DECISION1_MAX_ATTEMPTS) {
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
    if (!http || !Number.isInteger(http.status) || !Buffer.isBuffer(http.body)) {
      appendDurable(journalPath, `${JSON.stringify({ id: item.id, phase: 'stopped', reason: 'malformed-transport' })}\n`);
      summary.stopped = 'malformed-transport';
      return summary;
    }
    const responsePath = join(runRoot, 'responses', `${item.id}.http`);
    writeDurable(responsePath, Buffer.from(JSON.stringify({ status: http.status, bodySha256: sha256(http.body) })));
    writeDurable(`${responsePath}.body`, http.body);
    let parsed = null;
    try {
      parsed = JSON.parse(http.body.toString('utf8'));
    } catch {
      parsed = null;
    }
    const usage = parsed?.usage;
    const usageKnown = usage && Number.isInteger(usage.input_tokens) && Number.isInteger(usage.output_tokens);
    appendDurable(join(runRoot, 'ledger.jsonl'), `${JSON.stringify({
      id: item.id,
      requestSha256: item.request_sha256,
      httpStatus: http.status,
      responseSha256: sha256(http.body),
      usage: usageKnown ? { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens } : { status: 'unknown' },
    })}\n`);
    if (http.status === 401 || http.status === 429) {
      appendDurable(journalPath, `${JSON.stringify({ id: item.id, phase: 'stopped', reason: `http-${http.status}-no-retry` })}\n`);
      summary.stopped = `http-${http.status}`;
      summary.sent.push(item.id);
      return summary;
    }
    if (!usageKnown) {
      appendDurable(journalPath, `${JSON.stringify({ id: item.id, phase: 'stopped', reason: 'missing-usage' })}\n`);
      summary.stopped = 'missing-usage';
      summary.sent.push(item.id);
      return summary;
    }
    appendDurable(journalPath, `${JSON.stringify({ id: item.id, phase: 'responded', requestSha256: item.request_sha256 })}\n`);
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

/** Copies the sender and its local imports. The bundle refuses --execute. */
export function exportDecision1Sender(outDir) {
  for (const file of BUNDLE_FILES) {
    mkdirSync(join(outDir, dirname(file)), { recursive: true });
    cpSync(join(EVAL_DIR, file), join(outDir, file));
  }
  writeFileSync(join(outDir, 'send.mjs'), `#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertPlanV2Document, verifyPlanFiles } from './lib/decision1-send.mjs';

if (process.argv.includes('--execute')) {
  console.error('sending is disabled in this bundle until a separate review. No request was sent.');
  process.exit(2);
}
const [planPath, runRoot] = process.argv.slice(2);
if (!planPath) {
  console.error('usage: node send.mjs <plan.json> [run-root]');
  process.exit(2);
}
const plan = JSON.parse(readFileSync(resolve(planPath), 'utf8'));
const checked = assertPlanV2Document(plan);
if (runRoot) {
  const files = verifyPlanFiles(plan, resolve(runRoot));
  console.log(\`verified \${files.length}; envelope tokens \${checked.envelope.tokens}; calls 0\`);
} else {
  console.log(\`plan ok; \${plan.items.length} items; \${checked.totalRequestBytes} bytes; calls 0\`);
}
`);
  writeFileSync(join(outDir, 'README.md'), `# Decision-1 sender bundle

Offline verifier for plan v2. \`node send.mjs --execute\` does not send.
Copy this folder to the runbox. Point it at a run root that already contains \`requests.v2/\`.
Do not put tokens or account keys in this folder.
`);
  return outDir;
}

export function assertSystemoneEndpoint(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('endpoint must be https');
  if (parsed.username || parsed.password || parsed.searchParams.has('api-key')) throw new Error('endpoint must not carry credentials');
  const hostOk = ['.openai.azure.com', '.cognitiveservices.azure.com', '.services.ai.azure.com'].some((suffix) => parsed.hostname.endsWith(suffix));
  if (!hostOk) throw new Error('endpoint host is not an allowed Azure host');
  if (!parsed.pathname.endsWith(SYSTEMONE_PATH)) throw new Error('endpoint path is not /providers/microsoft/v1/systemone');
  return { host: parsed.hostname, path: parsed.pathname };
}

/** Azure CLI args. The token stays inside az. This function does not run az. */
export function azRestArgs({ azBin = DEFAULT_AZ_BIN, endpoint, bodyPath, resource }) {
  assertSystemoneEndpoint(endpoint);
  if (!resource || resource.includes('Bearer') || resource.includes('access_token')) throw new Error('resource must not contain a token');
  return [azBin, 'rest', '--method', 'POST', '--uri', endpoint, '--resource', resource, '--body', `@${bodyPath}`, '--headers', 'Content-Type=application/json'];
}
