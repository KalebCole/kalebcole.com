// Decision-1 transport contract for strict-visibility-win-v1. Builds the
// choice-question payload, decodes answers.*.probabilities, and records
// bytes. It does not send HTTP, retry, refresh a 401, or read label files.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVAL_DIR, readJson } from './load.mjs';
import { APPROVED_QUERY_IDS, BASELINE_QUESTION_IDS, TOOLS_FOR_SURFACE } from './strict-visibility.mjs';

export const DECISION1_QUESTIONS_FILE = 'questions/questions.strict-visibility-decision1.v1.json';
export const DECISION1_QUESTIONS_SHA256 = '3a3dd9ac3ae6feb15db9086bbb5bed4eea85bbc8200f7d9357559c7c5f297b0b';
export const DECISION1_DEPLOYMENT = 'decision-1-eval';
export const DECISION1_JUDGE_VERSION = 'strict-visibility-decision1-v1';
export const DECISION1_MAX_ATTEMPTS = 8;
export const DECISION1_CAP_NANO = 50_000_000n;
export const DECISION1_PRIOR_NANO = 9_095_688n;
export const DECISION1_NEW_RESERVE_NANO = 2_000_000n;

const QUESTIONS_PATH = join(EVAL_DIR, DECISION1_QUESTIONS_FILE);
const REQUIRED_FIELDS = [
  'coverage',
  'targetPrimary',
  'criminalNamesakeMention',
  'identityClass',
  'harmfulAttribution',
  'citationSupport',
  'positionDiagnostic',
  'abstained',
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function nanoToString(nano) {
  const whole = nano / 1_000_000_000n;
  const frac = (nano % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
  return frac.length === 0 ? whole.toString() : `${whole}.${frac}`;
}

export function loadDecision1Questions(path = QUESTIONS_PATH) {
  const bytes = readFileSync(path);
  const digest = sha256(bytes);
  if (digest !== DECISION1_QUESTIONS_SHA256) {
    throw new Error(`decision-1 questions sha256 ${digest} does not match ${DECISION1_QUESTIONS_SHA256}`);
  }
  const document = JSON.parse(bytes.toString('utf8'));
  if (document.judgeDeployment !== DECISION1_DEPLOYMENT || document.judgeVersion !== DECISION1_JUDGE_VERSION) {
    throw new Error('decision-1 questions deployment or version does not match the pin');
  }
  for (const id of BASELINE_QUESTION_IDS) {
    if (id in document.questions) throw new Error(`decision-1 questions must not include baseline question ${id}`);
  }
  if ('factAccuracy' in document.questions) throw new Error('factAccuracy is not a decision-1 question while facts are unapproved');
  for (const [name, question] of Object.entries(document.questions)) {
    if (question.type !== 'choice') throw new Error(`${name} must be a choice question`);
    if (!question.criteria || Object.keys(question.criteria).length === 0) throw new Error(`${name} needs criteria`);
  }
  for (const name of REQUIRED_FIELDS) {
    if (!(name in document.questions)) throw new Error(`decision-1 questions missing ${name}`);
  }
  return { document, sha256: digest, bytes };
}

function questionsWire(bundle = loadDecision1Questions()) {
  return bundle.document.questions;
}

/** Wire payload. state is answer_text only. Capture metadata stays outside. */
export function buildDecision1Request({ answerText }, bundle = loadDecision1Questions()) {
  if (typeof answerText !== 'string') throw new Error('answer_text must be a string');
  const payload = {
    model: DECISION1_DEPLOYMENT,
    state: { answer_text: answerText },
    questions: questionsWire(bundle),
  };
  const bytes = Buffer.from(JSON.stringify(payload));
  return {
    payload,
    bytes,
    sha256: sha256(bytes),
    answerBodySha256: sha256(Buffer.from(answerText)),
    judgeDeployment: DECISION1_DEPLOYMENT,
    judgeVersion: DECISION1_JUDGE_VERSION,
  };
}

export function syntheticDecision1Example() {
  const answerText = 'Synthetic placeholder. Not a captured consumer answer.';
  const built = buildDecision1Request({ answerText });
  return {
    called: false,
    liveExecutor: false,
    questionsSha256: DECISION1_QUESTIONS_SHA256,
    answerBodySha256: built.answerBodySha256,
    requestSha256: built.sha256,
    capture: {
      captureEngine: 'chatgpt',
      captureModel: 'synthetic-capture-model',
      surface: 'public-signed-out',
      queryId: 'name',
      repeat: 1,
    },
    request: built.payload,
  };
}

function assertCapture(item) {
  if (!item || typeof item !== 'object') throw new Error('capture must be an object');
  if (typeof item.answerText !== 'string') throw new Error('capture answerText must be a string');
  if (!APPROVED_QUERY_IDS.includes(item.queryId)) throw new Error(`query ${item.queryId} is not one of the four name queries`);
  const allowed = TOOLS_FOR_SURFACE[item.surface];
  if (!allowed) throw new Error(`surface ${item.surface} is not a known collection bucket`);
  if (typeof item.captureEngine !== 'string' || !allowed.includes(item.captureEngine)) {
    throw new Error(`captureEngine ${item.captureEngine} does not belong on surface ${item.surface}`);
  }
  if (typeof item.captureModel !== 'string' || item.captureModel.length === 0 || item.captureModel === 'model-not-recorded') {
    throw new Error('captureModel is required and is not defaulted');
  }
  if (!Number.isInteger(item.repeat) || item.repeat < 1) throw new Error('repeat must be a whole number from 1');
  for (const key of ['expected', 'gold', 'label', 'labels', 'provisional', 'query']) {
    if (key in item && key !== 'queryId') throw new Error(`capture must not carry ${key}`);
  }
}

function reserveLedger(attempts, alreadyReservedNano) {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > DECISION1_MAX_ATTEMPTS) {
    throw new Error(`attempts must be a whole number from 1 to ${DECISION1_MAX_ATTEMPTS}`);
  }
  const committed = DECISION1_PRIOR_NANO + alreadyReservedNano + DECISION1_NEW_RESERVE_NANO;
  if (committed > DECISION1_CAP_NANO) throw new Error('reserve would exceed the cap; refusing to reset or proceed');
  return {
    attempts,
    maxAttempts: DECISION1_MAX_ATTEMPTS,
    priorUsageUsd: nanoToString(DECISION1_PRIOR_NANO),
    priorUsageNano: DECISION1_PRIOR_NANO.toString(),
    desiredNewReserveUsd: nanoToString(DECISION1_NEW_RESERVE_NANO),
    desiredNewReserveNano: DECISION1_NEW_RESERVE_NANO.toString(),
    alreadyReservedNano: alreadyReservedNano.toString(),
    committedNano: committed.toString(),
    capUsd: nanoToString(DECISION1_CAP_NANO),
    tokenBoundChecked: false,
    calls: 0,
    retries: 0,
    network: 'refused',
    note: 'Reserve recorded before any call. The desired new reserve is not a proven bound until serialized tokens are checked. This module does not send HTTP.',
  };
}

function idempotenceMaterial(item) {
  return JSON.stringify({
    answerBodySha256: item.answerBodySha256,
    requestSha256: item.requestSha256,
    captureEngine: item.captureEngine,
    captureModel: item.captureModel,
    judgeDeployment: DECISION1_DEPLOYMENT,
    judgeVersion: DECISION1_JUDGE_VERSION,
    surface: item.surface,
    queryId: item.queryId,
    repeat: item.repeat,
  });
}

/**
 * Writes the reserve and the exact request bytes before any response exists.
 * Does not call a model. Refuses a ninth attempt and a reserve reset.
 */
export function prepareDecision1({ dir, items }) {
  if (!dir) throw new Error('preparation needs a directory');
  if (!Array.isArray(items) || items.length === 0) throw new Error('preparation needs at least one capture');
  const bundle = loadDecision1Questions();
  const planned = items.map((item) => {
    assertCapture(item);
    const built = buildDecision1Request({ answerText: item.answerText }, bundle);
    if ('query' in built.payload.state || Object.keys(built.payload.state).length !== 1) {
      throw new Error('state must be answer_text only');
    }
    const plannedItem = {
      id: typeof item.id === 'string' ? item.id : null,
      surface: item.surface,
      queryId: item.queryId,
      repeat: item.repeat,
      captureEngine: item.captureEngine,
      captureModel: item.captureModel,
      judgeDeployment: DECISION1_DEPLOYMENT,
      judgeVersion: DECISION1_JUDGE_VERSION,
      answerBodySha256: built.answerBodySha256,
      requestSha256: built.sha256,
    };
    return { ...plannedItem, idempotenceKey: sha256(idempotenceMaterial(plannedItem)), requestBytes: built.bytes };
  });
  const keys = planned.map((item) => item.idempotenceKey);
  if (new Set(keys).size !== keys.length) throw new Error('planned captures collide on an idempotence key');
  const reservePath = join(dir, 'reserve.json');
  const manifestPath = join(dir, 'manifest.json');
  if (existsSync(dir) && !existsSync(reservePath) && readdirSync(dir).length > 0) {
    throw new Error('directory exists without a decision-1 reserve; refusing to mix files');
  }
  if (existsSync(reservePath)) {
    const existingReserve = readJson(reservePath);
    const existingManifest = readJson(manifestPath);
    if (existingReserve.priorUsageNano !== DECISION1_PRIOR_NANO.toString()) {
      throw new Error('stored prior usage does not match the pinned prior; refusing to reset it');
    }
    if (existingReserve.committedNano !== reserveLedger(existingManifest.items.length, 0n).committedNano) {
      throw new Error('stored reserve does not match the pinned new reserve; refusing to reset it');
    }
    const comparable = existingManifest.items.map(({ requestBytes: _ignored, ...item }) => item);
    const next = planned.map(({ requestBytes: _ignored, ...item }) => item);
    if (JSON.stringify(comparable) !== JSON.stringify(next)) throw new Error('directory was prepared with a different capture list');
    return { status: 'already-prepared', dir, manifest: existingManifest, reserve: existingReserve };
  }
  const reserve = reserveLedger(planned.length, 0n);
  const manifest = {
    kind: 'decision1-strict-preparation',
    liveExecutor: false,
    questionsSha256: bundle.sha256,
    judgeDeployment: DECISION1_DEPLOYMENT,
    judgeVersion: DECISION1_JUDGE_VERSION,
    calls: 0,
    retries: 0,
    network: 'refused',
    judgeAccuracy: 'not-measured',
    freshProspectiveHoldout: false,
    items: planned.map(({ requestBytes: _ignored, ...item }) => item),
  };
  mkdirSync(join(dir, 'requests'), { recursive: true });
  writeFileSync(reservePath, `${JSON.stringify(reserve, null, 2)}\n`);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const item of planned) writeFileSync(join(dir, 'requests', `${item.idempotenceKey}.json`), item.requestBytes);
  return { status: 'prepared', dir, manifest, reserve };
}

function choiceOf(rawField, criteria) {
  if (!rawField || typeof rawField !== 'object') return { error: 'answer is missing' };
  if (rawField.type !== 'choice') return { error: 'answer type is not choice' };
  if ('probs' in rawField && !('probabilities' in rawField)) return { error: 'answer has probs and not probabilities' };
  if (!rawField.probabilities || typeof rawField.probabilities !== 'object' || Array.isArray(rawField.probabilities)) {
    return { error: 'answer probabilities are missing' };
  }
  if (typeof rawField.choice !== 'string' || !(rawField.choice in criteria)) return { error: 'answer choice is missing or not in criteria' };
  if (!(rawField.choice in rawField.probabilities)) return { error: 'probabilities omit the chosen label' };
  return { choice: rawField.choice };
}

function providerUsage(body) {
  const usage = body && typeof body === 'object' ? body.usage : undefined;
  const read = (key) => {
    if (!usage || typeof usage !== 'object' || !Object.hasOwn(usage, key)) return { status: 'unknown', value: null };
    if (!Number.isInteger(usage[key]) || usage[key] < 0) return { status: 'invalid', value: null };
    return { status: 'returned', value: usage[key] };
  };
  return { input_tokens: read('input_tokens'), output_tokens: read('output_tokens') };
}

/** Maps a Decision-1 JSON body to an extraction. Does not default a missing choice to false. */
export function decodeDecision1Response(body) {
  const problems = [];
  if (!body || typeof body !== 'object' || !body.answers || typeof body.answers !== 'object') {
    return { status: 'error', problems: ['response answers object is missing'], extraction: null, usage: providerUsage(body) };
  }
  const bundle = loadDecision1Questions();
  const fields = {};
  for (const name of REQUIRED_FIELDS) {
    const parsed = choiceOf(body.answers[name], bundle.document.questions[name].criteria);
    if (parsed.error) problems.push(`${name}: ${parsed.error}`);
    else fields[name] = parsed.choice;
  }
  const usage = providerUsage(body);
  if (usage.input_tokens.status !== 'returned' || usage.output_tokens.status !== 'returned') {
    problems.push('provider usage is missing or invalid; not recorded as zero');
  }
  if (problems.length > 0) return { status: 'error', problems, extraction: null, usage };
  const abstained = fields.abstained === 'true' ? true : fields.abstained === 'false' ? false : null;
  if (abstained === null) {
    return {
      status: 'error',
      problems: ['abstained choice unknown is not false and is not scored'],
      extraction: null,
      usage,
    };
  }
  return {
    status: 'ok',
    problems: [],
    usage,
    factAccuracySource: 'no-approved-fact-evidence',
    citationSupportMeans: 'text-label-not-verified-url',
    extraction: {
      rubricVersion: 'strict-visibility-win-v1',
      coverage: fields.coverage,
      targetPrimary: fields.targetPrimary,
      criminalNamesakeMention: fields.criminalNamesakeMention,
      identityClass: fields.identityClass,
      harmfulAttribution: fields.harmfulAttribution,
      factAccuracy: 'unknown',
      citationSupport: fields.citationSupport,
      positionDiagnostic: fields.positionDiagnostic,
      abstained,
    },
  };
}

function readPrepared(dir) {
  const reservePath = join(dir, 'reserve.json');
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(reservePath) || !existsSync(manifestPath)) throw new Error('decision-1 reserve was not recorded before the response');
  return { reserve: readJson(reservePath), manifest: readJson(manifestPath) };
}

/**
 * Stores the exact request bytes, the full HTTP response bytes and status,
 * and usage taken only from that response. Does not send, retry, or refresh.
 */
export function recordDecision1Http({ dir, idempotenceKey: key, http }) {
  if (!http || !Number.isInteger(http.status)) throw new Error('HTTP status is required');
  if (!Buffer.isBuffer(http.body)) throw new Error('HTTP body bytes are required');
  const { reserve, manifest } = readPrepared(dir);
  if (reserve.retries !== 0 || reserve.network !== 'refused') throw new Error('reserve is not a no-retry ledger');
  const item = manifest.items.find((entry) => entry.idempotenceKey === key);
  if (!item) throw new Error('idempotence key is not in the preparation');
  const requestPath = join(dir, 'requests', `${key}.json`);
  if (!existsSync(requestPath)) throw new Error('request bytes were not stored before the response');
  const requestBytes = readFileSync(requestPath);
  if (sha256(requestBytes) !== item.requestSha256) throw new Error('stored request bytes do not match the plan');
  const folder = join(dir, 'responses', key);
  const bodyPath = join(folder, 'body');
  const metaPath = join(folder, 'meta.json');
  let parsed = null;
  try {
    parsed = JSON.parse(http.body.toString('utf8'));
  } catch {
    parsed = null;
  }
  const decoded = parsed ? decodeDecision1Response(parsed) : { status: 'error', problems: ['response body is not JSON'], extraction: null, usage: { input_tokens: { status: 'unknown', value: null }, output_tokens: { status: 'unknown', value: null } } };
  const meta = {
    idempotenceKey: key,
    httpStatus: http.status,
    responseSha256: sha256(http.body),
    requestSha256: item.requestSha256,
    answerBodySha256: item.answerBodySha256,
    captureEngine: item.captureEngine,
    captureModel: item.captureModel,
    judgeDeployment: item.judgeDeployment,
    judgeVersion: item.judgeVersion,
    usage: decoded.usage,
    decodeStatus: decoded.status,
    problems: decoded.problems,
    retry: false,
  };
  if (existsSync(folder)) {
    if (!existsSync(bodyPath) || !existsSync(metaPath)) throw new Error('partial HTTP response; refusing to repair or replace it');
    const stored = readFileSync(bodyPath);
    const previous = JSON.parse(readFileSync(metaPath, 'utf8'));
    if (!stored.equals(http.body) || previous.httpStatus !== http.status) {
      throw new Error('idempotence key already has a different HTTP response; not retrying');
    }
    return { status: 'already-stored', decodeStatus: previous.decodeStatus, extraction: null };
  }
  mkdirSync(folder, { recursive: true });
  writeFileSync(bodyPath, http.body);
  writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
  if (reserve.calls !== 0) throw new Error('reserve calls changed while recording; refusing to continue');
  return { status: 'stored', decodeStatus: decoded.status, extraction: decoded.status === 'ok' ? decoded.extraction : null, usage: decoded.usage };
}
