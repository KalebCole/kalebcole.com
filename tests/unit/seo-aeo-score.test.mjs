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

test('a rejected fact drops out of completeness instead of becoming impossible to meet', () => {
  const rejected = structuredClone(definitions);
  rejected.facts.facts.find((fact) => fact.id === 'target-employer').approval = 'rejected';
  const answers = answersFrom('target');
  const { metrics } = scoreRun({ answers, definitions: rejected }).groups[0];
  assert.equal(metrics.completeness.score, 100);
  assert.equal(metrics.completeness.denominator, 5);
});

test('the compatibility key changes with the queries and repeats a group actually ran', () => {
  const full = answersFrom('target');
  const key = (answers) => scoreRun({ answers, definitions }).groups[0].compatibilityKey;
  const twice = [...full, ...full.map((answer) => ({ ...answer, repeat: 2 }))];
  assert.notEqual(key(full), key(twice));
  assert.notEqual(key(full), key(full.slice(0, 1)));
  assert.equal(key(full), key(answersFrom('namesake')));
});

test('a reviewer-confirmed conflation counts namesake claims from any sentence as incorrect', () => {
  const answers = answersFrom('ambiguous').filter((answer) => answer.queryId === 'who-is');
  const [evaluation] = scoreRun({ answers, definitions }).evaluations;
  const confirm = (extra = {}) => groupOf(answers, [{ answerId: evaluation.answerId, reviewer: 'kaleb', reviewedAt: '2026-11-06', classification: 'conflated', ...extra }]);
  const inferred = confirm();
  assert.ok(inferred.metrics.factAccuracy.incorrect >= 1);
  assert.ok(inferred.metrics.factAccuracy.score < 100);
  const listed = confirm({ attributedNamesakeFactIds: ['namesake-sentence', 'namesake-conviction'] });
  assert.equal(listed.metrics.factAccuracy.incorrect, 2);
});

test('negated target facts go to the review queue', () => {
  const answers = [{ provider: 'fixture', surface: 'fixture', label: 'fixture', queryId: 'name', repeat: 1, status: 'ok', capturedAt: '2026-11-05T22:00:00Z',
    text: 'Kaleb Cole works at Microsoft on Azure support tickets. He is not a software engineer.' }];
  const result = scoreRun({ answers, definitions });
  assert.deepEqual(result.review.find((item) => item.kind === 'fact-polarity')?.factIds, ['target-role']);
});

test('the compatibility key changes with the recorded model', () => {
  const key = (model) => scoreRun({ answers: answersFrom('target').map((answer) => ({ ...answer, model })), definitions }).groups[0].compatibilityKey;
  assert.notEqual(key('model-a'), key('model-b'));
});

test('the compatibility key hashes every query and repeat pair', () => {
  const answer = (queryId, repeat) => ({ provider: 'fixture', surface: 'fixture', label: 'fixture', queryId, repeat, status: 'ok', text: 'Kaleb Cole is a software engineer at Microsoft.', capturedAt: '2026-11-05T22:00:00Z' });
  const key = (answers) => scoreRun({ answers, definitions }).groups[0].compatibilityKey;
  assert.notEqual(key([answer('name', 1), answer('name', 2), answer('who-is', 1)]), key([answer('name', 1), answer('who-is', 1), answer('who-is', 2)]));
});

test('namesake organic positions do not depend on query order', () => {
  const organic = [{ position: 1, url: 'https://news.example/story', title: 'Kaleb Cole, Atomwaffen Division member' }, { position: 2, url: 'https://kalebcole.com/' }];
  const answers = queryIds.map((queryId) => ({ provider: 'google-organic', surface: 'google-organic', label: 'serp-capture', queryId, repeat: 1, status: 'ok', organic, capturedAt: '2026-11-05T22:00:00Z' }));
  const { metrics } = groupOf(answers);
  assert.deepEqual(metrics.organicRank.perQuery.map((row) => row.namesakePosition), [1, 1, 1, 1]);
});

test('a gapped organic capture still scores within 0 to 100', () => {
  const answers = [{ provider: 'google-organic', surface: 'google-organic', label: 'serp-capture', queryId: 'name', repeat: 1, status: 'ok', organic: [{ position: 3, url: 'https://kalebcole.com/' }], capturedAt: '2026-11-05T22:00:00Z' }];
  const [row] = groupOf(answers).metrics.organicRank.perQuery;
  assert.deepEqual([row.siteRank, row.captured, row.score], [3, 3, 33]);
});

test('a confirmed conflation counts namesake claims from every sentence', () => {
  const answers = [{ provider: 'fixture', surface: 'fixture', label: 'fixture', queryId: 'name', repeat: 1, status: 'ok', capturedAt: '2026-11-05T22:00:00Z',
    text: 'Kaleb Cole is a Microsoft software engineer who was sentenced to seven years. He was convicted by a federal jury.' }];
  const [evaluation] = scoreRun({ answers, definitions }).evaluations;
  const group = groupOf(answers, [{ answerId: evaluation.answerId, reviewer: 'kaleb', reviewedAt: '2026-11-06', classification: 'conflated' }]);
  assert.deepEqual(group.metrics.factAccuracy.incorrect, 2);
});

test('rejecting a fact changes the compatibility key', () => {
  const rejected = structuredClone(definitions);
  rejected.facts.facts.find((fact) => fact.id === 'target-employer').approval = 'rejected';
  const answers = answersFrom('target');
  assert.notEqual(scoreRun({ answers, definitions }).groups[0].compatibilityKey, scoreRun({ answers, definitions: rejected }).groups[0].compatibilityKey);
});

test('the compatibility key changes with organic capture depth', () => {
  const capture = (depth) => [{ provider: 'google-organic', surface: 'google-organic', label: 'serp-capture', queryId: 'name', repeat: 1, status: 'ok', capturedAt: '2026-11-05T22:00:00Z',
    organic: Array.from({ length: depth }, (_, index) => ({ position: index + 1, url: index === 2 ? 'https://kalebcole.com/' : `https://example.com/${index}` })) }];
  const key = (depth) => scoreRun({ answers: capture(depth), definitions }).groups[0].compatibilityKey;
  assert.notEqual(key(5), key(10));
});
