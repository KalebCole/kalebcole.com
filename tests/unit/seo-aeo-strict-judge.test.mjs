import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  STRICT_JUDGE_REQUEST_SHA256,
  idempotenceKey,
  isolatedStrictJudgePayload,
  loadStrictJudgeRequest,
  persistRawResponse,
  prepareStrictValidation,
  validateStrictPreparation,
} from '../../evals/seo-aeo/lib/strict-judge.mjs';
import { verifyFrozenQuestionFiles, visibilityOutcome } from '../../evals/seo-aeo/lib/strict-visibility.mjs';
import { fixtures, root } from '../support/root.mjs';

const plan = JSON.parse(readFileSync(join(fixtures, 'seo-aeo', 'strict-judge-plan.json'), 'utf8'));

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'strict-judge-'));
}

test('the strict extraction request is pinned and stays out of the baseline', () => {
  const bundle = loadStrictJudgeRequest();
  assert.equal(bundle.sha256, STRICT_JUDGE_REQUEST_SHA256);
  assert.equal(bundle.request.version, 'strict-visibility-extraction-v1');
  assert.equal(bundle.request.rubricVersion, 'strict-visibility-win-v1');
  assert.equal(bundle.request.status, 'candidate-not-validated');
  assert.equal(bundle.request.notAScorer, true);
  assert.equal(bundle.request.isolation.must_not_merge_into_baseline_payload, true);
  assert.equal(bundle.request.isolation.do_not_use_visibility_only_v1, true);
  const text = JSON.stringify(bundle.request);
  assert.equal(text.includes('visibility_of_target'), false);
  assert.equal(text.includes('identity_class'), false);
  const frozen = verifyFrozenQuestionFiles();
  const payloads = isolatedStrictJudgePayload(frozen.baseline, bundle.request);
  assert.equal(payloads.called, false);
  assert.equal('visibility_of_target' in payloads.baselineRequest.questions, false);
  assert.equal(Object.keys(payloads.baselineRequest.questions).length, 8);
  assert.throws(() => isolatedStrictJudgePayload(frozen.baseline, frozen.baseline), /cannot share/);
  const merged = structuredClone(frozen.baseline);
  merged.questions.visibility_of_target = { type: 'choice' };
  assert.throws(() => isolatedStrictJudgePayload(merged, bundle.request), /not part of the identity baseline/);
  assert.equal(visibilityOutcome({ targetPrimary: 'false', criminalNamesakeMention: 'false', abstained: true }), 'loss');
  assert.equal(visibilityOutcome({ targetPrimary: 'true', criminalNamesakeMention: 'false', abstained: true }), 'abstain');
});

test('preparation is idempotent, splits tools, and refuses a changed plan', () => {
  const dir = tempDir();
  try {
    const first = prepareStrictValidation({ dir, items: plan.items });
    assert.equal(first.status, 'prepared');
    assert.equal(first.manifest.calls, 0);
    assert.equal(first.manifest.network, 'refused');
    assert.equal(first.manifest.judgeAccuracy, 'not-measured');
    assert.equal(first.manifest.freshProspectiveHoldout, false);
    assert.equal(first.manifest.items.length, 2);
    assert.notEqual(first.manifest.items[0].idempotenceKey, first.manifest.items[1].idempotenceKey);
    assert.equal(first.manifest.items[0].model, 'model-not-recorded');
    assert.equal(first.manifest.items[1].model, 'model-not-recorded');
    const again = prepareStrictValidation({ dir, items: plan.items });
    assert.equal(again.status, 'already-prepared');
    assert.throws(() => prepareStrictValidation({ dir, items: [plan.items[0]] }), /different item list/);
    assert.equal(readdirSync(join(dir, 'raw')).length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('raw responses persist only with usage and identical bytes', () => {
  const dir = tempDir();
  try {
    const prepared = prepareStrictValidation({ dir, items: plan.items });
    const key = prepared.manifest.items[0].idempotenceKey;
    const body = Buffer.from('{"coverage":"answer-present"}\n');
    assert.throws(() => persistRawResponse({ dir, idempotenceKey: key, body, usage: {} }), /usage.inputTokens/);
    assert.equal(existsSync(join(dir, 'raw', key)), false);
    assert.throws(() => persistRawResponse({ dir, idempotenceKey: 'not-a-key', body, usage: { inputTokens: 1, outputTokens: 1 } }), /not in the preparation/);
    const stored = persistRawResponse({ dir, idempotenceKey: key, body, usage: { inputTokens: 3, outputTokens: 4 } });
    assert.equal(stored.status, 'stored');
    assert.equal(stored.sha256, createHash('sha256').update(body).digest('hex'));
    const repeat = persistRawResponse({ dir, idempotenceKey: key, body, usage: { inputTokens: 3, outputTokens: 4 } });
    assert.equal(repeat.status, 'already-stored');
    assert.throws(() => persistRawResponse({ dir, idempotenceKey: key, body: Buffer.from('other'), usage: { inputTokens: 3, outputTokens: 4 } }), /different bytes/);
    assert.equal(readFileSync(join(dir, 'raw', key, 'body')).equals(body), true);
    assert.throws(() => persistRawResponse({ dir, idempotenceKey: key, body, usage: { inputTokens: 9, outputTokens: 4 } }), /different usage/);
    const report = validateStrictPreparation(dir);
    assert.equal(report.judgeAccuracy, 'not-measured');
    assert.equal(report.freshProspectiveHoldout, false);
    assert.equal(report.calls, 0);
    assert.equal(report.stored, 1);
    assert.equal(report.missing, 1);
    assert.equal(report.protocol, 'prepared');
    assert.match(report.note, /not a fresh prospective holdout/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the offline commands prepare, store, and validate without a network call', () => {
  const parent = tempDir();
  const dir = join(parent, 'run');
  const bodyPath = join(parent, 'response.json');
  try {
    const prepared = execFileSync(process.execPath, ['evals/seo-aeo/run.mjs', 'prepare-strict', 'tests/fixtures/seo-aeo/strict-judge-plan.json', '--out', dir], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.match(prepared, new RegExp(STRICT_JUDGE_REQUEST_SHA256));
    assert.match(prepared, /calls 0/);
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    writeFileSync(bodyPath, '{"synthetic":true}\n');
    const key = manifest.items[0].idempotenceKey;
    assert.equal(key, idempotenceKey(manifest.items[0]));
    const stored = execFileSync(process.execPath, [
      'evals/seo-aeo/run.mjs', 'persist-raw', '--out', dir, '--key', key, '--body', bodyPath, '--input-tokens', '2', '--output-tokens', '2',
    ], { cwd: root, encoding: 'utf8' });
    assert.match(stored, /^stored /);
    const validated = execFileSync(process.execPath, ['evals/seo-aeo/run.mjs', 'validate-strict', '--out', dir], { cwd: root, encoding: 'utf8' });
    assert.match(validated, /judgeAccuracy not-measured/);
    assert.match(validated, /calls 0/);
    const source = readFileSync(join(root, 'evals/seo-aeo/lib/strict-judge.mjs'), 'utf8');
    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /readFileSync\([^)]*label/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
