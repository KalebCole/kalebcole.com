import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertPlanV2Document } from '../../evals/seo-aeo/lib/decision1-send.mjs';
import {
  executeV2Plan,
  exportDecision1V2,
  mainV2,
  preflightV2,
  prepareV2,
} from '../../evals/seo-aeo/lib/decision1-v2-run.mjs';
import { DECISION1_V2_QUESTIONS_SHA256, loadDecision1V2Questions } from '../../evals/seo-aeo/lib/strict-visibility-v2.mjs';
import { canonicalQuestions } from '../../evals/seo-aeo/lib/decision1-send.mjs';
import { root } from '../support/root.mjs';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function writeAnswers(dir) {
  const inventory = preflightV2();
  for (const [index, slot] of inventory.slots.entries()) {
    const path = join(dir, slot.answerPath);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, `Synthetic capture ${index}. Not a consumer answer.`);
  }
  return inventory;
}

test('v2 preflight lists 8 unique slots and does not send', () => {
  const report = preflightV2();
  assert.equal(report.calls, 0);
  assert.equal(report.retries, 0);
  assert.equal(report.execute, false);
  assert.equal(report.questionsSha256, '7baece442ad3dcf0c65b2995efc8efb89da8f7988a887e4799c44cbb4d51e392');
  assert.equal(report.questionsSha256, DECISION1_V2_QUESTIONS_SHA256);
  assert.equal(report.priorUsd, '0.009587634');
  assert.equal(report.capUsd, '0.05');
  assert.equal(new Set(report.slots.map((slot) => slot.id)).size, 8);
  const output = execFileSync(process.execPath, ['evals/seo-aeo/decision1-v2-prepare.mjs'], { cwd: root, encoding: 'utf8' });
  const printed = JSON.parse(output);
  assert.equal(printed.calls, 0);
  assert.equal(printed.slots.length, 8);
});

test('prepared bodies bind the v2 question hash and stay out of the v1 sender', () => {
  const answers = mkdtempSync(join(tmpdir(), 'v2-answers-'));
  const out = mkdtempSync(join(tmpdir(), 'v2-out-'));
  writeAnswers(answers);
  const prepared = prepareV2({ answersRoot: answers, outRoot: out });
  assert.equal(prepared.calls, 0);
  assert.equal(prepared.plan.questionsSha256, DECISION1_V2_QUESTIONS_SHA256);
  assert.equal(prepared.plan.retries, 0);
  assert.equal(new Set(prepared.plan.items.map((item) => item.id)).size, 8);
  const wire = loadDecision1V2Questions().document.questions;
  for (const item of prepared.plan.items) {
    const body = JSON.parse(readFileSync(join(out, item.request_path), 'utf8'));
    assert.equal(body.model, 'decision-1-eval');
    assert.deepEqual(Object.keys(body.state), ['answer_text']);
    assert.equal(canonicalQuestions(body.questions), canonicalQuestions(wire));
    assert.equal(sha256(readFileSync(join(out, item.request_path))), item.request_sha256);
  }
  assert.throws(() => assertPlanV2Document(prepared.plan), /wire sha|plan version/);
  const again = prepareV2({ answersRoot: answers, outRoot: out });
  assert.equal(again.planSha256, prepared.planSha256);
  rmSync(answers, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
});

test('a failed attempt is durable, is not retried, and the armed counter survives restart', async () => {
  const answers = mkdtempSync(join(tmpdir(), 'v2-fail-answers-'));
  const out = mkdtempSync(join(tmpdir(), 'v2-fail-out-'));
  writeAnswers(answers);
  const { plan } = prepareV2({ answersRoot: answers, outRoot: out });
  let calls = 0;
  const first = await executeV2Plan({
    plan,
    runRoot: out,
    execute: true,
    sleep: () => Promise.resolve(),
    transport() {
      calls += 1;
      return { status: 500, body: Buffer.from('no') };
    },
  });
  assert.equal(first.calls, 1);
  assert.equal(first.retries, 0);
  assert.equal(first.stopped, 'http-500');
  assert.equal(calls, 1);
  const bodyPath = join(out, 'responses', `${plan.items[0].id.replaceAll(':', '__')}.http.body`);
  assert.equal(readFileSync(bodyPath, 'utf8'), 'no');
  const budget = JSON.parse(readFileSync(join(out, 'budget.json'), 'utf8'));
  assert.equal(budget.calls, 1);
  assert.equal(budget.retries, 0);
  assert.equal(budget.priorUsageNano, '9587634');
  const restart = await executeV2Plan({
    plan,
    runRoot: out,
    execute: true,
    transport() { throw new Error('must not send again'); },
  });
  assert.equal(restart.calls, 0);
  assert.equal(restart.stopped, 'already-stopped');
  assert.equal(JSON.parse(readFileSync(join(out, 'budget.json'), 'utf8')).calls, 1);
  assert.equal(readFileSync(bodyPath, 'utf8'), 'no');
  rmSync(answers, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
});

test('eight responses stay durable and the budget counts every armed attempt', async () => {
  const answers = mkdtempSync(join(tmpdir(), 'v2-eight-answers-'));
  const out = mkdtempSync(join(tmpdir(), 'v2-eight-out-'));
  writeAnswers(answers);
  const { plan } = prepareV2({ answersRoot: answers, outRoot: out });
  let calls = 0;
  const summary = await executeV2Plan({
    plan,
    runRoot: out,
    execute: true,
    sleep: () => Promise.resolve(),
    transport() {
      calls += 1;
      return { status: 200, body: Buffer.from('{"usage":{"input_tokens":1,"output_tokens":1}}') };
    },
  });
  assert.equal(summary.calls, 8);
  assert.equal(summary.stopped, null);
  assert.equal(summary.retries, 0);
  assert.equal(calls, 8);
  const budget = JSON.parse(readFileSync(join(out, 'budget.json'), 'utf8'));
  assert.equal(budget.calls, 8);
  assert.equal(budget.inputTokens, 8);
  assert.equal(budget.spentNewNano, String(8 * 42));
  assert.equal(budget.retries, 0);
  for (const item of plan.items) {
    assert.equal(readFileSync(join(out, 'responses', `${item.id.replaceAll(':', '__')}.http.body`), 'utf8').includes('input_tokens'), true);
  }
  rmSync(answers, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
});

test('execute checks the plan hash before auth', async () => {
  const answers = mkdtempSync(join(tmpdir(), 'v2-auth-answers-'));
  const out = mkdtempSync(join(tmpdir(), 'v2-auth-out-'));
  const empty = mkdtempSync(join(tmpdir(), 'v2-auth-empty-'));
  writeAnswers(answers);
  const prepared = prepareV2({ answersRoot: answers, outRoot: out });
  let spawned = false;
  await assert.rejects(() => mainV2([
    '--execute',
    '--plan', join(out, 'plan.v2-judge.json'),
    '--plan-sha', prepared.planSha256,
    '--run-root', empty,
    '--az', process.execPath,
    '--endpoint', 'https://kalebcole2021-0169-resource.cognitiveservices.azure.com/providers/microsoft/v1/systemone',
    '--resource', 'https://cognitiveservices.azure.com',
  ], { spawnImpl() { spawned = true; } }), /request file is missing/);
  assert.equal(spawned, false);
  rmSync(answers, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
  rmSync(empty, { recursive: true, force: true });
});

test('the exported v2 bundle preflights without sending', () => {
  const out = mkdtempSync(join(tmpdir(), 'v2-bundle-'));
  exportDecision1V2(out);
  const output = execFileSync(process.execPath, ['prepare.mjs'], { cwd: out, encoding: 'utf8' });
  const printed = JSON.parse(output);
  assert.equal(printed.calls, 0);
  assert.equal(printed.questionsSha256, DECISION1_V2_QUESTIONS_SHA256);
  assert.throws(() => execFileSync(process.execPath, ['prepare.mjs', '--execute'], { cwd: out, encoding: 'utf8', stdio: 'pipe' }), (error) => {
    assert.equal(error.status, 1);
    assert.match(`${error.stderr}`, /execute needs/);
    return true;
  });
  rmSync(out, { recursive: true, force: true });
});
