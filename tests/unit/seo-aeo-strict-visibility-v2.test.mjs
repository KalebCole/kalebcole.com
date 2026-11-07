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
  accountProspectiveV2,
  decodeDecision1V2Response,
  loadDecision1V2Questions,
  prospectiveV2Slots,
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

test('a win pair with omitted abstained is not a v2 win, and v1 still scores that omission as a win', () => {
  const fields = {
    targetPrimary: 'true',
    criminalNamesakeMention: 'false',
    identityClass: 'target-only',
    factAccuracy: 'unknown',
  };
  const omitted = { ...record(fields) };
  delete omitted.abstained;
  const v2 = scoreStrictVisibilityV2(omitted);
  assert.equal(v2.outcome, 'invalid');
  assert.equal(v2.win, false);
  assert.match(v2.problems.join('\n'), /explicit boolean/);
  const v1 = scoreExtraction({ ...omitted, rubricVersion: 'strict-visibility-win-v1' });
  assert.equal(v1.outcome, 'win');
  const nulled = scoreStrictVisibilityV2(record({ ...fields, abstained: null }));
  assert.equal(nulled.outcome, 'invalid');
  assert.equal(nulled.win, false);
});

test('prospective accounting keeps invalid, unknown, abstention, and missing in the total', () => {
  const slots = prospectiveV2Slots();
  assert.equal(slots.length, 8);
  const queries = readFileSync(join(root, 'evals/seo-aeo/queries.json'), 'utf8');
  const approved = JSON.parse(queries).queries.map((query) => ({ id: query.id, prompt: query.prompt }));
  assert.deepEqual(slots.map((slot) => slot.prompt).filter((prompt, index, all) => all.indexOf(prompt) === index), approved.map((query) => query.prompt));
  const base = {
    rubricVersion: 'strict-visibility-win-v2',
    coverage: 'answer-present',
    surface: 'synthetic',
    tool: 'synthetic',
    model: 'none',
    harmfulAttribution: 'false',
    factAccuracy: 'unknown',
    citationSupport: 'unknown',
    positionDiagnostic: 'target-leads',
  };
  const extractions = new Map([
    [slots[0].id, { ...base, id: slots[0].id, queryId: slots[0].queryId, targetPrimary: 'true', criminalNamesakeMention: 'false', identityClass: 'target-only', abstained: false }],
    [slots[1].id, { ...base, id: slots[1].id, queryId: slots[1].queryId, targetPrimary: 'false', criminalNamesakeMention: 'true', identityClass: 'other-only', citationSupport: 'not-applicable', abstained: false }],
    [slots[2].id, { ...base, id: slots[2].id, queryId: slots[2].queryId, targetPrimary: 'unknown', criminalNamesakeMention: 'false', identityClass: 'uncertain', abstained: true }],
    [slots[3].id, { ...base, id: slots[3].id, queryId: slots[3].queryId, targetPrimary: 'unknown', criminalNamesakeMention: 'unknown', identityClass: 'unknown', abstained: false }],
    [slots[4].id, { ...base, id: slots[4].id, queryId: slots[4].queryId, targetPrimary: 'false', criminalNamesakeMention: 'false', identityClass: 'other-only', abstained: false }],
    [slots[5].id, { ...base, id: slots[5].id, queryId: slots[5].queryId, coverage: 'no-answer' }],
    [slots[6].id, { ...base, id: slots[6].id, queryId: slots[6].queryId, rubricVersion: 'strict-visibility-win-v1', targetPrimary: 'true', criminalNamesakeMention: 'false', identityClass: 'target-only', abstained: false }],
  ]);
  const report = accountProspectiveV2(extractions);
  assert.equal(report.candidate, 'strict-visibility-win-v2');
  assert.equal(report.questionsSha256, DECISION1_V2_QUESTIONS_SHA256);
  assert.equal(report.calls, 0);
  assert.equal(report.planned, 8);
  assert.equal(report.accounted, 8);
  assert.equal(report.outcomes.win, 1);
  assert.equal(report.outcomes.loss, 1);
  assert.equal(report.outcomes.unknown, 2);
  assert.equal(report.abstentions, 1);
  assert.equal(report.outcomes.invalid, 1);
  assert.equal(report.outcomes.coverageMissing, 1);
  assert.equal(report.outcomes.versionMismatch, 1);
  assert.equal(report.outcomes.missing, 1);
  assert.equal(report.fullPipeline.wins, 1);
  assert.equal(report.fullPipeline.denominator, 8);
  assert.equal(report.decisiveConditional.denominator, 2);
  assert.equal(report.decisiveConditional.coverageDenominator, 8);
  assert.equal(report.byEngineSession['google/signed-out'].planned, 4);
  assert.equal(report.byEngineSession['gemini/signed-out'].planned, 4);
  const dropped = report.outcomes.win / (report.outcomes.win + report.outcomes.loss);
  assert.ok(dropped > report.fullPipeline.wins / report.fullPipeline.denominator);
  assert.match(report.invalidMeans, /not a correct judgment/);
  assert.throws(() => accountProspectiveV2(new Map([['extra', { id: 'extra' }]])), /not a planned slot/);
});

test('the prospective plan cites the frozen question, scorer, rubric, and query hashes', () => {
  const plan = readFileSync(join(root, 'evals/seo-aeo/plans/prospective-strict-visibility-v2.md'));
  const text = plan.toString('utf8');
  const sha = (path) => createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
  assert.equal(text.includes('\u2014'), false);
  assert.match(text, new RegExp(DECISION1_V2_QUESTIONS_SHA256));
  assert.match(text, new RegExp(sha('evals/seo-aeo/lib/strict-visibility-v2.mjs')));
  assert.match(text, new RegExp(sha('evals/seo-aeo/rubric.strict-visibility-win-v2.json')));
  assert.match(text, /6e6bab2e14984615911dd193edef08f4f830ae827a8c3556d9d3f5dd5351fc81/);
  for (const prompt of ['kaleb cole', 'who is kaleb cole', 'kaleb cole microsoft', 'kaleb cole seattle software engineer']) {
    assert.equal(text.includes(prompt), true, prompt);
  }
});

test('the pinned prospective preflight sends nothing and accounts every slot', () => {
  const output = execFileSync(process.execPath, ['evals/seo-aeo/run.mjs', 'prospective-v2'], {
    cwd: root,
    encoding: 'utf8',
  });
  const report = JSON.parse(output);
  assert.equal(report.calls, 0);
  assert.equal(report.planned, 8);
  assert.equal(report.accounted, 8);
  assert.equal(report.outcomes.missing, 8);
  assert.equal(report.fullPipeline.denominator, 8);
  assert.equal(report.questionsSha256, DECISION1_V2_QUESTIONS_SHA256);
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
