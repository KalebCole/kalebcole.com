import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { classifyAnswer, compileSignals, extractTargetFacts } from '../../evals/seo-aeo/lib/classify.mjs';
import { activeFacts, loadDefinitions } from '../../evals/seo-aeo/lib/load.mjs';
import { fixtures } from '../support/root.mjs';

const { facts, rubric } = loadDefinitions();
const signals = compileSignals(activeFacts(facts), rubric);
const fixtureText = (name, queryId = '*') => {
  const { responses } = JSON.parse(readFileSync(join(fixtures, 'seo-aeo', `${name}.json`), 'utf8'));
  return (responses[queryId] ?? responses['*']).text;
};
const classify = (text) => classifyAnswer(text, signals).classification;

test('an answer about the engineer only is target-only', () => {
  assert.equal(classify(fixtureText('target')), 'target-only');
});

test('a correct namesake-only answer is other-only, a visibility miss rather than a false claim', () => {
  assert.equal(classify(fixtureText('namesake')), 'other-only');
});

test('both people with a separation cue are both-separated', () => {
  assert.equal(classify(fixtureText('mixed')), 'both-separated');
});

test('negating the namesake is separation, not conflation', () => {
  const result = classifyAnswer(fixtureText('negated'), signals);
  assert.equal(result.classification, 'both-separated');
  assert.deepEqual(result.conflatedNamesakeFactIds, []);
});

test('namesake facts attached to the engineer in one sentence are conflated', () => {
  const result = classifyAnswer(fixtureText('conflated'), signals);
  assert.equal(result.classification, 'conflated');
  assert.ok(result.conflatedNamesakeFactIds.includes('namesake-sentence'));
});

test('too little signal, or both people with no cue, is uncertain rather than a guess', () => {
  assert.equal(classify(fixtureText('ambiguous', 'name')), 'uncertain');
  assert.equal(classify(fixtureText('ambiguous', 'who-is')), 'uncertain');
});

test('Seattle alone does not identify the engineer, since the namesake case was also in Washington', () => {
  assert.equal(classify('Kaleb Cole was tried in Seattle.'), 'uncertain');
});

test('a negation in a later clause does not cancel an earlier namesake claim', () => {
  const result = classifyAnswer('Kaleb Cole is a Microsoft software engineer who was sentenced to seven years in prison and was not granted bail.', signals);
  assert.equal(result.classification, 'conflated');
  assert.ok(result.conflatedNamesakeFactIds.includes('namesake-sentence'));
});

test('a negated target claim earns no credit and is flagged', () => {
  const facts = extractTargetFacts('Kaleb Cole is not a software engineer. He works at Microsoft.', signals);
  assert.deepEqual(facts.negated, ['target-role']);
  assert.equal(facts.present.includes('target-role'), false);
  assert.ok(facts.present.includes('target-employer'));
  const result = classifyAnswer('Kaleb Cole is not a software engineer. He works at Microsoft.', signals);
  assert.ok(result.reasons.some((reason) => reason.includes('negates a target claim')));
});

test('the fact sheet wording itself is credited, and only an asserted sole-creator claim contradicts it', () => {
  const series = facts.facts.find((fact) => fact.id === 'target-series-role');
  const fromClaim = extractTargetFacts(series.claim, signals);
  assert.ok(fromClaim.present.includes('target-series-role'));
  assert.deepEqual(fromClaim.contradicted, []);
  const asserted = extractTargetFacts('He is the sole creator of Build Your Personal Brand with Copilot.', signals);
  assert.deepEqual(asserted.contradicted, ['target-series-role']);
});

test('auxiliary negations such as does not deny a target fact', () => {
  for (const text of ['Kaleb Cole is a software engineer. He does not work at Microsoft.', 'Kaleb Cole is a software engineer. He doesn’t work at Microsoft.']) {
    const facts = extractTargetFacts(text, signals);
    assert.deepEqual(facts.negated, ['target-employer'], text);
    assert.equal(facts.present.includes('target-employer'), false, text);
  }
});

test('a fact both asserted and denied gets no automatic credit', () => {
  const facts = extractTargetFacts('Kaleb Cole is a software engineer at Microsoft. He does not work at Microsoft.', signals);
  assert.deepEqual(facts.negated, ['target-employer']);
  assert.equal(facts.present.includes('target-employer'), false);
});

test('a sole-creator claim about another project does not contradict the series fact', () => {
  const facts = extractTargetFacts('Kaleb Cole is a software engineer at Microsoft. He is the sole creator of a small game.', signals);
  assert.deepEqual(facts.contradicted, []);
});

test('sentence boundaries survive into fact extraction', () => {
  const result = classifyAnswer('Kaleb Cole is not the Atomwaffen leader\nHe is a software engineer at Microsoft', signals);
  assert.equal(result.classification, 'both-separated');
  const facts = extractTargetFacts(result.targetText, signals);
  assert.ok(facts.present.includes('target-role'));
  assert.ok(facts.present.includes('target-employer'));
});
