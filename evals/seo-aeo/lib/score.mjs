// Scores captured answers against the rubric. Every metric is 0 to 100 when
// measurable and carries its raw numerator and denominator. Missing or not
// applicable is reported as such, never as zero. Answers that need human
// review are left out of the scores until a review decision exists.
import { createHash } from 'node:crypto';
import { classifyAnswer, compileSignals, extractTargetFacts } from './classify.mjs';
import { activeFacts } from './load.mjs';
import { urlMatchesAny } from './urls.mjs';

export const METRICS = ['visibility', 'entitySeparation', 'factAccuracy', 'completeness', 'citationSupport', 'organicRank'];
const ABOUT_TARGET = new Set(['target-only', 'both-separated', 'conflated']);
const DECIDED = new Set(['target-only', 'other-only', 'both-separated', 'conflated']);

export function answerId(answer) {
  return `${answer.provider}:${answer.surface}:${answer.queryId}:${answer.repeat}`;
}

const ratio = (numerator, denominator) => Math.round((100 * numerator) / denominator);

function metric(numerator, denominator, emptyStatus, extra = {}) {
  if (denominator === 0) return { score: null, numerator, denominator, status: emptyStatus, ...extra };
  return { score: ratio(numerator, denominator), numerator, denominator, status: 'measured', ...extra };
}

/** Linear rank normalization documented in rubric.json organicRank. */
export function normalizeRank(position, captured) {
  if (!captured) return null;
  if (position === null) return 0;
  return Math.round((100 * (captured + 1 - position)) / captured);
}

function organicEvidence(answer, rubric, signals, namesakeUrls) {
  if (!Array.isArray(answer.organic)) return null;
  const results = [...answer.organic].sort((a, b) => a.position - b.position);
  const captured = results.length;
  const first = (predicate) => results.find(predicate)?.position ?? null;
  const namesakeText = (result) => signals.namesake.some((fact) => fact.match.some((pattern) => pattern.test(`${result.title ?? ''} ${result.snippet ?? ''}`)));
  const site = first((result) => urlMatchesAny(result.url, [rubric.signals.siteUrl]));
  return {
    captured,
    sitePosition: site,
    siteRank: site === null ? `>${captured}` : site,
    ownedPosition: first((result) => urlMatchesAny(result.url, rubric.signals.targetOwnedUrls)),
    namesakePosition: first((result) => namesakeUrls.has(result.url) || namesakeText(result)),
    score: normalizeRank(site, captured),
  };
}

/**
 * Namesake claims attributed to the engineer in a conflated answer: the
 * reviewer's list when given, else the same-sentence conflations, else every
 * namesake claim the answer asserts (a reviewer confirmed it conflates).
 */
function conflatedNamesake(auto, review) {
  if (review?.attributedNamesakeFactIds) return review.attributedNamesakeFactIds;
  if (auto.conflatedNamesakeFactIds.length) return auto.conflatedNamesakeFactIds;
  return auto.assertedNamesakeFactIds;
}

/** Scores one answer, applying a human review decision when present. */
export function evaluateAnswer(answer, { queries, facts, rubric, signals, namesakeUrls, review }) {
  const query = queries.queries.find((entry) => entry.id === answer.queryId);
  const base = {
    answerId: answerId(answer),
    provider: answer.provider,
    surface: answer.surface,
    label: answer.label,
    queryId: answer.queryId,
    repeat: answer.repeat,
    model: answer.model,
    status: answer.status,
    reason: answer.reason,
  };
  if (answer.status !== 'ok') return base;

  const hasText = typeof answer.text === 'string' && answer.text.trim() !== '';
  const result = { ...base, hasText, organic: organicEvidence(answer, rubric, signals, namesakeUrls) };
  if (!hasText) return result;

  const auto = classifyAnswer(answer.text, signals);
  const classification = review?.classification ?? auto.classification;
  const reviewed = Boolean(review?.classification);
  const pendingReview = !reviewed && rubric.reviewRequired.includes(classification);

  const aboutTarget = ABOUT_TARGET.has(classification);
  const extracted = aboutTarget ? extractTargetFacts(auto.targetText, signals) : { present: [], contradicted: [], negated: [] };
  const present = new Set(extracted.present);
  const contradicted = new Set(extracted.contradicted);
  for (const [factId, label] of Object.entries(review?.facts ?? {})) {
    present.delete(factId);
    contradicted.delete(factId);
    if (label === 'correct') present.add(factId);
    if (label === 'incorrect') contradicted.add(factId);
  }
  const excluded = new Set(rubric.accuracyExcludesFactIds);
  const targetFactIds = new Set(activeFacts(facts).filter((fact) => fact.subject === 'target').map((fact) => fact.id));
  const required = (query?.requiredFactIds ?? []).filter((id) => targetFactIds.has(id));

  const citations = answer.citations ?? [];
  const targetOwned = citations.filter((citation) => urlMatchesAny(citation.url, rubric.signals.targetOwnedUrls)).map((citation) => citation.url);
  const corroborating = citations.filter((citation) => urlMatchesAny(citation.url, rubric.signals.corroboratingUrls)).map((citation) => citation.url);

  return {
    ...result,
    autoClassification: auto.classification,
    classification,
    reviewed,
    pendingReview,
    reasons: auto.reasons,
    flaggedSentences: auto.sentences
      .filter((sentence) => sentence.namesake.length > 0 || (classification === 'uncertain' && sentence.target.length === 0))
      .map((sentence) => sentence.text),
    facts: {
      present: [...present].filter((id) => targetFactIds.has(id)),
      contradicted: [...contradicted].filter((id) => targetFactIds.has(id)),
      scoredCorrect: [...present].filter((id) => targetFactIds.has(id) && !excluded.has(id)).length,
      negatedUnlabeled: extracted.negated.filter((id) => targetFactIds.has(id) && !(id in (review?.facts ?? {}))),
      conflatedNamesake: classification === 'conflated' ? conflatedNamesake(auto, review) : [],
      required,
      requiredPresent: aboutTarget ? required.filter((id) => present.has(id)) : [],
    },
    citations: {
      count: citations.length,
      siteCited: citations.some((citation) => urlMatchesAny(citation.url, [rubric.signals.siteUrl])),
      targetOwned,
      corroborating,
      supportConfirmed: review?.citationSupport ?? null,
    },
  };
}

function groupKey(answer) {
  return `${answer.provider}|${answer.surface}|${answer.label}`;
}

/**
 * Hashes everything that must match for two runs to be compared: the
 * definition versions, the locale, the surface and provider settings, the
 * recorded models, and the queries and repeats the group actually ran.
 */
export function compatibilityKey({ queries, facts, rubric, config }, surface, answers = []) {
  const ran = new Set(answers.map((answer) => answer.queryId));
  const provider = config.providers.find((entry) => entry.id === answers[0]?.provider);
  const basis = {
    queries: queries.version,
    prompts: queries.queries.filter((query) => ran.size === 0 || ran.has(query.id)).map((query) => [query.id, query.prompt]),
    facts: facts.version,
    rubric: rubric.version,
    locale: config.locale,
    repeats: answers.length ? Math.max(...answers.map((answer) => answer.repeat)) : config.repeats,
    surface,
    provider: provider ? { id: provider.id, adapter: provider.adapter, label: provider.label, citations: provider.citations, organic: provider.organic } : answers[0]?.provider ?? null,
    models: [...new Set(answers.map((answer) => answer.model).filter(Boolean))].sort(),
  };
  return createHash('sha256').update(JSON.stringify(basis)).digest('hex').slice(0, 12);
}

function scoreGroup(evaluations, provider) {
  const ok = evaluations.filter((evaluation) => evaluation.status === 'ok');
  const classified = ok.filter((evaluation) => evaluation.hasText);
  const pending = classified.filter((evaluation) => evaluation.pendingReview);
  const decided = classified.filter((evaluation) => !evaluation.pendingReview && DECIDED.has(evaluation.classification));
  const count = (name) => decided.filter((evaluation) => evaluation.classification === name).length;
  const aboutTarget = decided.filter((evaluation) => ABOUT_TARGET.has(evaluation.classification));
  const pendingCount = pending.length;

  const visibility = metric(count('target-only') + count('both-separated'), decided.length, 'missing', { pendingReview: pendingCount });
  const entitySeparation = metric(decided.length - count('conflated'), decided.length, 'missing', {
    pendingReview: pendingCount,
    confirmedConflations: count('conflated'),
  });

  const correct = aboutTarget.reduce((sum, evaluation) => sum + evaluation.facts.scoredCorrect, 0);
  const incorrect = aboutTarget.reduce((sum, evaluation) => sum + evaluation.facts.contradicted.length + evaluation.facts.conflatedNamesake.length, 0);
  const factAccuracy = metric(correct, correct + incorrect, decided.length === 0 ? 'missing' : 'not-applicable', { pendingReview: pendingCount, correct, incorrect });

  const requiredTotal = decided.reduce((sum, evaluation) => sum + evaluation.facts.required.length, 0);
  const requiredPresent = decided.reduce((sum, evaluation) => sum + evaluation.facts.requiredPresent.length, 0);
  const completeness = metric(requiredPresent, requiredTotal, decided.length === 0 ? 'missing' : 'not-applicable', { pendingReview: pendingCount });

  let citationSupport;
  if (provider && provider.citations === false) {
    citationSupport = { score: null, numerator: 0, denominator: 0, status: 'not-applicable', note: 'surface returns no citations' };
  } else {
    const supported = aboutTarget.filter((evaluation) =>
      evaluation.citations.supportConfirmed !== false && (evaluation.citations.targetOwned.length > 0 || evaluation.citations.corroborating.length > 0));
    citationSupport = metric(supported.length, aboutTarget.length, decided.length === 0 ? 'missing' : 'not-applicable', {
      siteCited: aboutTarget.filter((evaluation) => evaluation.citations.siteCited).length,
      supportConfirmed: aboutTarget.filter((evaluation) => evaluation.citations.supportConfirmed === true).length,
      supportRejected: aboutTarget.filter((evaluation) => evaluation.citations.supportConfirmed === false).length,
      supportUnconfirmed: supported.filter((evaluation) => evaluation.citations.supportConfirmed === null).length,
    });
  }

  let organicRank;
  const ranked = ok.filter((evaluation) => evaluation.organic && evaluation.organic.captured > 0);
  if (provider && provider.organic === false) {
    organicRank = { score: null, status: 'not-applicable', note: 'surface has no organic results', perQuery: [] };
  } else if (ranked.length === 0) {
    organicRank = { score: null, status: 'missing', note: 'no organic results captured', perQuery: [] };
  } else {
    const total = ranked.reduce((sum, evaluation) => sum + evaluation.organic.score, 0);
    organicRank = {
      score: Math.round(total / ranked.length),
      status: 'measured',
      queriesRanked: ranked.length,
      perQuery: ranked.map((evaluation) => ({
        queryId: evaluation.queryId,
        repeat: evaluation.repeat,
        siteRank: evaluation.organic.siteRank,
        ownedPosition: evaluation.organic.ownedPosition,
        namesakePosition: evaluation.organic.namesakePosition,
        captured: evaluation.organic.captured,
        score: evaluation.organic.score,
      })),
    };
  }

  const statusCount = (status) => evaluations.filter((evaluation) => evaluation.status === status).length;
  return {
    metrics: { visibility, entitySeparation, factAccuracy, completeness, citationSupport, organicRank },
    classifications: Object.fromEntries(
      ['target-only', 'other-only', 'both-separated', 'conflated', 'uncertain'].map((name) => [
        name,
        classified.filter((evaluation) => evaluation.classification === name).length,
      ]),
    ),
    missingness: {
      attempted: evaluations.length,
      ok: ok.length,
      absent: statusCount('absent'),
      error: statusCount('error'),
      skipped: statusCount('skipped'),
      noAnswerText: ok.length - classified.length,
      pendingReview: pendingCount,
      reviewedUndecidable: classified.filter((evaluation) => !evaluation.pendingReview && evaluation.classification === 'uncertain').length,
    },
    critical: {
      confirmedConflations: decided.filter((evaluation) => evaluation.classification === 'conflated').map((evaluation) => evaluation.answerId),
      suspectedConflations: pending.filter((evaluation) => evaluation.classification === 'conflated').map((evaluation) => evaluation.answerId),
    },
  };
}

/** Builds the review queue: classification calls and citation support checks. */
export function reviewQueue(evaluations) {
  const items = [];
  for (const evaluation of evaluations) {
    if (evaluation.pendingReview) {
      items.push({
        answerId: evaluation.answerId,
        kind: 'classification',
        autoClassification: evaluation.autoClassification,
        reasons: evaluation.reasons,
        flaggedSentences: evaluation.flaggedSentences,
      });
    }
    if (!evaluation.pendingReview && evaluation.facts?.negatedUnlabeled.length) {
      items.push({
        answerId: evaluation.answerId,
        kind: 'fact-polarity',
        factIds: evaluation.facts.negatedUnlabeled,
        note: 'the answer negates these target facts; label each correct, incorrect, or absent',
      });
    }
    if (!evaluation.pendingReview && ABOUT_TARGET.has(evaluation.classification) && evaluation.citations.supportConfirmed === null
      && (evaluation.citations.targetOwned.length > 0 || evaluation.citations.corroborating.length > 0)) {
      items.push({
        answerId: evaluation.answerId,
        kind: 'citation-support',
        citedUrls: [...evaluation.citations.targetOwned, ...evaluation.citations.corroborating],
      });
    }
  }
  return items;
}

/**
 * Scores a whole run. Results are grouped by provider and surface so API
 * proxies, SERP captures and manual UI checks never merge.
 */
export function scoreRun({ answers, definitions, reviews = [] }) {
  const { queries, facts, rubric, config } = definitions;
  const signals = compileSignals(activeFacts(facts), rubric);
  const namesakeUrls = new Set(activeFacts(facts).filter((fact) => fact.subject === 'namesake').flatMap((fact) => fact.sources.map((source) => source.url)));
  const reviewsById = new Map(reviews.map((review) => [review.answerId, review]));
  const evaluations = answers.map((answer) =>
    evaluateAnswer(answer, { queries, facts, rubric, signals, namesakeUrls, review: reviewsById.get(answerId(answer)) }));

  const groups = new Map();
  for (const evaluation of evaluations) {
    const key = groupKey(evaluation);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(evaluation);
  }

  return {
    rubricVersion: rubric.version,
    factsVersion: facts.version,
    factsStatus: facts.status,
    queriesVersion: queries.version,
    groups: [...groups.values()].map((members) => {
      const { provider, surface, label } = members[0];
      const providerConfig = config.providers.find((entry) => entry.id === provider);
      return {
        provider,
        surface,
        label,
        compatibilityKey: compatibilityKey(definitions, surface, members),
        ...scoreGroup(members, providerConfig),
      };
    }),
    evaluations,
    review: reviewQueue(evaluations),
  };
}

