// Offline scorer for strict-visibility-win-v2. It does not call a model,
// read answer text, or rescore strict-visibility-win-v1 records.
// A contradictory label is kept as stored. It is not rewritten to true or false.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVAL_DIR, loadSchema, readJson } from './load.mjs';
import { validate } from './schema.mjs';
import { TOOLS_FOR_SURFACE, visibilityOutcome } from './strict-visibility.mjs';

export const STRICT_VISIBILITY_V2 = 'strict-visibility-win-v2';
export const DECISION1_V2_QUESTIONS_FILE = 'questions/questions.strict-visibility-decision1.v2.json';
export const DECISION1_V2_QUESTIONS_SHA256 = '7baece442ad3dcf0c65b2995efc8efb89da8f7988a887e4799c44cbb4d51e392';

const QUESTIONS_PATH = join(EVAL_DIR, DECISION1_V2_QUESTIONS_FILE);
const REQUIRED_ANSWER_FIELDS = [
  'targetPrimary',
  'criminalNamesakeMention',
  'identityClass',
  'harmfulAttribution',
  'factAccuracy',
  'citationSupport',
];
const NAMESAKE_CLASSES = new Set(['other-only', 'both-separated', 'conflated']);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Loads the frozen v2 question file. Refuses a byte that does not match the pin. */
export function loadDecision1V2Questions() {
  const bytes = readFileSync(QUESTIONS_PATH);
  const digest = sha256(bytes);
  if (digest !== DECISION1_V2_QUESTIONS_SHA256) {
    throw new Error(`v2 questions sha256 ${digest} does not match ${DECISION1_V2_QUESTIONS_SHA256}`);
  }
  const document = JSON.parse(bytes.toString('utf8'));
  if (document.version !== 'strict-visibility-decision1-v2') throw new Error('v2 questions version mismatch');
  return { bytes, sha256: digest, document };
}

/**
 * Classes that mean the criminal namesake is in the text cannot sit beside a
 * mention label that is false or unknown. other-only also cannot sit beside
 * targetPrimary true. An explicit win pair cannot also be an abstention.
 * Nothing here rewrites a stored label.
 */
export function fieldContradictions(record) {
  const problems = [];
  if (NAMESAKE_CLASSES.has(record.identityClass) && record.criminalNamesakeMention !== 'true') {
    problems.push(`${record.identityClass} means the criminal namesake is present, so criminalNamesakeMention ${JSON.stringify(record.criminalNamesakeMention)} contradicts it`);
  }
  if (record.identityClass === 'other-only' && record.targetPrimary === 'true') {
    problems.push('identityClass other-only contradicts targetPrimary true');
  }
  if (record.identityClass === 'target-only' && record.criminalNamesakeMention === 'true') {
    problems.push('identityClass target-only contradicts criminalNamesakeMention true');
  }
  if (record.abstained === true && record.targetPrimary === 'true' && record.criminalNamesakeMention === 'false') {
    problems.push('abstained true contradicts an explicit win pair; not scored as a win or as a settled abstention');
  }
  return problems;
}

function scored(record, fields) {
  return {
    id: typeof record?.id === 'string' ? record.id : null,
    rubricVersion: Object.hasOwn(record ?? {}, 'rubricVersion') ? record.rubricVersion : null,
    appliedRubric: fields.appliedRubric ?? null,
    outcome: fields.outcome,
    win: fields.win === true,
    inFullDenominator: fields.inFullDenominator === true,
    inDecisiveDenominator: fields.inDecisiveDenominator === true,
    needsReview: fields.needsReview !== false,
    targetPrimary: record?.targetPrimary ?? null,
    criminalNamesakeMention: record?.criminalNamesakeMention ?? null,
    identityClass: record?.identityClass ?? null,
    harmfulAttribution: record?.harmfulAttribution ?? null,
    factAccuracy: record?.factAccuracy ?? null,
    citationSupport: record?.citationSupport ?? null,
    abstained: record?.abstained ?? null,
    problems: fields.problems ?? [],
  };
}

/** Scores one v2 extraction. Does not default a missing or unknown label to false. */
export function scoreStrictVisibilityV2(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    return scored(null, { outcome: 'invalid', problems: ['record must be an object'] });
  }
  const supplied = Object.hasOwn(record, 'rubricVersion') ? record.rubricVersion : null;
  if (supplied !== STRICT_VISIBILITY_V2) {
    return scored(record, {
      outcome: 'version-mismatch',
      problems: [`rubricVersion ${JSON.stringify(supplied)} is not ${STRICT_VISIBILITY_V2}`],
    });
  }
  const problems = validate(loadSchema('strict-extraction'), record);
  if (record.coverage === 'answer-present') {
    for (const key of REQUIRED_ANSWER_FIELDS) {
      if (!Object.hasOwn(record, key)) problems.push(`missing required ${key}`);
    }
    if (record.abstained !== true && record.abstained !== false) {
      problems.push('abstained must be an explicit boolean; omitted abstained is not false and is not a win');
    }
  }
  const allowedTools = TOOLS_FOR_SURFACE[record.surface];
  if (allowedTools && Object.hasOwn(record, 'tool') && !allowedTools.includes(record.tool)) {
    problems.push(`tool ${JSON.stringify(record.tool)} does not belong on surface ${record.surface}`);
  }
  if (problems.length > 0) {
    return scored(record, { appliedRubric: STRICT_VISIBILITY_V2, outcome: 'invalid', problems });
  }
  if (record.coverage !== 'answer-present') {
    return scored(record, {
      appliedRubric: STRICT_VISIBILITY_V2,
      outcome: 'coverage-missing',
      needsReview: false,
      problems: [],
    });
  }
  const contradictions = fieldContradictions(record);
  if (contradictions.length > 0) {
    return scored(record, {
      appliedRubric: STRICT_VISIBILITY_V2,
      outcome: 'invalid',
      needsReview: true,
      problems: contradictions,
    });
  }
  const rawOutcome = visibilityOutcome(record);
  if (rawOutcome === 'abstain') {
    return scored(record, {
      appliedRubric: STRICT_VISIBILITY_V2,
      outcome: 'invalid',
      needsReview: true,
      problems: ['v2 has no abstain outcome; a committed win pair with abstained true is a contradiction'],
    });
  }
  const outcome = rawOutcome;
  const unknownLike = outcome === 'unknown';
  const needsReview = unknownLike
    || record.identityClass === 'uncertain'
    || record.identityClass === 'unknown'
    || record.harmfulAttribution === 'unknown'
    || record.factAccuracy === 'unknown';
  return scored(record, {
    appliedRubric: STRICT_VISIBILITY_V2,
    outcome,
    win: outcome === 'win',
    inFullDenominator: outcome === 'win' || outcome === 'loss' || unknownLike,
    inDecisiveDenominator: outcome === 'win' || outcome === 'loss',
    needsReview,
    problems: [],
  });
}

const REQUIRED_CHOICES = [
  'coverage',
  'targetPrimary',
  'criminalNamesakeMention',
  'identityClass',
  'harmfulAttribution',
  'citationSupport',
  'positionDiagnostic',
  'abstained',
];

function choiceOf(rawField, criteria) {
  if (!rawField || typeof rawField !== 'object') return { error: 'answer is missing' };
  if (rawField.type !== 'choice') return { error: 'answer type is not choice' };
  if (!rawField.probabilities || typeof rawField.probabilities !== 'object' || Array.isArray(rawField.probabilities)) {
    return { error: 'probabilities are missing' };
  }
  if (Object.hasOwn(rawField, 'probs')) return { error: 'probs is not probabilities' };
  if (typeof rawField.choice !== 'string' || !(rawField.choice in criteria)) return { error: 'answer choice is missing or not in criteria' };
  if (!(rawField.choice in rawField.probabilities)) return { error: 'probabilities omit the chosen label' };
  return { choice: rawField.choice };
}

/**
 * Maps a Decision-1 body through the v2 questions. factAccuracy stays unknown.
 * abstained unknown is an error, not false. This function does not send.
 */
export function decodeDecision1V2Response(body) {
  const bundle = loadDecision1V2Questions();
  const usage = body && typeof body === 'object' ? body.usage : undefined;
  const readUsage = (key) => {
    if (!usage || typeof usage !== 'object' || !Object.hasOwn(usage, key)) return { status: 'unknown', value: null };
    if (!Number.isInteger(usage[key]) || usage[key] < 0) return { status: 'invalid', value: null };
    return { status: 'returned', value: usage[key] };
  };
  const reported = { input_tokens: readUsage('input_tokens'), output_tokens: readUsage('output_tokens') };
  if (!body || typeof body !== 'object' || !body.answers || typeof body.answers !== 'object') {
    return { status: 'error', problems: ['response answers object is missing'], extraction: null, usage: reported };
  }
  const problems = [];
  const fields = {};
  for (const name of REQUIRED_CHOICES) {
    const parsed = choiceOf(body.answers[name], bundle.document.questions[name].criteria);
    if (parsed.error) problems.push(`${name}: ${parsed.error}`);
    else fields[name] = parsed.choice;
  }
  if (reported.input_tokens.status !== 'returned' || reported.output_tokens.status !== 'returned') {
    problems.push('provider usage is missing or invalid; not recorded as zero');
  }
  if (problems.length > 0) return { status: 'error', problems, extraction: null, usage: reported };
  if (fields.abstained === 'unknown') {
    return {
      status: 'error',
      problems: ['abstained choice unknown is not false and is not scored'],
      extraction: null,
      usage: reported,
    };
  }
  return {
    status: 'ok',
    problems: [],
    usage: reported,
    factAccuracySource: 'no-approved-fact-evidence',
    citationSupportMeans: 'text-label-not-verified-url',
    extraction: {
      rubricVersion: STRICT_VISIBILITY_V2,
      coverage: fields.coverage,
      targetPrimary: fields.targetPrimary,
      criminalNamesakeMention: fields.criminalNamesakeMention,
      identityClass: fields.identityClass,
      harmfulAttribution: fields.harmfulAttribution,
      factAccuracy: 'unknown',
      citationSupport: fields.citationSupport,
      positionDiagnostic: fields.positionDiagnostic,
      abstained: fields.abstained === 'true',
    },
  };
}

export const PROSPECTIVE_QUERIES = [
  { id: 'name', prompt: 'kaleb cole' },
  { id: 'who-is', prompt: 'who is kaleb cole' },
  { id: 'name-microsoft', prompt: 'kaleb cole microsoft' },
  { id: 'name-seattle-swe', prompt: 'kaleb cole seattle software engineer' },
];

export const PROSPECTIVE_SESSIONS = [
  { engine: 'google', session: 'signed-out' },
  { engine: 'gemini', session: 'signed-out' },
];

export function prospectiveQuerySha256() {
  return sha256(Buffer.from(JSON.stringify(PROSPECTIVE_QUERIES)));
}

/** One planned slot per approved name query and pinned engine session. */
export function prospectiveV2Slots() {
  const slots = [];
  for (const session of PROSPECTIVE_SESSIONS) {
    for (const query of PROSPECTIVE_QUERIES) {
      slots.push({
        id: `${session.engine}:${session.session}:${query.id}`,
        engine: session.engine,
        session: session.session,
        queryId: query.id,
        prompt: query.prompt,
      });
    }
  }
  return slots;
}

function emptyBucket() {
  return {
    planned: 0,
    win: 0,
    loss: 0,
    unknown: 0,
    invalid: 0,
    missing: 0,
    coverageMissing: 0,
    versionMismatch: 0,
    abstentions: 0,
  };
}

/**
 * Accounts every planned slot. Invalid, unknown, abstention, and missing
 * stay in the total. Abstention is unknown with abstained true. Invalid is
 * not a correct judgment. This function does not send.
 */
export function accountProspectiveV2(extractions = new Map()) {
  const slots = prospectiveV2Slots();
  const plannedIds = new Set(slots.map((slot) => slot.id));
  const provided = extractions instanceof Map ? extractions : new Map(Object.entries(extractions ?? {}));
  for (const key of provided.keys()) {
    if (!plannedIds.has(key)) throw new Error(`extraction ${key} is not a planned slot`);
  }
  const rows = slots.map((slot) => {
    if (!provided.has(slot.id)) {
      return {
        ...slot,
        outcome: 'missing',
        win: false,
        abstained: null,
        problems: ['no extraction for this planned slot'],
      };
    }
    const scoredRow = scoreStrictVisibilityV2(provided.get(slot.id));
    return { ...slot, ...scoredRow };
  });
  const tally = (name) => rows.filter((row) => row.outcome === name).length;
  const outcomes = {
    win: tally('win'),
    loss: tally('loss'),
    unknown: tally('unknown'),
    invalid: tally('invalid'),
    missing: tally('missing'),
    coverageMissing: tally('coverage-missing'),
    versionMismatch: tally('version-mismatch'),
  };
  const planned = rows.length;
  const accounted = Object.values(outcomes).reduce((sum, count) => sum + count, 0);
  if (accounted !== planned) throw new Error(`accounted ${accounted} of ${planned} planned slots`);
  const abstentions = rows.filter((row) => row.outcome === 'unknown' && row.abstained === true).length;
  const decisiveDenominator = outcomes.win + outcomes.loss;
  const byEngineSession = {};
  for (const row of rows) {
    const key = `${row.engine}/${row.session}`;
    const bucket = byEngineSession[key] ?? emptyBucket();
    bucket.planned += 1;
    if (row.outcome === 'win') bucket.win += 1;
    else if (row.outcome === 'loss') bucket.loss += 1;
    else if (row.outcome === 'unknown') bucket.unknown += 1;
    else if (row.outcome === 'invalid') bucket.invalid += 1;
    else if (row.outcome === 'missing') bucket.missing += 1;
    else if (row.outcome === 'coverage-missing') bucket.coverageMissing += 1;
    else if (row.outcome === 'version-mismatch') bucket.versionMismatch += 1;
    if (row.outcome === 'unknown' && row.abstained === true) bucket.abstentions += 1;
    byEngineSession[key] = bucket;
  }
  return {
    candidate: STRICT_VISIBILITY_V2,
    questionsSha256: DECISION1_V2_QUESTIONS_SHA256,
    querySha256: prospectiveQuerySha256(),
    calls: 0,
    planned,
    accounted,
    queries: PROSPECTIVE_QUERIES,
    invalidMeans: 'contradiction or missing required label; not a correct judgment and not a fix',
    outcomes,
    abstentions,
    fullPipeline: { wins: outcomes.win, denominator: planned },
    decisiveConditional: {
      wins: outcomes.win,
      losses: outcomes.loss,
      denominator: decisiveDenominator,
      coverageNumerator: decisiveDenominator,
      coverageDenominator: planned,
    },
    byEngineSession,
    rows,
  };
}
