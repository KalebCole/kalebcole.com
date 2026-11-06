// Scores explicit extraction records under strict-visibility-win-v1.
// This module does not read answer text, call a model, or relabel rubric
// 1.0.0. A missing field stays missing. It is never treated as false.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVAL_DIR, loadSchema, readJson } from './load.mjs';
import { validate } from './schema.mjs';

export const STRICT_VISIBILITY_VERSION = 'strict-visibility-win-v1';
export const POSITION_RUBRIC_VERSION = 'visibility-only-v1';

export const BASELINE_QUESTION_IDS = [
  'identity_class',
  'asserts_target_role',
  'asserts_target_employer',
  'asserts_target_location',
  'asserts_sole_creator_series',
  'attaches_namesake_crime_to_engineer',
  'citation_supports_engineer_claim',
  'needs_human_review',
];

export const APPROVED_QUERY_IDS = ['name', 'who-is', 'name-microsoft', 'name-seattle-swe'];

/** The frozen visibility-only payload contains one historical em dash. Punctuation skips this path only. */
export const FROZEN_EMDASH_EXCEPTION = 'evals/seo-aeo/questions/questions.visibility-only.v1.frozen.json';

export const FROZEN_QUESTIONS = {
  baseline: {
    file: 'questions.baseline.v1.frozen.json',
    version: '1.0.0-compact-for-capacity1',
    sha256: '0e70f2631611957037a07d2e8afe044bd6b8d7534e6a5557f284b598d16fbc76',
  },
  visibilityOnly: {
    file: 'questions.visibility-only.v1.frozen.json',
    version: POSITION_RUBRIC_VERSION,
    sha256: '8c44e4987ff58edff58c528e75e47c8408f4870f74ba7a75412a07b08560a89d',
  },
};

const JUDGMENT_FIELDS = {
  targetPrimary: ['true', 'false', 'unknown'],
  criminalNamesakeMention: ['true', 'false', 'unknown'],
  identityClass: ['target-only', 'other-only', 'both-separated', 'conflated', 'uncertain', 'unknown'],
  harmfulAttribution: ['true', 'false', 'unknown'],
  factAccuracy: ['verified', 'incorrect', 'unknown', 'not-applicable'],
  citationSupport: ['true', 'false', 'unknown', 'not-applicable'],
};

const COVERAGE = new Set(['answer-present', 'no-answer', 'aio-absent']);
const POSITION = new Set(['target-leads', 'target-mentioned-later', 'target-absent', 'uncertain', 'not-recorded']);

export const RUBRIC_1_STRICT_DISCLOSURE_LINES = [
  '## Strict visibility win',
  '',
  'This note is scoring version strict-visibility-win-v1. The Visibility (rubric 1.0.0) row above counts target-only and both-separated answers. That row is not a strict visibility win.',
  '',
  'A strict visibility win is an answer that is primarily about the target Kaleb Cole and that does not mention the other namesake. A clear disclaimer that a different Kaleb Cole was involved in federal proceedings still mentions that namesake, so it is not a win. That mention is not, by itself, a harmful attribution. Fact errors and missing citations are separate. No answer, and an absent AI Overview, are coverage gaps, not the same as an answer about someone else.',
  '',
  'This run did not score strict-visibility-win-v1 extraction records. Score those offline with `npm run eval:seo-aeo -- score-strict <file>`. Rubric 1.0.0 is not that result, and the visibility-only-v1 position question is not that result either.',
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function rate(numerator, denominator) {
  if (denominator === 0) return { numerator, denominator, score: null, status: 'missing' };
  return { numerator, denominator, score: Math.round((100 * numerator) / denominator), status: 'measured' };
}

function echoEnum(record, key, allowed) {
  if (!record || typeof record !== 'object' || !Object.hasOwn(record, key)) return null;
  return allowed.includes(record[key]) ? record[key] : null;
}

/**
 * Win only when the answer is primarily the target and the criminal namesake
 * is explicitly unmentioned. A known failure of either condition is a loss.
 * An unknown condition is unknown, unless the other condition has already
 * failed. Abstention overrides a pair that would otherwise win.
 * positionDiagnostic is intentionally not a parameter.
 */
export function visibilityOutcome(record) {
  if (record.abstained === true) return 'abstain';
  const primary = record.targetPrimary;
  const namesake = record.criminalNamesakeMention;
  if (primary === 'true' && namesake === 'false') return 'win';
  if (primary === 'false' || namesake === 'true') return 'loss';
  return 'unknown';
}

function blank(record, fields) {
  const id = typeof record?.id === 'string' ? record.id : null;
  const coverage = COVERAGE.has(record?.coverage) ? record.coverage : null;
  return {
    id,
    case: typeof record?.case === 'string' ? record.case : null,
    rubricVersion: Object.hasOwn(record ?? {}, 'rubricVersion') ? record.rubricVersion : null,
    appliedRubric: null,
    outcome: 'invalid',
    win: false,
    inFullDenominator: false,
    inDecisiveDenominator: false,
    needsReview: true,
    coverage,
    queryId: APPROVED_QUERY_IDS.includes(record?.queryId) ? record.queryId : null,
    surface: typeof record?.surface === 'string' ? record.surface : null,
    model: typeof record?.model === 'string' ? record.model : null,
    targetPrimary: echoEnum(record, 'targetPrimary', JUDGMENT_FIELDS.targetPrimary),
    criminalNamesakeMention: echoEnum(record, 'criminalNamesakeMention', JUDGMENT_FIELDS.criminalNamesakeMention),
    identityClass: echoEnum(record, 'identityClass', JUDGMENT_FIELDS.identityClass),
    harmfulAttribution: echoEnum(record, 'harmfulAttribution', JUDGMENT_FIELDS.harmfulAttribution),
    factAccuracy: echoEnum(record, 'factAccuracy', JUDGMENT_FIELDS.factAccuracy),
    citationSupport: echoEnum(record, 'citationSupport', JUDGMENT_FIELDS.citationSupport),
    positionDiagnostic: echoEnum(record, 'positionDiagnostic', [...POSITION]),
    problems: [],
    ...fields,
  };
}

/** Scores one extraction. Does not default a missing boolean to false. */
export function scoreExtraction(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    return blank(null, { problems: ['record must be an object'] });
  }
  const supplied = Object.hasOwn(record, 'rubricVersion') ? record.rubricVersion : null;
  if (supplied !== STRICT_VISIBILITY_VERSION) {
    return blank(record, {
      outcome: 'version-mismatch',
      problems: [`rubricVersion ${JSON.stringify(supplied)} is not ${STRICT_VISIBILITY_VERSION}`],
    });
  }

  const problems = validate(loadSchema('strict-extraction'), record);
  if (record.coverage === 'answer-present') {
    for (const key of Object.keys(JUDGMENT_FIELDS)) {
      if (!Object.hasOwn(record, key)) problems.push(`missing required ${key}`);
    }
  }
  if (problems.length > 0) {
    return blank(record, { appliedRubric: STRICT_VISIBILITY_VERSION, outcome: 'invalid', problems });
  }
  if (record.coverage !== 'answer-present') {
    return blank(record, {
      appliedRubric: STRICT_VISIBILITY_VERSION,
      outcome: 'coverage-missing',
      needsReview: false,
      problems: [],
    });
  }

  const outcome = visibilityOutcome(record);
  const unknownLike = outcome === 'unknown' || outcome === 'abstain';
  const needsReview = unknownLike
    || record.identityClass === 'uncertain'
    || record.identityClass === 'unknown'
    || record.harmfulAttribution === 'unknown'
    || record.factAccuracy === 'unknown';
  return blank(record, {
    appliedRubric: STRICT_VISIBILITY_VERSION,
    outcome,
    win: outcome === 'win',
    inFullDenominator: outcome === 'win' || outcome === 'loss' || unknownLike,
    inDecisiveDenominator: outcome === 'win' || outcome === 'loss',
    needsReview,
    problems: [],
  });
}

function tally(items, key, value) {
  return items.filter((item) => item[key] === value).length;
}

function summarize(surface, model, items) {
  const wins = tally(items, 'outcome', 'win');
  const losses = tally(items, 'outcome', 'loss');
  const unknown = tally(items, 'outcome', 'unknown');
  const abstentions = tally(items, 'outcome', 'abstain');
  const fullDenominator = wins + losses + unknown + abstentions;
  const decisiveDenominator = wins + losses;
  const judged = items.filter((item) => item.inFullDenominator);
  const labeledVerified = tally(judged, 'factAccuracy', 'verified');
  const incorrect = tally(judged, 'factAccuracy', 'incorrect');
  const factUnknown = tally(judged, 'factAccuracy', 'unknown');
  const harmfulTrue = tally(judged, 'harmfulAttribution', 'true');
  const harmfulFalse = tally(judged, 'harmfulAttribution', 'false');
  const harmfulUnknown = tally(judged, 'harmfulAttribution', 'unknown');
  const cited = tally(judged, 'citationSupport', 'true');
  const uncited = tally(judged, 'citationSupport', 'false');
  const citationUnknown = tally(judged, 'citationSupport', 'unknown');
  return {
    surface,
    model,
    observations: items.length,
    visibility: {
      wins,
      losses,
      unknown,
      abstentions,
      invalid: tally(items, 'outcome', 'invalid'),
      versionMismatch: tally(items, 'outcome', 'version-mismatch'),
      fullDenominator,
      decisiveDenominator,
      full: rate(wins, fullDenominator),
      decisiveOnly: rate(wins, decisiveDenominator),
      decisiveOnlyCoverage: rate(decisiveDenominator, fullDenominator),
    },
    identity: {
      harmfulTrue,
      harmfulFalse,
      harmfulUnknown,
      fullDenominator: harmfulTrue + harmfulFalse + harmfulUnknown,
      targetOnly: tally(judged, 'identityClass', 'target-only'),
      otherOnly: tally(judged, 'identityClass', 'other-only'),
      bothSeparated: tally(judged, 'identityClass', 'both-separated'),
      conflated: tally(judged, 'identityClass', 'conflated'),
      uncertain: tally(judged, 'identityClass', 'uncertain'),
      unknown: tally(judged, 'identityClass', 'unknown'),
    },
    facts: {
      labeledVerified,
      incorrect,
      unknown: factUnknown,
      notApplicable: tally(judged, 'factAccuracy', 'not-applicable'),
      fullDenominator: labeledVerified + incorrect + factUnknown,
      labeledVerifiedRate: rate(labeledVerified, labeledVerified + incorrect + factUnknown),
    },
    citations: {
      labeledSupported: cited,
      unsupported: uncited,
      unknown: citationUnknown,
      notApplicable: tally(judged, 'citationSupport', 'not-applicable'),
      fullDenominator: cited + uncited + citationUnknown,
      labeledSupportedRate: rate(cited, cited + uncited + citationUnknown),
    },
    coverage: {
      answerPresent: items.filter((item) => item.coverage === 'answer-present' && item.inFullDenominator).length,
      noAnswer: items.filter((item) => item.outcome === 'coverage-missing' && item.coverage === 'no-answer').length,
      aioAbsent: items.filter((item) => item.outcome === 'coverage-missing' && item.coverage === 'aio-absent').length,
    },
    review: items.filter((item) => item.needsReview).map((item) => ({
      id: item.id,
      case: item.case,
      outcome: item.outcome,
      problems: item.problems,
    })),
  };
}

/**
 * Scores a batch. Groups stay split by surface and model. There is no
 * pooled win rate and no independent-sample count.
 */
export function scoreStrictVisibility(records, rubric) {
  if (!Array.isArray(records)) throw new Error('extractions must be an array');
  if (rubric?.version !== STRICT_VISIBILITY_VERSION) {
    throw new Error(`refusing to score with rubric version ${JSON.stringify(rubric?.version)}; expected ${STRICT_VISIBILITY_VERSION}`);
  }
  const scored = records.map((record) => scoreExtraction(record));
  const groups = new Map();
  for (const item of scored) {
    const key = `${item.surface ?? 'surface-missing'}\0${item.model ?? 'model-not-recorded'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const ids = scored.map((item) => item.id).filter(Boolean);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))].sort();
  return {
    rubricVersion: STRICT_VISIBILITY_VERSION,
    pooled: false,
    independenceEstimated: false,
    factsComparedToApprovedSheet: false,
    priorPositionRubricIsThisRule: false,
    duplicateIds,
    groups: [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, items]) => {
        const [surface, model] = key.split('\0');
        return summarize(surface, model, items);
      }),
    records: scored,
  };
}

function fraction(metric) {
  if (metric.status !== 'measured') return metric.status;
  return `${metric.numerator}/${metric.denominator} (${metric.score})`;
}

/** Markdown for a strict-visibility batch. Offline, and not a judge report. */
export function renderStrictVisibilityReport(result, rubric) {
  if (result?.rubricVersion !== STRICT_VISIBILITY_VERSION) {
    throw new Error('refusing to render a result that is not strict-visibility-win-v1');
  }
  const lines = [
    '# Strict visibility win',
    '',
    `Scoring version: ${STRICT_VISIBILITY_VERSION}.`,
    'This report checks extraction records against that rubric. It is not a measurement of a model, an extractor, or a consumer answer. Tests of this code show the counter, not judge accuracy.',
    'Groups are not pooled. Repeats are correlated. Independence was not estimated.',
    'Fact labels are the extraction\'s labels. This scorer does not compare them to facts.json. Unknown fact accuracy is not verified truth. A verified label is not an approved-fact result.',
    'Position labels are diagnostic. They do not decide the win.',
    rubric?.priorPositionResultsAreNotThisRule ?? 'The visibility-only position rubric is not this rule.',
  ];
  if (result.duplicateIds.length) lines.push(`Duplicate ids: ${result.duplicateIds.join(', ')}.`);
  if (result.groups.length === 0) lines.push('', 'No extraction records.');

  for (const group of result.groups) {
    const visibility = group.visibility;
    lines.push(
      '',
      `## ${group.surface} / ${group.model}`,
      '',
      `${group.observations} observations.`,
      `Strict visibility win, full denominator (unknown and abstentions stay in): ${fraction(visibility.full)}.`,
      `Decisive only, with unknowns removed from this rate: ${fraction(visibility.decisiveOnly)}.`,
      `Decisive coverage of the full denominator: ${fraction(visibility.decisiveOnlyCoverage)}.`,
      `Counts: wins ${visibility.wins}, losses ${visibility.losses}, unknown ${visibility.unknown}, abstentions ${visibility.abstentions}, invalid ${visibility.invalid}, version mismatch ${visibility.versionMismatch}.`,
      `Coverage: answer present ${group.coverage.answerPresent}, no answer ${group.coverage.noAnswer}, AI Overview absent ${group.coverage.aioAbsent}. Coverage gaps are not visibility losses.`,
      `Identity / harmful attribution: harmful true ${group.identity.harmfulTrue}, false ${group.identity.harmfulFalse}, unknown ${group.identity.harmfulUnknown}. Conflated ${group.identity.conflated}, both separated ${group.identity.bothSeparated}, other only ${group.identity.otherOnly}, target only ${group.identity.targetOnly}, uncertain ${group.identity.uncertain}. A namesake mention is not automatically harmful.`,
      `Facts: labeled verified ${group.facts.labeledVerified}, incorrect ${group.facts.incorrect}, unknown ${group.facts.unknown}, not applicable ${group.facts.notApplicable}. Labeled verified rate ${fraction(group.facts.labeledVerifiedRate)}.`,
      `Citations: labeled supported ${group.citations.labeledSupported}, unsupported ${group.citations.unsupported}, unknown ${group.citations.unknown}, not applicable ${group.citations.notApplicable}. A visibility win does not require a citation.`,
    );
    if (group.review.length === 0) {
      lines.push('Review: nothing in this group.');
    } else {
      lines.push('Review:');
      for (const item of group.review) {
        const detail = item.problems.length ? ` (${item.problems.join('; ')})` : '';
        lines.push(`- ${item.id ?? 'record'}${item.case ? ` [${item.case}]` : ''}: ${item.outcome}${detail}`);
      }
    }
  }

  lines.push('', '## Collection rules this score does not override', '');
  const collection = rubric?.collection;
  if (collection) {
    lines.push(`- Primary baseline: ${collection.primaryBaseline}.`);
    lines.push(`- Keep distinct: ${collection.keepDistinct.join('; ')}.`);
    lines.push(`- ${collection.modelVersionsDistinct}`);
    lines.push(`- Sign-out does not remove: ${collection.signOutDoesNotRemove.join(', ')}.`);
    lines.push(`- Queries: ${collection.queries.join('; ')}.`);
    lines.push(`- Excluded: ${collection.excluded.join('; ')}.`);
    lines.push(`- ${collection.repeats}`);
  }
  return `${lines.join('\n')}\n`;
}

export function loadStrictRubric(dir = EVAL_DIR) {
  const rubric = readJson(join(dir, 'rubric.strict-visibility-win-v1.json'));
  if (rubric.version !== STRICT_VISIBILITY_VERSION) {
    throw new Error(`strict rubric file is version ${rubric.version}, expected ${STRICT_VISIBILITY_VERSION}`);
  }
  return rubric;
}

/** Reads the frozen question files and refuses them if a byte has changed. */
export function verifyFrozenQuestionFiles(dir = EVAL_DIR) {
  const loaded = {};
  const errors = [];
  for (const [name, expected] of Object.entries(FROZEN_QUESTIONS)) {
    const path = join(dir, 'questions', expected.file);
    const bytes = readFileSync(path);
    const hash = sha256(bytes);
    if (hash !== expected.sha256) errors.push(`${expected.file} sha256 ${hash} does not match ${expected.sha256}`);
    const parsed = JSON.parse(bytes.toString('utf8'));
    if (parsed.version !== expected.version) errors.push(`${expected.file} version is ${parsed.version}, expected ${expected.version}`);
    loaded[name] = parsed;
  }
  if (errors.length > 0) throw new Error(`Frozen questions changed:\n- ${errors.join('\n- ')}`);
  return loaded;
}

/**
 * Builds two judge requests. The baseline request is the original eight
 * identity questions. The visibility-only request stays separate and is
 * marked as the position candidate, not the strict win.
 */
export function separateJudgeRequests(baseline, visibilityOnly) {
  if (!baseline?.questions || !visibilityOnly?.questions) throw new Error('both judge payloads need a questions object');
  if (baseline === visibilityOnly || baseline.questions === visibilityOnly.questions) {
    throw new Error('visibility questions cannot share the baseline request');
  }
  if ('visibility_of_target' in baseline.questions) {
    throw new Error('visibility_of_target is not part of the identity baseline request');
  }
  const baselineIds = Object.keys(baseline.questions);
  const sameIds = baselineIds.length === BASELINE_QUESTION_IDS.length
    && baselineIds.every((id, index) => id === BASELINE_QUESTION_IDS[index]);
  if (!sameIds) throw new Error('identity baseline question ids changed');
  const visibilityIds = Object.keys(visibilityOnly.questions);
  if (visibilityIds.length !== 1 || visibilityIds[0] !== 'visibility_of_target') {
    throw new Error('visibility-only payload must contain only visibility_of_target');
  }
  if (visibilityOnly.version !== POSITION_RUBRIC_VERSION) {
    throw new Error(`visibility-only payload is not version ${POSITION_RUBRIC_VERSION}`);
  }
  return {
    baselineRequest: {
      role: 'identity-baseline',
      version: baseline.version,
      questions: structuredClone(baseline.questions),
    },
    visibilityRequest: {
      role: 'visibility-only-position-candidate',
      version: visibilityOnly.version,
      strictVisibilityWin: false,
      note: 'Prior position rubric. Not strict-visibility-win-v1. A target-leads label from this question is not the approved win.',
      questions: structuredClone(visibilityOnly.questions),
    },
  };
}

/** Reads a JSON array, or an object with a records array. Does not call a network. */
export function readExtractionFile(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.records)) return parsed.records;
  throw new Error('extraction file must be a JSON array or an object with a records array');
}
