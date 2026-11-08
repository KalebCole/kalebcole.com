import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { reportChoice } from '../../evals/seo-aeo/lib/visibility-choice-v1-report.mjs';
import {
  MAX_INPUT_TOKENS,
  PRIOR_USD,
  buildChoiceRequest,
  decideChoice,
  executeChoice,
  mainChoice,
  prepareChoice,
  verifyFreeze,
} from '../../evals/seo-aeo/lib/visibility-choice-v1.mjs';
import { root } from '../support/root.mjs';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

test('the candidate freeze matches the question, profile, and runner bytes', () => {
  const freeze = verifyFreeze();
  assert.equal(freeze.frozenAtUtc, '2026-11-08T20:22:23Z');
  assert.equal(freeze.maxInputTokens, 8000);
  assert.equal(freeze.priorUsd, PRIOR_USD);
  const prepared = prepareChoice();
  assert.equal(prepared.calls, 0);
  assert.equal(prepared.plan.items.length, 24);
  assert.equal(new Set(prepared.plan.items.map((item) => item.id)).size, 24);
  for (const [id, requestSha] of Object.entries(freeze.syntheticRequests)) {
    const item = prepared.plan.items.find((entry) => entry.id === id);
    assert.equal(item.status, 'ready');
    assert.equal(item.requestSha256, requestSha);
    assert.ok(item.conservativeInputTokens <= MAX_INPUT_TOKENS);
    const body = buildChoiceRequest(readFileSync(join(root, 'evals/seo-aeo/visibility-choice-v1/synthetic', `${id}.txt`), 'utf8'));
    assert.deepEqual(Object.keys(body.payload), ['model', 'state', 'questions']);
    assert.deepEqual(Object.keys(body.payload.state), ['profile', 'response']);
    assert.deepEqual(Object.keys(body.payload.questions), ['visibility']);
    assert.equal(JSON.stringify(body.payload).includes('gold'), false);
  }
  const source = readFileSync(join(root, 'evals/seo-aeo/lib/visibility-choice-v1.mjs'), 'utf8');
  assert.equal(source.includes('gold.json'), false);
});

test('probability ties and disagreements are not a No, and confidence is not the decision', () => {
  assert.equal(decideChoice({ answers: { visibility: { type: 'choice', choice: 'Yes', confidence: 0.99, probabilities: { Yes: 0.2, No: 0.8 } } } }).outcome, 'invalid');
  assert.equal(decideChoice({ answers: { visibility: { type: 'choice', choice: 'Yes', probabilities: { Yes: 0.5, No: 0.5 } } } }).outcome, 'tie');
  assert.equal(decideChoice({ answers: { visibility: { type: 'choice', choice: 'Yes', probabilities: { Yes: 0.7, No: 0.2 } } } }).outcome, 'yes');
  assert.equal(decideChoice({ answers: { visibility: { type: 'choice', choice: 'No', probabilities: { Yes: 0.1, No: 0.4 } } } }).outcome, 'no');
  assert.equal(decideChoice({ answers: { visibility: { probs: { Yes: 1, No: 0 } } } }).outcome, 'invalid');
});

test('an oversize response is preserved, unsent, and still counted', () => {
  const answers = mkdtempSync(join(tmpdir(), 'choice-long-'));
  const out = mkdtempSync(join(tmpdir(), 'choice-long-out-'));
  const text = `Synthetic long fixture. ${'x'.repeat(5000)}`;
  writeFileSync(join(answers, 'fresh-google-signed-out-name.txt'), text);
  const prepared = prepareChoice({ answersRoot: answers, outRoot: out });
  const blocked = prepared.plan.items.find((item) => item.id === 'fresh-google-signed-out-name');
  assert.equal(blocked.status, 'blocked');
  assert.ok(blocked.conservativeInputTokens > MAX_INPUT_TOKENS);
  assert.equal(readFileSync(join(out, 'preserved', 'fresh-google-signed-out-name.txt'), 'utf8'), text);
  assert.equal(prepared.plan.items.filter((item) => item.status === 'ready').length, 8);
  const report = reportChoice(prepared.plan);
  assert.equal(report.planned, 24);
  assert.equal(report.accounted, 24);
  assert.equal(report.outcomes.blocked, 1);
  assert.equal(report.outcomes.missing, 15);
  assert.equal(report.buckets.fresh.blocked, 1);
  assert.equal(report.fullPipeline.denominator, 24);
  rmSync(answers, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
});

test('known, boundary, and fresh buckets keep false yes and false no separate', () => {
  const prepared = prepareChoice();
  const decisions = new Map([
    ['known-gemini-signed-out-name-microsoft', { outcome: 'no' }],
    ['known-google-signed-out-name', { outcome: 'yes' }],
    ['boundary-clear-target', { outcome: 'yes' }],
    ['boundary-crime-only', { outcome: 'yes' }],
    ['boundary-disclaimer', { outcome: 'tie' }],
  ]);
  const labels = reportChoice(prepared.plan).rows;
  assert.equal(labels.length, 24);
  const report = reportChoice(prepared.plan, new Map([
    ['known-gemini-signed-out-name-microsoft', Buffer.from(JSON.stringify({ answers: { visibility: { type: 'choice', choice: 'No', probabilities: { Yes: 0.2, No: 0.8 } } } }))],
    ['boundary-crime-only', Buffer.from(JSON.stringify({ answers: { visibility: { type: 'choice', choice: 'Yes', probabilities: { Yes: 0.9, No: 0.1 } } } }))],
  ]));
  assert.equal(report.falseNo, 1);
  assert.equal(report.falseYes, 1);
  assert.equal(report.buckets.known.planned, 8);
  assert.equal(report.buckets.boundary.planned, 8);
  assert.equal(report.buckets.fresh.planned, 8);
  assert.equal(report.decisiveConditional.coverageDenominator, 24);
  assert.equal(decisions.size, 5);
});

test('ready responses are durable, retries stay zero, and a bad status does not continue', async () => {
  const out = mkdtempSync(join(tmpdir(), 'choice-send-'));
  const prepared = prepareChoice({ outRoot: out });
  let calls = 0;
  const sleeps = [];
  const summary = await executeChoice({
    plan: prepared.plan,
    runRoot: out,
    execute: true,
    sleep: (ms) => { sleeps.push(ms); return Promise.resolve(); },
    transport() {
      calls += 1;
      if (calls === 1) return { status: 500, headers: { 'content-type': 'application/json' }, body: Buffer.from('no') };
      return { status: 200, headers: {}, body: Buffer.from('{"usage":{"input_tokens":1,"output_tokens":1},"answers":{"visibility":{"type":"choice","choice":"Yes","probabilities":{"Yes":0.8,"No":0.2}}}}') };
    },
  });
  assert.equal(summary.calls, 1);
  assert.equal(summary.retries, 0);
  assert.equal(summary.stopped, 'http-500');
  assert.equal(calls, 1);
  assert.deepEqual(sleeps, []);
  const id = prepared.plan.items.find((item) => item.status === 'ready').id;
  assert.equal(readFileSync(join(out, 'responses', `${id}.body`), 'utf8'), 'no');
  assert.equal(JSON.parse(readFileSync(join(out, 'responses', `${id}.status.json`), 'utf8')).status, 500);
  const budget = JSON.parse(readFileSync(join(out, 'budget.json'), 'utf8'));
  assert.equal(budget.calls, 1);
  assert.equal(budget.retries, 0);
  assert.equal(budget.priorUsageNano, '10124478');
  const restart = await executeChoice({
    plan: prepared.plan,
    runRoot: out,
    execute: true,
    transport() { throw new Error('must not send'); },
  });
  assert.equal(restart.calls, 0);
  assert.equal(restart.stopped, 'already-stopped');
  rmSync(out, { recursive: true, force: true });
});

test('eight synthetic responses arm once and the budget counts them', async () => {
  const out = mkdtempSync(join(tmpdir(), 'choice-eight-'));
  const prepared = prepareChoice({ outRoot: out });
  const sleeps = [];
  const summary = await executeChoice({
    plan: prepared.plan,
    runRoot: out,
    execute: true,
    sleep: (ms) => { sleeps.push(ms); return Promise.resolve(); },
    transport() {
      return { status: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from('{"usage":{"input_tokens":3,"output_tokens":9},"answers":{"visibility":{"type":"choice","choice":"No","confidence":0.4,"probabilities":{"Yes":0.2,"No":0.7}}}}') };
    },
  });
  assert.equal(summary.calls, 8);
  assert.equal(summary.missing.length, 16);
  assert.equal(summary.stopped, null);
  assert.deepEqual(sleeps, Array(7).fill(5000));
  const budget = JSON.parse(readFileSync(join(out, 'budget.json'), 'utf8'));
  assert.equal(budget.calls, 8);
  assert.equal(budget.inputTokens, 24);
  assert.equal(budget.spentNewNano, String(24 * 42));
  assert.equal(budget.retries, 0);
  rmSync(out, { recursive: true, force: true });
});

test('the default command makes zero calls and execute checks pins before auth', async () => {
  const output = execFileSync(process.execPath, ['evals/seo-aeo/visibility-choice-v1-prepare.mjs'], { cwd: root, encoding: 'utf8' });
  const printed = JSON.parse(output);
  assert.equal(printed.calls, 0);
  assert.equal(printed.planned, 24);
  assert.equal(printed.ready, 8);
  assert.equal(printed.missing, 16);
  const out = mkdtempSync(join(tmpdir(), 'choice-pin-'));
  const prepared = prepareChoice({ outRoot: out });
  let spawned = false;
  await assert.rejects(() => mainChoice([
    '--execute',
    '--plan', join(out, 'plan.json'),
    '--plan-sha', 'abc',
    '--freeze-sha', sha256(readFileSync(join(root, 'evals/seo-aeo/visibility-choice-v1/freeze.json'))),
    '--run-root', out,
    '--az', process.execPath,
    '--endpoint', 'https://kalebcole2021-0169-resource.cognitiveservices.azure.com/providers/microsoft/v1/systemone',
    '--resource', 'https://cognitiveservices.azure.com',
    '--budget-prior', PRIOR_USD,
    '--budget-cap', '0.05',
    '--budget-new', '0.008064',
  ], { spawnImpl() { spawned = true; } }), /plan file does not match/);
  assert.equal(spawned, false);
  assert.equal(prepared.calls, 0);
  rmSync(out, { recursive: true, force: true });
});
