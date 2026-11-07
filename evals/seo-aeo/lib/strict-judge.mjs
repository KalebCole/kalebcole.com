// Offline preparation for a future strict-visibility judge. This module
// never calls a model. It freezes the extraction request, plans items by
// surface, tool, and model, and stores raw responses only when the bytes,
// hash, and usage agree. A second write with different bytes fails closed.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVAL_DIR, readJson } from './load.mjs';
import { APPROVED_QUERY_IDS, BASELINE_QUESTION_IDS, STRICT_VISIBILITY_VERSION, TOOLS_FOR_SURFACE } from './strict-visibility.mjs';

export const STRICT_JUDGE_REQUEST_FILE = 'questions/questions.strict-visibility-win-v1.candidate.json';
export const STRICT_JUDGE_REQUEST_VERSION = 'strict-visibility-extraction-v1';
export const STRICT_JUDGE_REQUEST_SHA256 = 'a7267f8b452c0c57b17ad39c34701ecbdf871357c8c94a873ef44bf7e4f1639e';

const REQUEST_PATH = join(EVAL_DIR, STRICT_JUDGE_REQUEST_FILE);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalItem(item) {
  return JSON.stringify({
    requestSha256: item.requestSha256,
    surface: item.surface,
    tool: item.tool,
    model: item.model,
    queryId: item.queryId,
    repeat: item.repeat,
  });
}

export function idempotenceKey(item) {
  return sha256(canonicalItem(item));
}

/** Reads the candidate extraction request and refuses a byte that does not match the pinned hash. */
export function loadStrictJudgeRequest(path = REQUEST_PATH) {
  const bytes = readFileSync(path);
  const digest = sha256(bytes);
  if (digest !== STRICT_JUDGE_REQUEST_SHA256) {
    throw new Error(`strict judge request sha256 ${digest} does not match ${STRICT_JUDGE_REQUEST_SHA256}`);
  }
  const request = JSON.parse(bytes.toString('utf8'));
  if (request.version !== STRICT_JUDGE_REQUEST_VERSION) {
    throw new Error(`strict judge request version ${request.version} is not ${STRICT_JUDGE_REQUEST_VERSION}`);
  }
  if (request.rubricVersion !== STRICT_VISIBILITY_VERSION) {
    throw new Error(`strict judge request rubric ${request.rubricVersion} is not ${STRICT_VISIBILITY_VERSION}`);
  }
  if (request.isolation?.must_not_merge_into_baseline_payload !== true) {
    throw new Error('strict judge request must stay out of the baseline payload');
  }
  if (request.notAScorer !== true || request.status !== 'candidate-not-validated') {
    throw new Error('strict judge request is an unvalidated extraction candidate');
  }
  return { request, sha256: digest, bytes };
}

/**
 * Builds two payloads. The baseline stays the original eight questions.
 * The strict request is not visibility-only-v1 and is not sent by this module.
 */
export function isolatedStrictJudgePayload(baseline, strictRequest) {
  if (!baseline?.questions || !strictRequest) throw new Error('isolation needs a baseline and a strict request');
  if (baseline === strictRequest || baseline.questions === strictRequest) {
    throw new Error('strict judge request cannot share the baseline payload');
  }
  if ('visibility_of_target' in baseline.questions) {
    throw new Error('visibility_of_target is not part of the identity baseline request');
  }
  const baselineIds = Object.keys(baseline.questions);
  const sameIds = baselineIds.length === BASELINE_QUESTION_IDS.length
    && baselineIds.every((id, index) => id === BASELINE_QUESTION_IDS[index]);
  if (!sameIds) throw new Error('identity baseline question ids changed');
  if (strictRequest.version === 'visibility-only-v1' || strictRequest.questions?.visibility_of_target) {
    throw new Error('visibility-only-v1 is not the strict extraction request');
  }
  for (const id of BASELINE_QUESTION_IDS) {
    if (id in strictRequest) throw new Error(`strict judge request must not carry baseline question ${id}`);
  }
  return {
    baselineRequest: {
      role: 'identity-baseline',
      version: baseline.version,
      questions: structuredClone(baseline.questions),
    },
    strictRequest: structuredClone(strictRequest),
    called: false,
  };
}

function planItem(item, requestSha256) {
  if (!item || typeof item !== 'object') throw new Error('plan item must be an object');
  if (!APPROVED_QUERY_IDS.includes(item.queryId)) throw new Error(`query ${item.queryId} is not one of the four name queries`);
  const allowed = TOOLS_FOR_SURFACE[item.surface];
  if (!allowed) throw new Error(`surface ${item.surface} is not a known collection bucket`);
  if (!allowed.includes(item.tool)) throw new Error(`tool ${item.tool} does not belong on surface ${item.surface}`);
  if (!Number.isInteger(item.repeat) || item.repeat < 1) throw new Error('repeat must be a whole number from 1');
  const model = typeof item.model === 'string' && item.model.length > 0 ? item.model : 'model-not-recorded';
  const planned = {
    id: typeof item.id === 'string' ? item.id : null,
    surface: item.surface,
    tool: item.tool,
    model,
    queryId: item.queryId,
    repeat: item.repeat,
    requestSha256,
  };
  return { ...planned, idempotenceKey: idempotenceKey(planned) };
}

function readManifest(dir) {
  const path = join(dir, 'manifest.json');
  if (!existsSync(path)) throw new Error(`no strict judge preparation at ${dir}`);
  return { path, manifest: readJson(path) };
}

/**
 * Writes the plan before any call. Refuses a directory prepared for a
 * different request or a different item list. Does not create raw responses.
 */
export function prepareStrictValidation({ dir, items, requestBundle = loadStrictJudgeRequest() }) {
  if (!dir) throw new Error('preparation needs a directory');
  if (!Array.isArray(items) || items.length === 0) throw new Error('preparation needs at least one planned item');
  const planned = items.map((item) => planItem(item, requestBundle.sha256));
  const keys = planned.map((item) => item.idempotenceKey);
  if (new Set(keys).size !== keys.length) throw new Error('planned items collide on an idempotence key');
  const manifest = {
    kind: 'strict-judge-preparation',
    requestVersion: requestBundle.request.version,
    requestSha256: requestBundle.sha256,
    rubricVersion: STRICT_VISIBILITY_VERSION,
    calls: 0,
    network: 'refused',
    judgeAccuracy: 'not-measured',
    freshProspectiveHoldout: false,
    note: 'Preparation only. No model was called. Later labels, if an operator supplies them, refer to original signed-out captures already collected. Those captures are not a fresh prospective holdout. Repeats are correlated.',
    items: planned,
  };
  const manifestPath = join(dir, 'manifest.json');
  if (existsSync(dir) && readdirSync(dir).length > 0) {
    if (!existsSync(manifestPath)) throw new Error('directory exists without a strict judge manifest; refusing to mix files');
    const existing = readJson(manifestPath);
    if (existing.requestSha256 !== manifest.requestSha256) {
      throw new Error('directory was prepared for a different strict judge request');
    }
    if (JSON.stringify(existing.items) !== JSON.stringify(manifest.items)) {
      throw new Error('directory was prepared with a different item list');
    }
    return { status: 'already-prepared', dir, manifest: existing };
  }
  mkdirSync(join(dir, 'raw'), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { status: 'prepared', dir, manifest };
}

function usageOf(usage) {
  if (!usage || typeof usage !== 'object') throw new Error('raw response usage is required');
  for (const key of ['inputTokens', 'outputTokens']) {
    if (!Object.hasOwn(usage, key) || !Number.isInteger(usage[key]) || usage[key] < 0) {
      throw new Error(`usage.${key} must be a non-negative integer`);
    }
  }
  return { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
}

/**
 * Stores one raw response for a prepared idempotence key. Missing usage,
 * an unknown key, or bytes that disagree with a previous store write nothing
 * new and throw.
 */
export function persistRawResponse({ dir, idempotenceKey: key, body, usage }) {
  if (typeof key !== 'string' || key.length === 0) throw new Error('idempotence key is required');
  const { manifest } = readManifest(dir);
  if (manifest.network !== 'refused' || manifest.calls !== 0) {
    throw new Error('preparation is not a no-call manifest');
  }
  const item = manifest.items.find((entry) => entry.idempotenceKey === key);
  if (!item) throw new Error('idempotence key is not in the preparation');
  const recorded = usageOf(usage);
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const digest = sha256(bytes);
  const folder = join(dir, 'raw', key);
  const bodyPath = join(folder, 'body');
  const metaPath = join(folder, 'meta.json');
  if (existsSync(folder)) {
    if (!existsSync(bodyPath) || !existsSync(metaPath)) throw new Error('partial raw response; refusing to repair or replace it');
    const stored = readFileSync(bodyPath);
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    const storedHash = sha256(stored);
    if (storedHash !== meta.sha256) throw new Error('stored body does not match its recorded hash');
    if (storedHash !== digest) throw new Error('idempotence key already has different bytes');
    if (meta.usage.inputTokens !== recorded.inputTokens || meta.usage.outputTokens !== recorded.outputTokens) {
      throw new Error('idempotence key already has different usage');
    }
    return { status: 'already-stored', sha256: digest, idempotenceKey: key };
  }
  mkdirSync(folder);
  writeFileSync(bodyPath, bytes);
  writeFileSync(metaPath, `${JSON.stringify({
    idempotenceKey: key,
    sha256: digest,
    bytes: bytes.length,
    usage: recorded,
    surface: item.surface,
    tool: item.tool,
    model: item.model,
    queryId: item.queryId,
    repeat: item.repeat,
  }, null, 2)}\n`);
  const written = readFileSync(bodyPath);
  if (sha256(written) !== digest) throw new Error('wrote a raw body whose hash does not match');
  return { status: 'stored', sha256: digest, idempotenceKey: key };
}

/** Checks a preparation and any stored raw responses. Does not read gold labels or call a model. */
export function validateStrictPreparation(dir) {
  const { manifest } = readManifest(dir);
  const live = loadStrictJudgeRequest();
  if (manifest.requestSha256 !== live.sha256) throw new Error('manifest request hash does not match the candidate file');
  if (manifest.calls !== 0 || manifest.network !== 'refused') throw new Error('manifest recorded a call');
  if (manifest.freshProspectiveHoldout !== false) throw new Error('manifest must not claim a fresh prospective holdout');
  if (manifest.judgeAccuracy !== 'not-measured') throw new Error('manifest must not claim judge accuracy');
  const stored = [];
  const missing = [];
  for (const item of manifest.items) {
    const folder = join(dir, 'raw', item.idempotenceKey);
    const bodyPath = join(folder, 'body');
    const metaPath = join(folder, 'meta.json');
    if (!existsSync(folder)) {
      missing.push(item.idempotenceKey);
      continue;
    }
    if (!existsSync(bodyPath) || !existsSync(metaPath)) throw new Error(`partial raw response for ${item.idempotenceKey}`);
    const body = readFileSync(bodyPath);
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    usageOf(meta.usage);
    const digest = sha256(body);
    if (digest !== meta.sha256) throw new Error(`raw response hash mismatch for ${item.idempotenceKey}`);
    if (meta.tool !== item.tool || meta.surface !== item.surface || meta.model !== item.model) {
      throw new Error(`raw response bucket does not match the plan for ${item.idempotenceKey}`);
    }
    stored.push({ idempotenceKey: item.idempotenceKey, sha256: digest, usage: meta.usage, tool: item.tool, surface: item.surface, model: item.model });
  }
  return {
    protocol: missing.length === 0 ? 'responses-stored' : 'prepared',
    judgeAccuracy: 'not-measured',
    freshProspectiveHoldout: false,
    calls: 0,
    stored: stored.length,
    missing: missing.length,
    responses: stored,
    note: 'Gold labels are not read. Judge accuracy is not measured. Original signed-out captures are not a fresh prospective holdout.',
  };
}
