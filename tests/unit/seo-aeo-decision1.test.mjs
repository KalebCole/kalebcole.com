import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  DECISION1_CAP_NANO,
  DECISION1_NEW_RESERVE_NANO,
  DECISION1_PRIOR_NANO,
  DECISION1_QUESTIONS_SHA256,
  buildDecision1Request,
  decodeDecision1Response,
  loadDecision1Questions,
  prepareDecision1,
  recordDecision1Http,
  syntheticDecision1Example,
} from '../../evals/seo-aeo/lib/decision1-strict.mjs';
import { BASELINE_QUESTION_IDS, scoreExtraction } from '../../evals/seo-aeo/lib/strict-visibility.mjs';
import { root } from '../support/root.mjs';

const ANSWER = 'Synthetic placeholder. Not a captured consumer answer.';

function capture(overrides = {}) {
  return {
    id: 'synthetic-1',
    surface: 'public-signed-out',
    captureEngine: 'chatgpt',
    captureModel: 'synthetic-capture-model',
    queryId: 'name',
    repeat: 1,
    answerText: ANSWER,
    ...overrides,
  };
}

function answer(choice, criteriaKeys) {
  const probabilities = Object.fromEntries(criteriaKeys.map((key) => [key, key === choice ? 0.7 : 0.1]));
  return { type: 'choice', choice, confidence: 0.7, probabilities };
}

function validBody(overrides = {}) {
  const questions = loadDecision1Questions().document.questions;
  const answers = {};
  for (const [name, question] of Object.entries(questions)) {
    const keys = Object.keys(question.criteria);
    const choice = Object.hasOwn(overrides, name) ? overrides[name] : (name === 'abstained' ? 'false' : keys[0]);
    answers[name] = answer(choice, keys);
  }
  if ('factAccuracy' in overrides) answers.factAccuracy = answer(overrides.factAccuracy, ['verified', 'unknown']);
  return {
    answers,
    usage: { input_tokens: 12, output_tokens: 8 },
  };
}

test('the decision-1 questions are pinned, self-contained, and not the eight identity questions', () => {
  const bundle = loadDecision1Questions();
  assert.equal(bundle.sha256, DECISION1_QUESTIONS_SHA256);
  assert.equal(bundle.document.judgeDeployment, 'decision-1-eval');
  const names = Object.keys(bundle.document.questions);
  for (const id of BASELINE_QUESTION_IDS) assert.equal(names.includes(id), false, id);
  assert.equal(names.includes('factAccuracy'), false);
  const text = bundle.bytes.toString('utf8');
  assert.equal(text.includes('baseline'), false);
  assert.equal(text.includes('omit'), false);
  assert.match(bundle.document.questions.identityClass.criteria['both-separated'], /criminal namesake/);
  assert.match(bundle.document.questions.identityClass.criteria['other-only'], /unrelated person/);
  for (const question of Object.values(bundle.document.questions)) assert.equal(question.type, 'choice');
});

test('state is answer_text only and the synthetic request is not sent', () => {
  const example = syntheticDecision1Example();
  assert.equal(example.called, false);
  assert.equal(example.liveExecutor, false);
  assert.deepEqual(Object.keys(example.request.state), ['answer_text']);
  assert.equal(example.request.model, 'decision-1-eval');
  assert.equal(example.requestSha256, buildDecision1Request({ answerText: example.request.state.answer_text }).sha256);
  assert.throws(() => prepareDecision1({
    dir: join(tmpdir(), 'unused'),
    items: [capture({ query: 'who is kaleb cole' })],
  }), /must not carry query/);
  assert.throws(() => prepareDecision1({
    dir: join(tmpdir(), 'unused-2'),
    items: [capture({ expected: 'target-only' })],
  }), /must not carry expected/);
  assert.throws(() => prepareDecision1({
    dir: join(tmpdir(), 'unused-3'),
    items: [capture({ captureModel: 'model-not-recorded' })],
  }), /not defaulted/);
});

test('a missing choice is an error and does not become false', () => {
  const body = validBody({ targetPrimary: 'true', criminalNamesakeMention: 'false', identityClass: 'target-only' });
  delete body.answers.targetPrimary;
  const decoded = decodeDecision1Response(body);
  assert.equal(decoded.status, 'error');
  assert.equal(decoded.extraction, null);
  assert.match(decoded.problems.join(' '), /targetPrimary/);
  const probsOnly = validBody();
  probsOnly.answers.criminalNamesakeMention = { type: 'choice', choice: 'false', confidence: 0.5, probs: { false: 1 } };
  const rejected = decodeDecision1Response(probsOnly);
  assert.equal(rejected.status, 'error');
  assert.match(rejected.problems.join(' '), /probabilities/);
  const declined = decodeDecision1Response(validBody({ abstained: 'unknown', targetPrimary: 'true', criminalNamesakeMention: 'false' }));
  assert.equal(declined.status, 'error');
  assert.match(declined.problems.join(' '), /not false/);
});

test('facts stay unknown, citations are not verified URLs, and a valid pair can score', () => {
  const decoded = decodeDecision1Response(validBody({
    coverage: 'answer-present',
    targetPrimary: 'true',
    criminalNamesakeMention: 'false',
    identityClass: 'target-only',
    harmfulAttribution: 'false',
    citationSupport: 'unknown',
    positionDiagnostic: 'target-leads',
    abstained: 'false',
    factAccuracy: 'verified',
  }));
  assert.equal(decoded.status, 'ok');
  assert.equal(decoded.factAccuracySource, 'no-approved-fact-evidence');
  assert.equal(decoded.extraction.factAccuracy, 'unknown');
  assert.equal(decoded.citationSupportMeans, 'text-label-not-verified-url');
  assert.equal(decoded.extraction.citationSupport, 'unknown');
  const scored = scoreExtraction({
    id: 'synthetic-decision1',
    synthetic: true,
    surface: 'public-signed-out',
    tool: 'chatgpt',
    queryId: 'name',
    ...decoded.extraction,
  });
  assert.equal(scored.outcome, 'win');
  assert.equal(scored.factAccuracy, 'unknown');
});

test('reserve is written before responses, does not reset, and HTTP bytes are stored without a retry', () => {
  const dir = mkdtempSync(join(tmpdir(), 'decision1-'));
  try {
    const second = capture({
      id: 'synthetic-2',
      captureEngine: 'google',
      queryId: 'who-is',
      answerText: 'Synthetic placeholder two. Not a captured consumer answer.',
    });
    const prepared = prepareDecision1({ dir, items: [capture(), second] });
    assert.equal(prepared.status, 'prepared');
    assert.equal(prepared.reserve.calls, 0);
    assert.equal(prepared.reserve.retries, 0);
    assert.equal(prepared.reserve.tokenBoundChecked, false);
    assert.equal(prepared.reserve.desiredNewReserveNano, DECISION1_NEW_RESERVE_NANO.toString());
    assert.equal(prepared.reserve.priorUsageNano, DECISION1_PRIOR_NANO.toString());
    assert.equal(prepared.manifest.liveExecutor, false);
    assert.equal(prepared.manifest.judgeDeployment, 'decision-1-eval');
    assert.notEqual(prepared.manifest.items[0].captureModel, prepared.manifest.items[0].judgeDeployment);
    assert.notEqual(prepared.manifest.items[0].requestSha256, prepared.manifest.items[1].requestSha256);
    const again = prepareDecision1({ dir, items: [capture(), second] });
    assert.equal(again.status, 'already-prepared');
    assert.equal(again.reserve.committedNano, prepared.reserve.committedNano);
    assert.throws(() => prepareDecision1({
      dir: mkdtempSync(join(tmpdir(), 'decision1-nine-')),
      items: Array.from({ length: 9 }, (_, index) => capture({ id: `n-${index}`, repeat: index + 1 })),
    }), /1 to 8/);
    const key = prepared.manifest.items[0].idempotenceKey;
    const requestBytes = readFileSync(join(dir, 'requests', `${key}.json`));
    assert.equal(createHash('sha256').update(requestBytes).digest('hex'), prepared.manifest.items[0].requestSha256);
    assert.equal(JSON.parse(requestBytes.toString('utf8')).state.query, undefined);
    const httpBody = Buffer.from(JSON.stringify(validBody({
      coverage: 'answer-present',
      targetPrimary: 'true',
      criminalNamesakeMention: 'false',
      identityClass: 'target-only',
      harmfulAttribution: 'false',
      citationSupport: 'false',
      positionDiagnostic: 'target-leads',
      abstained: 'false',
    })));
    const unauthorized = Buffer.from('{"error":"unauthorized"}');
    const denied = recordDecision1Http({ dir, idempotenceKey: key, http: { status: 401, body: unauthorized } });
    assert.equal(denied.decodeStatus, 'error');
    assert.equal(denied.extraction, null);
    assert.equal(JSON.parse(readFileSync(join(dir, 'reserve.json'), 'utf8')).calls, 0);
    assert.throws(() => recordDecision1Http({ dir, idempotenceKey: key, http: { status: 200, body: httpBody } }), /not retrying/);
    assert.equal(readFileSync(join(dir, 'responses', key, 'body')).equals(unauthorized), true);
    const missingUsage = validBody();
    delete missingUsage.usage;
    const otherKey = prepared.manifest.items[1].idempotenceKey;
    const recorded = recordDecision1Http({ dir, idempotenceKey: otherKey, http: { status: 200, body: Buffer.from(JSON.stringify(missingUsage)) } });
    assert.equal(recorded.usage.output_tokens.status, 'unknown');
    assert.equal(recorded.usage.output_tokens.value, null);
    assert.equal(DECISION1_PRIOR_NANO + DECISION1_NEW_RESERVE_NANO <= DECISION1_CAP_NANO, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('decision1-example prints a synthetic request and does not call a provider', () => {
  const output = execFileSync(process.execPath, ['evals/seo-aeo/run.mjs', 'decision1-example'], { cwd: root, encoding: 'utf8' });
  const parsed = JSON.parse(output);
  assert.equal(parsed.called, false);
  assert.equal(parsed.questionsSha256, DECISION1_QUESTIONS_SHA256);
  assert.deepEqual(Object.keys(parsed.request.state), ['answer_text']);
  assert.equal(parsed.request.state.answer_text.includes('Synthetic placeholder'), true);
  const source = readFileSync(join(root, 'evals/seo-aeo/lib/decision1-strict.mjs'), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|\bhttps?\.request\b/);
  assert.doesNotMatch(source, /readFileSync\([^)]*(gold|label)/);
});
