import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { classifyAnswer, compileSignals } from '../../evals/seo-aeo/lib/classify.mjs';
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
