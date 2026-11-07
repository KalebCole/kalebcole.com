import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { DECISION1_QUESTIONS_SHA256 } from '../../evals/seo-aeo/lib/decision1-strict.mjs';
import { scoreExtraction } from '../../evals/seo-aeo/lib/strict-visibility.mjs';
import {
  DECISION1_V2_QUESTIONS_SHA256,
  decodeDecision1V2Response,
  loadDecision1V2Questions,
  scoreStrictVisibilityV2,
} from '../../evals/seo-aeo/lib/strict-visibility-v2.mjs';
import { root } from '../support/root.mjs';

function record(overrides) {
  return {
    id: 'synthetic',
    rubricVersion: 'strict-visibility-win-v2',
    coverage: 'answer-present',
    queryId: 'name',
    surface: 'synthetic',
    tool: 'synthetic',
    model: 'none',
    targetPrimary: 'true',
    criminalNamesakeMention: 'false',
    identityClass: 'target-only',
    harmfulAttribution: 'false',
    factAccuracy: 'unknown',
    citationSupport: 'unknown',
    positionDiagnostic: 'target-leads',
    abstained: false,
    ...overrides,
  };
}

function choice(value) {
  return { type: 'choice', choice: value, confidence: 0.5, probabilities: { [value]: 0.5 } };
}

test('the v2 question file is frozen and the v1 question file is unchanged', () => {
  const questions = readFileSync(join(root, 'evals/seo-aeo/questions/questions.strict-visibility-decision1.v2.json'));
  assert.equal(createHash('sha256').update(questions).digest('hex'), DECISION1_V2_QUESTIONS_SHA256);
  assert.equal(questions.includes(Buffer.from('\u2014')), false);
  const text = questions.toString('utf8').toLowerCase();
  for (const word of ['gold', 'expected', 'omit', 'baseline']) assert.equal(text.includes(word), false, word);
  const v1 = readFileSync(join(root, 'evals/seo-aeo/questions/questions.strict-visibility-decision1.v1.json'));
  assert.equal(createHash('sha256').update(v1).digest('hex'), DECISION1_QUESTIONS_SHA256);
  const loaded = loadDecision1V2Questions();
  assert.match(loaded.document.questions.identityClass.criteria['other-only'], /That person is mentioned/);
  assert.match(loaded.document.questions.identityClass.criteria['other-only'], /not this class/);
});

test('an engineer-only answer can win while fact accuracy stays unknown', () => {
  const scored = scoreStrictVisibilityV2(record({}));
  assert.equal(scored.outcome, 'win');
  assert.equal(scored.win, true);
  assert.equal(scored.factAccuracy, 'unknown');
  assert.equal(scored.needsReview, true);
});

test('a crime-only namesake answer is a loss when the mention agrees', () => {
  const scored = scoreStrictVisibilityV2(record({
    targetPrimary: 'false',
    criminalNamesakeMention: 'true',
    identityClass: 'other-only',
    harmfulAttribution: 'false',
    citationSupport: 'not-applicable',
    positionDiagnostic: 'target-absent',
  }));
  assert.equal(scored.outcome, 'loss');
  assert.equal(scored.win, false);
  assert.equal(scored.harmfulAttribution, 'false');
});

test('other-only with a false namesake flag is a contradiction and v1 still scores the old way', () => {
  const fields = {
    targetPrimary: 'false',
    criminalNamesakeMention: 'false',
    identityClass: 'other-only',
    citationSupport: 'not-applicable',
    positionDiagnostic: 'target-absent',
  };
  const v2 = scoreStrictVisibilityV2(record(fields));
  assert.equal(v2.outcome, 'invalid');
  assert.equal(v2.win, false);
  assert.equal(v2.inFullDenominator, false);
  assert.equal(v2.criminalNamesakeMention, 'false');
  assert.match(v2.problems.join('\n'), /namesake is present/);
  const v1 = scoreExtraction(record({ ...fields, rubricVersion: 'strict-visibility-win-v1' }));
  assert.equal(v1.outcome, 'loss');
  assert.equal(v1.criminalNamesakeMention, 'false');
});

test('a namesake class with an unknown mention is not turned into a win or a false', () => {
  const scored = scoreStrictVisibilityV2(record({
    targetPrimary: 'false',
    criminalNamesakeMention: 'unknown',
    identityClass: 'both-separated',
    harmfulAttribution: 'false',
  }));
  assert.equal(scored.outcome, 'invalid');
  assert.equal(scored.criminalNamesakeMention, 'unknown');
  assert.equal(scored.win, false);
});

test('first in a list is not a win, and an unrelated athlete is not other-only', () => {
  const listed = scoreStrictVisibilityV2(record({
    targetPrimary: 'false',
    criminalNamesakeMention: 'false',
    identityClass: 'uncertain',
    positionDiagnostic: 'target-leads',
  }));
  assert.equal(listed.outcome, 'loss');
  assert.equal(listed.win, false);
  const athlete = scoreStrictVisibilityV2(record({
    targetPrimary: 'false',
    criminalNamesakeMention: 'false',
    identityClass: 'uncertain',
    citationSupport: 'not-applicable',
    positionDiagnostic: 'target-absent',
  }));
  assert.equal(athlete.outcome, 'loss');
  assert.equal(athlete.problems.length, 0);
  const engineerAndAthlete = scoreStrictVisibilityV2(record({
    identityClass: 'target-only',
    criminalNamesakeMention: 'false',
  }));
  assert.equal(engineerAndAthlete.outcome, 'win');
});

test('a disclaimer is a visibility loss and is not harmful by itself', () => {
  const scored = scoreStrictVisibilityV2(record({
    targetPrimary: 'true',
    criminalNamesakeMention: 'true',
    identityClass: 'both-separated',
    harmfulAttribution: 'false',
    positionDiagnostic: 'target-leads',
  }));
  assert.equal(scored.outcome, 'loss');
  assert.equal(scored.win, false);
  assert.equal(scored.harmfulAttribution, 'false');
});

test('an explicit win pair that also abstains is not a win and is not a settled abstention', () => {
  const fields = {
    targetPrimary: 'true',
    criminalNamesakeMention: 'false',
    identityClass: 'target-only',
    abstained: true,
    factAccuracy: 'unknown',
  };
  const v2 = scoreStrictVisibilityV2(record(fields));
  assert.equal(v2.outcome, 'invalid');
  assert.equal(v2.win, false);
  assert.notEqual(v2.outcome, 'abstain');
  assert.match(v2.problems.join('\n'), /explicit win pair/);
  const v1 = scoreExtraction(record({ ...fields, rubricVersion: 'strict-visibility-win-v1' }));
  assert.equal(v1.outcome, 'abstain');
  assert.equal(v1.win, false);
});

test('a known loss still beats abstention, and an uncommitted pair stays unknown', () => {
  const loss = scoreStrictVisibilityV2(record({
    targetPrimary: 'false',
    criminalNamesakeMention: 'true',
    identityClass: 'other-only',
    abstained: true,
    citationSupport: 'not-applicable',
  }));
  assert.equal(loss.outcome, 'loss');
  const unresolved = scoreStrictVisibilityV2(record({
    targetPrimary: 'unknown',
    criminalNamesakeMention: 'false',
    identityClass: 'uncertain',
    abstained: true,
  }));
  assert.equal(unresolved.outcome, 'unknown');
  assert.equal(unresolved.win, false);
});

test('no answer is coverage missing, and a missing fact label is not false', () => {
  const absent = scoreStrictVisibilityV2({
    id: 'absent',
    rubricVersion: 'strict-visibility-win-v2',
    coverage: 'no-answer',
    queryId: 'name',
    surface: 'synthetic',
    tool: 'synthetic',
  });
  assert.equal(absent.outcome, 'coverage-missing');
  assert.equal(absent.win, false);
  const aio = scoreStrictVisibilityV2(record({ coverage: 'aio-absent' }));
  assert.equal(aio.outcome, 'coverage-missing');
  const missingFact = { ...record({}) };
  delete missingFact.factAccuracy;
  const invalid = scoreStrictVisibilityV2(missingFact);
  assert.equal(invalid.outcome, 'invalid');
  assert.equal(invalid.win, false);
});

test('v1 and v2 refuse each other\'s rubric version', () => {
  assert.equal(scoreExtraction(record({})).outcome, 'version-mismatch');
  assert.equal(scoreStrictVisibilityV2(record({ rubricVersion: 'strict-visibility-win-v1' })).outcome, 'version-mismatch');
});

test('the v2 decoder keeps unknown facts and does not score abstained unknown as false', () => {
  const answers = {
    coverage: choice('answer-present'),
    targetPrimary: choice('true'),
    criminalNamesakeMention: choice('false'),
    identityClass: choice('target-only'),
    harmfulAttribution: choice('false'),
    citationSupport: choice('unknown'),
    positionDiagnostic: choice('target-leads'),
    abstained: choice('false'),
  };
  const decoded = decodeDecision1V2Response({ answers, usage: { input_tokens: 1, output_tokens: 1 } });
  assert.equal(decoded.status, 'ok');
  assert.equal(decoded.extraction.factAccuracy, 'unknown');
  assert.equal(decoded.factAccuracySource, 'no-approved-fact-evidence');
  assert.equal(decoded.extraction.abstained, false);
  assert.equal(scoreStrictVisibilityV2({
    ...decoded.extraction,
    id: 'decoded',
    queryId: 'name',
    surface: 'synthetic',
    tool: 'synthetic',
  }).outcome, 'win');
  const declined = decodeDecision1V2Response({
    answers: { ...answers, abstained: choice('unknown') },
    usage: { input_tokens: 1, output_tokens: 1 },
  });
  assert.equal(declined.status, 'error');
  assert.equal(declined.extraction, null);
  assert.match(declined.problems.join('\n'), /not false/);
});

test('score-strict-v2 does not call a provider', () => {
  const output = execFileSync(process.execPath, ['evals/seo-aeo/run.mjs', 'score-strict-v2', 'tests/fixtures/seo-aeo/strict-visibility-cases.json'], {
    cwd: root,
    encoding: 'utf8',
  });
  const parsed = JSON.parse(output);
  assert.ok(parsed.every((row) => row.outcome === 'version-mismatch'));
  assert.equal(output.includes('win": true'), false);
});
