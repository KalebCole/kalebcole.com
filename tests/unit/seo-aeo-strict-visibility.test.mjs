import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { loadDefinitions, loadSchema } from '../../evals/seo-aeo/lib/load.mjs';
import { renderReport } from '../../evals/seo-aeo/lib/report.mjs';
import { validate } from '../../evals/seo-aeo/lib/schema.mjs';
import { scoreRun } from '../../evals/seo-aeo/lib/score.mjs';
import {
  BASELINE_QUESTION_IDS,
  FROZEN_EMDASH_EXCEPTION,
  FROZEN_QUESTIONS,
  STRICT_VISIBILITY_VERSION,
  loadStrictRubric,
  readExtractionFile,
  renderStrictVisibilityReport,
  scoreExtraction,
  scoreStrictVisibility,
  separateJudgeRequests,
  verifyFrozenQuestionFiles,
  visibilityOutcome,
} from '../../evals/seo-aeo/lib/strict-visibility.mjs';
import { fixtures, root } from '../support/root.mjs';

const definitions = loadDefinitions();
const rubric = loadStrictRubric();
const fixturePath = join(fixtures, 'seo-aeo', 'strict-visibility-cases.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const scored = scoreStrictVisibility(fixture.records, rubric);
const emDash = String.fromCodePoint(0x2014);

function byCase(name) {
  const found = scored.records.filter((record) => record.case === name);
  assert.equal(found.length, 1, name);
  return found[0];
}

function winRecord(overrides = {}) {
  return {
    id: 'synthetic-unit',
    case: 'unit',
    synthetic: true,
    rubricVersion: STRICT_VISIBILITY_VERSION,
    coverage: 'answer-present',
    queryId: 'name',
    surface: 'synthetic',
    targetPrimary: 'true',
    criminalNamesakeMention: 'false',
    identityClass: 'target-only',
    harmfulAttribution: 'false',
    factAccuracy: 'verified',
    citationSupport: 'true',
    positionDiagnostic: 'target-leads',
    ...overrides,
  };
}

test('the strict rubric is a new version and does not replace rubric 1.0.0', () => {
  assert.equal(rubric.version, STRICT_VISIBILITY_VERSION);
  assert.equal(definitions.rubric.version, '1.0.0');
  assert.equal(definitions.rubric.metrics.visibility.numerator, 'target-only + both-separated');
  assert.equal(rubric.notAJudge, true);
  assert.match(rubric.win, /primarily about the target/);
  assert.match(rubric.win, /zero mention/);
  assert.match(rubric.win, /list of possible people is not a win/);
  assert.match(rubric.win, /not a win/);
  assert.match(rubric.notHarmfulByItself, /not by itself a harmful attribution/);
  assert.match(rubric.notCriminalNamesake, /unrelated athlete/);
  assert.match(rubric.coverage, /absent AI Overview/);
  assert.match(rubric.missingFields, /not coerced to false/);
  assert.match(rubric.denominators, /Unknown fact accuracy/);
  assert.match(rubric.priorPositionResultsAreNotThisRule, /not accuracy for strict-visibility-win-v1/);
  assert.deepEqual(rubric.collection.queries, definitions.queries.queries.map((query) => query.prompt));
});

test('rubric 1.0.0 still counts a separated namesake as visible', () => {
  const { responses } = JSON.parse(readFileSync(join(fixtures, 'seo-aeo', 'mixed.json'), 'utf8'));
  const answers = definitions.queries.queries.map((query) => ({
    provider: 'fixture',
    surface: 'fixture',
    label: 'fixture',
    queryId: query.id,
    repeat: 1,
    status: 'ok',
    text: responses['*'].text,
    citations: responses['*'].citations,
    capturedAt: '2026-11-05T22:00:00Z',
  }));
  const [group] = scoreRun({ answers, definitions }).groups;
  assert.equal(group.metrics.visibility.score, 100);
  assert.equal(byCase('engineer-primary-criminal-disclaimer').outcome, 'loss');
  assert.equal(byCase('engineer-primary-criminal-disclaimer').win, false);
});

test('an engineer-primary answer with no namesake mention is a strict win', () => {
  const result = byCase('engineer-primary-only');
  assert.equal(result.outcome, 'win');
  assert.equal(result.win, true);
  assert.equal(result.inFullDenominator, true);
  assert.equal(result.inDecisiveDenominator, true);
  assert.equal(result.harmfulAttribution, 'false');
  assert.equal(result.identityClass, 'target-only');
});

test('first place in a disambiguation list is not a win, even with a target-leads diagnostic', () => {
  const result = byCase('first-disambiguation-list');
  assert.equal(result.positionDiagnostic, 'target-leads');
  assert.equal(result.targetPrimary, 'false');
  assert.equal(result.criminalNamesakeMention, 'false');
  assert.equal(result.outcome, 'loss');
  assert.equal(result.win, false);
  assert.equal(result.needsReview, true);
});

test('a clear criminal-namesake disclaimer fails visibility and is not conflation', () => {
  const disclaimer = byCase('engineer-primary-criminal-disclaimer');
  const conflated = byCase('conflated-attribution');
  assert.equal(disclaimer.outcome, 'loss');
  assert.equal(disclaimer.identityClass, 'both-separated');
  assert.equal(disclaimer.harmfulAttribution, 'false');
  assert.equal(disclaimer.factAccuracy, 'verified');
  assert.equal(conflated.outcome, 'loss');
  assert.equal(conflated.identityClass, 'conflated');
  assert.equal(conflated.harmfulAttribution, 'true');
  assert.notEqual(disclaimer.harmfulAttribution, conflated.harmfulAttribution);
});

test('an answer about only the other person is a visibility loss and not a harmful attribution', () => {
  const result = byCase('other-person-only');
  assert.equal(result.outcome, 'loss');
  assert.equal(result.identityClass, 'other-only');
  assert.equal(result.harmfulAttribution, 'false');
  assert.equal(result.criminalNamesakeMention, 'true');
});

test('a greeting with no engineer anchors is unknown, not a win and not a loss', () => {
  const result = byCase('greeting-only');
  assert.equal(result.outcome, 'unknown');
  assert.equal(result.win, false);
  assert.equal(result.inFullDenominator, true);
  assert.equal(result.inDecisiveDenominator, false);
  assert.equal(result.needsReview, true);
});

test('unknown namesake mention does not become a silent win, and a known failure is still a loss', () => {
  const unknownNamesake = byCase('namesake-mention-unknown');
  assert.equal(unknownNamesake.targetPrimary, 'true');
  assert.equal(unknownNamesake.criminalNamesakeMention, 'unknown');
  assert.equal(unknownNamesake.outcome, 'unknown');
  assert.equal(unknownNamesake.win, false);

  const notPrimary = byCase('not-primary-namesake-unknown');
  assert.equal(notPrimary.criminalNamesakeMention, 'unknown');
  assert.equal(notPrimary.outcome, 'loss');
  assert.equal(notPrimary.win, false);

  const mentioned = byCase('namesake-mentioned-primary-unknown');
  assert.equal(mentioned.targetPrimary, 'unknown');
  assert.equal(mentioned.criminalNamesakeMention, 'true');
  assert.equal(mentioned.harmfulAttribution, 'unknown');
  assert.equal(mentioned.outcome, 'loss');
  assert.equal(mentioned.identityClass, 'uncertain');
});

test('no answer and an absent AI Overview are coverage gaps, not visibility losses', () => {
  const missing = byCase('no-answer');
  const overview = byCase('aio-absent');
  assert.equal(missing.outcome, 'coverage-missing');
  assert.equal(missing.coverage, 'no-answer');
  assert.equal(missing.inFullDenominator, false);
  assert.equal(overview.outcome, 'coverage-missing');
  assert.equal(overview.coverage, 'aio-absent');
  assert.equal(overview.inFullDenominator, false);

  const labeledAbsent = scoreExtraction(winRecord({
    id: 'synthetic-absent-labeled',
    coverage: 'no-answer',
    targetPrimary: 'false',
    criminalNamesakeMention: 'false',
  }));
  assert.equal(labeledAbsent.outcome, 'coverage-missing');
  assert.notEqual(labeledAbsent.outcome, 'loss');
});

test('a missing namesake field is invalid and cannot default to a win', () => {
  const result = byCase('missing-namesake-field');
  assert.equal(result.outcome, 'invalid');
  assert.equal(result.win, false);
  assert.equal(result.inFullDenominator, false);
  assert.ok(result.problems.some((problem) => problem.includes('criminalNamesakeMention')));
  assert.equal(validate(loadSchema('strict-extraction'), fixture.records.find((record) => record.case === 'missing-namesake-field')).length, 0);

  const omitted = { ...winRecord({ id: 'synthetic-omitted' }) };
  delete omitted.criminalNamesakeMention;
  assert.equal(scoreExtraction(omitted).outcome, 'invalid');
  assert.equal(scoreExtraction(omitted).win, false);

  const booleanFalse = scoreExtraction(winRecord({ id: 'synthetic-boolean-false', criminalNamesakeMention: false }));
  assert.equal(booleanFalse.outcome, 'invalid');
  assert.equal(booleanFalse.win, false);
});

test('a wrong biography does not change a visibility win', () => {
  const result = byCase('wrong-biography');
  assert.equal(result.outcome, 'win');
  assert.equal(result.factAccuracy, 'incorrect');
  assert.equal(result.citationSupport, 'true');
});

test('a missing citation does not block a visibility win', () => {
  const result = byCase('no-citation');
  assert.equal(result.outcome, 'win');
  assert.equal(result.citationSupport, 'false');
});

test('a Seattle locality card followed by an engineer body wins, and the position label does not decide it', () => {
  const card = byCase('seattle-locality-card');
  assert.equal(card.outcome, 'win');
  assert.equal(card.criminalNamesakeMention, 'false');
  assert.equal(card.positionDiagnostic, 'target-leads');
  const source = fixture.records.find((record) => record.case === 'seattle-locality-card');
  const later = scoreExtraction({ ...source, positionDiagnostic: 'target-mentioned-later' });
  assert.equal(later.outcome, 'win');
  assert.equal(later.positionDiagnostic, 'target-mentioned-later');
  assert.equal(visibilityOutcome({ ...source, positionDiagnostic: 'target-absent' }), 'win');
});

test('an unrelated athlete is not the criminal namesake', () => {
  const athlete = byCase('unrelated-athlete-only');
  const withEngineer = byCase('engineer-plus-unrelated-athlete');
  const disclaimer = byCase('engineer-primary-criminal-disclaimer');
  assert.equal(athlete.outcome, 'loss');
  assert.equal(athlete.criminalNamesakeMention, 'false');
  assert.equal(athlete.harmfulAttribution, 'false');
  assert.equal(athlete.identityClass, 'other-only');
  assert.equal(withEngineer.outcome, 'win');
  assert.equal(withEngineer.criminalNamesakeMention, 'false');
  assert.equal(disclaimer.outcome, 'loss');
  assert.equal(disclaimer.criminalNamesakeMention, 'true');
});

test('unknown, abstention, invalid, and version mismatch keep their denominators', () => {
  const abstained = byCase('explicit-abstention');
  assert.equal(abstained.outcome, 'abstain');
  assert.equal(abstained.win, false);
  assert.equal(abstained.inFullDenominator, true);
  assert.equal(abstained.inDecisiveDenominator, false);
  assert.equal(visibilityOutcome(fixture.records.find((record) => record.case === 'explicit-abstention')), 'abstain');

  const mismatch = byCase('position-rubric-version');
  assert.equal(mismatch.outcome, 'version-mismatch');
  assert.equal(mismatch.win, false);
  assert.equal(mismatch.inFullDenominator, false);
  assert.equal(mismatch.positionDiagnostic, 'target-leads');
  assert.equal(mismatch.appliedRubric, null);

  const unknownFact = byCase('unknown-fact-on-win');
  assert.equal(unknownFact.outcome, 'win');
  assert.equal(unknownFact.factAccuracy, 'unknown');

  assert.equal(scored.pooled, false);
  assert.equal(scored.independenceEstimated, false);
  assert.equal('nIndependent' in scored, false);
  assert.equal(scored.priorPositionRubricIsThisRule, false);
  assert.deepEqual(scored.duplicateIds, []);
  assert.equal(scored.groups.length, 1);
  const group = scored.groups[0];
  const visibility = group.visibility;
  assert.equal(visibility.fullDenominator, visibility.wins + visibility.losses + visibility.unknown + visibility.abstentions);
  assert.equal(visibility.decisiveDenominator, visibility.wins + visibility.losses);
  assert.equal(visibility.full.numerator, visibility.wins);
  assert.equal(visibility.full.denominator, visibility.fullDenominator);
  assert.equal(visibility.decisiveOnly.denominator, visibility.decisiveDenominator);
  assert.ok(visibility.unknown > 0);
  assert.equal(visibility.abstentions, 1);
  assert.ok(visibility.fullDenominator > visibility.decisiveDenominator);
  assert.equal(visibility.invalid, 1);
  assert.equal(visibility.versionMismatch, 1);
  assert.equal(group.coverage.noAnswer, 1);
  assert.equal(group.coverage.aioAbsent, 1);
  assert.equal(visibility.full.status, 'measured');
  assert.equal(group.facts.fullDenominator, group.facts.labeledVerified + group.facts.incorrect + group.facts.unknown);
  assert.ok(group.facts.unknown > 0);
  assert.equal(group.facts.labeledVerifiedRate.numerator, group.facts.labeledVerified);
  assert.ok(group.facts.labeledVerifiedRate.denominator > group.facts.labeledVerified);
  assert.equal(group.identity.harmfulTrue, 1);
  assert.ok(group.identity.harmfulFalse > group.identity.harmfulTrue);
  assert.equal(group.identity.conflated, 1);
  assert.ok(group.identity.bothSeparated >= 1);

  const onlyGap = scoreStrictVisibility([fixture.records.find((record) => record.case === 'aio-absent')], rubric);
  assert.equal(onlyGap.groups[0].visibility.full.status, 'missing');
  assert.equal(onlyGap.groups[0].visibility.full.score, null);
  assert.equal(onlyGap.groups[0].coverage.aioAbsent, 1);
});

test('surfaces and model versions are not pooled, and rubric 1.0.0 cannot be scored as the strict win', () => {
  const records = [
    winRecord({ id: 'signed-out-lite', surface: 'public-signed-out', model: 'gemini-flash-lite' }),
    winRecord({ id: 'signed-in-flash', surface: 'signed-in-gemini', model: 'gemini-flash' }),
    winRecord({ id: 'signed-in-google', surface: 'signed-in-google', model: 'google-ai-mode', targetPrimary: 'false' }),
  ];
  const split = scoreStrictVisibility(records, rubric);
  assert.equal(split.groups.length, 3);
  assert.equal(split.pooled, false);
  assert.deepEqual(split.groups.map((group) => `${group.surface}/${group.model}`).sort(), [
    'public-signed-out/gemini-flash-lite',
    'signed-in-gemini/gemini-flash',
    'signed-in-google/google-ai-mode',
  ]);
  assert.throws(() => scoreStrictVisibility(records, definitions.rubric), /refusing to score/);
  assert.equal(scoreExtraction(winRecord({ queryId: 'project-query', rubricVersion: STRICT_VISIBILITY_VERSION })).outcome, 'invalid');
  assert.equal(scoreExtraction(winRecord({ surface: 'grok' })).outcome, 'invalid');
  assert.equal(scoreExtraction(winRecord({ rubricVersion: '1.0.0' })).outcome, 'version-mismatch');
});

test('the identity baseline stays the original eight questions, in its own request', () => {
  const frozen = verifyFrozenQuestionFiles();
  assert.deepEqual(Object.keys(frozen.baseline.questions), BASELINE_QUESTION_IDS);
  assert.deepEqual(Object.keys(frozen.visibilityOnly.questions), ['visibility_of_target']);
  const requests = separateJudgeRequests(frozen.baseline, frozen.visibilityOnly);
  assert.equal(requests.baselineRequest.role, 'identity-baseline');
  assert.equal('visibility_of_target' in requests.baselineRequest.questions, false);
  assert.deepEqual(Object.keys(requests.baselineRequest.questions), BASELINE_QUESTION_IDS);
  assert.equal(requests.visibilityRequest.strictVisibilityWin, false);
  assert.equal(requests.visibilityRequest.version, 'visibility-only-v1');
  assert.notEqual(requests.baselineRequest.questions, requests.visibilityRequest.questions);
  requests.baselineRequest.questions.visibility_of_target = frozen.visibilityOnly.questions.visibility_of_target;
  assert.equal('visibility_of_target' in frozen.baseline.questions, false);

  const merged = structuredClone(frozen.baseline);
  merged.questions.visibility_of_target = frozen.visibilityOnly.questions.visibility_of_target;
  assert.throws(() => separateJudgeRequests(merged, frozen.visibilityOnly), /not part of the identity baseline/);
  assert.throws(() => separateJudgeRequests(frozen.baseline, frozen.baseline), /cannot share/);
});

test('frozen question bytes still match the pinned hashes', () => {
  for (const expected of Object.values(FROZEN_QUESTIONS)) {
    const bytes = readFileSync(join(root, 'evals/seo-aeo/questions', expected.file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256);
  }
  const visibility = readFileSync(join(root, FROZEN_EMDASH_EXCEPTION));
  assert.equal(visibility.includes(emDash), true);
  const stripped = Buffer.from(visibility.toString('utf8').replaceAll(emDash, ','));
  assert.notEqual(createHash('sha256').update(stripped).digest('hex'), FROZEN_QUESTIONS.visibilityOnly.sha256);
});

test('committed strict-visibility fixtures are synthetic and carry no answer dumps', () => {
  assert.equal(fixture.synthetic, true);
  assert.equal(fixture.records.length >= 16, true);
  for (const record of fixture.records) {
    assert.equal(record.synthetic, true, record.id);
    assert.equal(record.note.length < 240, true, record.id);
    assert.doesNotMatch(record.note, /https?:\/\//, record.id);
    for (const key of Object.keys(record)) {
      assert.equal(['text', 'answer', 'screenshot', 'account', 'email', 'token', 'path'].includes(key), false, key);
    }
  }
  const source = readFileSync(join(root, 'evals/seo-aeo/lib/strict-visibility.mjs'), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|\bhttps?\.request\b/);
});

test('the offline score-strict command reports the strict win without a network call', () => {
  const output = execFileSync(process.execPath, ['evals/seo-aeo/run.mjs', 'score-strict', 'tests/fixtures/seo-aeo/strict-visibility-cases.json'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.match(output, /strict-visibility-win-v1/);
  assert.match(output, /not a measurement of a model/);
  assert.match(output, /Groups are not pooled/);
  assert.match(output, /full denominator/);
  assert.match(output, /Decisive only/);
  assert.match(output, /not verified truth/);
  assert.match(output, /Sign-out does not remove: IP, location, session/);
  assert.doesNotMatch(output, /\/workspace|OPENAI_API_KEY|GITHUB_TOKEN|SERPAPI_API_KEY|GEMINI_API_KEY/);
  assert.equal(readExtractionFile(fixturePath).length, fixture.records.length);

  const validated = execFileSync(process.execPath, ['evals/seo-aeo/run.mjs', 'validate'], { cwd: root, encoding: 'utf8' });
  assert.match(validated, /Definitions are valid/);
  assert.match(validated, /Frozen question hashes match/);
});

test('rubric 1.0.0 reports keep their score and say it is not the strict win', () => {
  const scores = scoreRun({
    answers: [{
      provider: 'fixture',
      surface: 'fixture',
      label: 'fixture',
      queryId: 'name',
      repeat: 1,
      status: 'ok',
      text: 'Kaleb Cole is a software engineer at Microsoft in Seattle and writes at kalebcole.com.',
      citations: [{ url: 'https://kalebcole.com/' }],
      capturedAt: '2026-11-06T20:00:00Z',
    }],
    definitions,
  });
  assert.equal(scores.rubricVersion, '1.0.0');
  assert.equal(scores.groups[0].metrics.visibility.score, 100);
  const markdown = renderReport({
    manifest: {
      runId: 'synthetic-disclosure',
      kind: 'fixture',
      startedAt: '2026-11-06T20:00:00Z',
      commit: 'abc',
      versions: { queries: '1.0.0', facts: definitions.facts.version, rubric: '1.0.0', config: definitions.config.version },
      locale: definitions.config.locale,
      provisional: true,
    },
    scores,
  });
  assert.match(markdown, /Visibility \(rubric 1\.0\.0\) \| 100 \|/);
  assert.match(markdown, /not a strict visibility win/);
  assert.match(markdown, /strict-visibility-win-v1/);
  const strict = renderStrictVisibilityReport(scored, rubric);
  assert.match(strict, /not a measurement of a model/);
  assert.throws(() => renderStrictVisibilityReport({ rubricVersion: '1.0.0', groups: [] }), /refusing to render/);
});

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

test('new eval files do not add an em dash outside the frozen visibility question', () => {
  const files = [
    ...walk(join(root, 'evals/seo-aeo')),
    ...walk(join(root, 'tests/fixtures/seo-aeo')),
    ...walk(join(root, 'tests/unit')).filter((path) => path.includes('seo-aeo')),
  ];
  for (const path of files) {
    const relative = path.slice(root.length + 1);
    if (relative === FROZEN_EMDASH_EXCEPTION) continue;
    assert.equal(readFileSync(path, 'utf8').includes(emDash), false, relative);
  }
});
