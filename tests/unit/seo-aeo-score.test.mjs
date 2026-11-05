import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { loadDefinitions } from '../../evals/seo-aeo/lib/load.mjs';
import { normalizeRank, scoreRun } from '../../evals/seo-aeo/lib/score.mjs';
import { fixtures } from '../support/root.mjs';

const definitions = loadDefinitions();
const queryIds = definitions.queries.queries.map((query) => query.id);

function answersFrom(name, { provider = 'fixture', surface = 'fixture', label = 'fixture' } = {}) {
  const { responses } = JSON.parse(readFileSync(join(fixtures, 'seo-aeo', `${name}.json`), 'utf8'));
  return queryIds.map((queryId) => {
    const response = responses[queryId] ?? responses['*'];
    const capture = response.then ?? response;
    return { provider, surface, label, queryId, repeat: 1, status: capture.status ?? 'ok', text: capture.text, citations: capture.citations, organic: capture.organic, capturedAt: '2026-11-05T22:00:00Z' };
  });
}

const groupOf = (answers, reviews) => scoreRun({ answers, definitions, reviews }).groups[0];

test('target answers score full visibility, separation, completeness and citation support', () => {
  const { metrics } = groupOf(answersFrom('target'));
  assert.equal(metrics.visibility.score, 100);
  assert.equal(metrics.entitySeparation.score, 100);
  assert.equal(metrics.completeness.score, 100);
  assert.equal(metrics.factAccuracy.score, 100);
  assert.equal(metrics.citationSupport.score, 100);
  assert.equal(metrics.citationSupport.supportUnconfirmed, 4);
});

test('namesake-only answers are visibility misses, with fact accuracy not applicable rather than zero', () => {
  const { metrics, classifications } = groupOf(answersFrom('namesake'));
  assert.equal(classifications['other-only'], 4);
  assert.deepEqual([metrics.visibility.score, metrics.visibility.numerator, metrics.visibility.denominator], [0, 0, 4]);
  assert.equal(metrics.entitySeparation.score, 100);
  assert.equal(metrics.completeness.score, 0);
  assert.equal(metrics.factAccuracy.score, null);
  assert.equal(metrics.factAccuracy.status, 'not-applicable');
  assert.equal(metrics.citationSupport.status, 'not-applicable');
});

test('mixed and negated answers count as visible and separated', () => {
  for (const name of ['mixed', 'negated']) {
    const { metrics } = groupOf(answersFrom(name));
    assert.equal(metrics.visibility.score, 100, name);
    assert.equal(metrics.entitySeparation.score, 100, name);
  }
});

test('suspected conflations wait for review and then count as critical failures', () => {
  const answers = answersFrom('conflated');
  const pending = scoreRun({ answers, definitions });
  const [group] = pending.groups;
  assert.equal(group.metrics.visibility.status, 'missing');
  assert.equal(group.metrics.visibility.pendingReview, 4);
  assert.equal(group.critical.suspectedConflations.length, 4);
  assert.equal(pending.review.filter((item) => item.kind === 'classification').length, 4);

  const reviews = pending.evaluations.map((evaluation) => ({ answerId: evaluation.answerId, reviewer: 'kaleb', reviewedAt: '2026-11-06', classification: 'conflated' }));
  const confirmed = groupOf(answers, reviews);
  assert.equal(confirmed.metrics.entitySeparation.score, 0);
  assert.equal(confirmed.critical.confirmedConflations.length, 4);
  assert.ok(confirmed.metrics.factAccuracy.incorrect > 0);
  assert.ok(confirmed.metrics.factAccuracy.score < 100);
});

test('uncertain answers are flagged for review, not scored', () => {
  const result = scoreRun({ answers: answersFrom('ambiguous'), definitions });
  const [group] = result.groups;
  assert.equal(group.missingness.pendingReview, 4);
  assert.equal(group.metrics.visibility.score, null);
  assert.ok(result.review.every((item) => item.autoClassification === 'uncertain'));
});

test('a reviewer decision overrides the automatic call', () => {
  const answers = answersFrom('ambiguous').slice(0, 1);
  const [evaluation] = scoreRun({ answers, definitions }).evaluations;
  const group = groupOf(answers, [{ answerId: evaluation.answerId, reviewer: 'kaleb', reviewedAt: '2026-11-06', classification: 'other-only' }]);
  assert.deepEqual([group.metrics.visibility.numerator, group.metrics.visibility.denominator], [0, 1]);
  assert.equal(group.missingness.pendingReview, 0);
});

test('an absent AI Overview is missing, never zero', () => {
  const { metrics, missingness } = groupOf(answersFrom('absent-aio', { provider: 'google-ai-overview', surface: 'google-ai-overview', label: 'serp-capture' }));
  assert.equal(missingness.absent, 4);
  for (const name of ['visibility', 'entitySeparation', 'completeness']) {
    assert.equal(metrics[name].score, null, name);
    assert.equal(metrics[name].status, 'missing', name);
  }
  assert.equal(metrics.organicRank.status, 'not-applicable');
});

test('organic rank keeps raw ranks and normalizes linearly', () => {
  assert.equal(normalizeRank(1, 10), 100);
  assert.equal(normalizeRank(3, 10), 80);
  assert.equal(normalizeRank(10, 10), 10);
  assert.equal(normalizeRank(null, 10), 0);
  const { metrics } = groupOf(answersFrom('organic', { provider: 'google-organic', surface: 'google-organic', label: 'serp-capture' }));
  const byQuery = Object.fromEntries(metrics.organicRank.perQuery.map((row) => [row.queryId, row]));
  assert.equal(byQuery.name.siteRank, 3);
  assert.equal(byQuery.name.namesakePosition, 1);
  assert.equal(byQuery.name.ownedPosition, 3);
  assert.equal(byQuery['who-is'].score, 100);
  assert.equal(byQuery['name-microsoft'].siteRank, '>10');
  assert.equal(byQuery['name-microsoft'].ownedPosition, 4);
  assert.equal(byQuery['name-microsoft'].score, 0);
  assert.equal(byQuery['name-seattle-swe'].score, 80);
  assert.equal(metrics.organicRank.score, Math.round((80 + 100 + 0 + 80) / 4));
  assert.equal(metrics.visibility.status, 'missing');
  assert.equal(metrics.citationSupport.status, 'not-applicable');
});

test('a contradicted target fact lowers accuracy', () => {
  const answers = [{ provider: 'fixture', surface: 'fixture', label: 'fixture', queryId: 'who-is', repeat: 1, status: 'ok', capturedAt: '2026-11-05T22:00:00Z',
    text: 'Kaleb Cole is a software engineer at Microsoft and the sole creator of Build Your Personal Brand with Copilot.' }];
  const { metrics } = groupOf(answers);
  assert.equal(metrics.factAccuracy.incorrect, 1);
  assert.equal(metrics.factAccuracy.score, 67);
});

test('surfaces never merge: each provider and surface is its own group', () => {
  const answers = [...answersFrom('target'), ...answersFrom('namesake', { provider: 'manual-ui', surface: 'chatgpt-ui', label: 'manual-ui' })];
  const { groups } = scoreRun({ answers, definitions });
  assert.deepEqual(groups.map((group) => [group.surface, group.metrics.visibility.score]), [['fixture', 100], ['chatgpt-ui', 0]]);
  assert.notEqual(groups[0].compatibilityKey, groups[1].compatibilityKey);
});
