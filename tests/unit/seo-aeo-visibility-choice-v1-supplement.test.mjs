import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { prepareChoice } from '../../evals/seo-aeo/lib/visibility-choice-v1.mjs';
import {
  CONTEXT_WINDOW_TOKENS,
  CUMULATIVE_NANO,
  MAX_CALLS,
  MAX_INPUT_TOKENS,
  NEW_MAX_NANO,
  NEW_MAX_USD,
  ORIGINAL_NEW_MAX_NANO,
  ORIGINAL_R2_SHA256,
  ORIGINAL_RUNNER_SHA256,
  ORIGINAL_SPENT_NANO,
  PINNED_REQUESTS,
  PRIOR_NANO,
  PRIOR_USD,
  SUPPLEMENT_IDS,
  SUPPLEMENT_INPUTS,
  executeSupplement,
  mainSupplement,
  prepareSupplement,
  verifySupplementFreeze,
} from '../../evals/seo-aeo/lib/visibility-choice-v1-supplement.mjs';
import { root } from '../support/root.mjs';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function answerCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'supp-answers-'));
  for (const id of SUPPLEMENT_IDS) {
    const bytes = readFileSync(join(SUPPLEMENT_INPUTS, `${id}.txt`));
    writeFileSync(join(dir, `${id}.txt`), bytes);
  }
  return dir;
}

const okAnswer = { type: 'choice', choice: 'No', probabilities: { Yes: 0.2, No: 0.7 } };

test('the supplement pins the original runner, the measured requests, and the documented window', () => {
  const freeze = verifySupplementFreeze();
  assert.equal(freeze.promptFrozenAtUtc, '2026-11-08T20:22:23Z');
  assert.equal(freeze.nameCapturedAtPacific, '2026-11-08 1:26 PM Pacific');
  assert.notEqual(freeze.codeFrozenAtUtc, '2026-11-08T20:32:27Z');
  assert.equal(sha256(readFileSync(join(root, 'evals/seo-aeo/lib/visibility-choice-v1.mjs'))), ORIGINAL_RUNNER_SHA256);
  assert.equal(sha256(readFileSync(join(root, 'evals/seo-aeo/visibility-choice-v1/freeze-r2.json'))), ORIGINAL_R2_SHA256);
  assert.equal(sha256(readFileSync(join(root, 'evals/seo-aeo/visibility-choice-v1/freeze.json'))), 'f46f5ff1e96262d0a4dcfcb20620bd07f8048680ba639cf071fdef8d37216886');
  assert.equal(MAX_INPUT_TOKENS, 8151);
  assert.equal(CONTEXT_WINDOW_TOKENS, 32768);
  assert.equal(MAX_CALLS, 2);
  assert.equal(NEW_MAX_USD, '0.00068376');
  assert.equal(NEW_MAX_NANO, 683_760n);
  assert.equal(PRIOR_NANO + NEW_MAX_NANO, CUMULATIVE_NANO);
  assert.equal(ORIGINAL_SPENT_NANO + NEW_MAX_NANO <= ORIGINAL_NEW_MAX_NANO, true);
  const source = readFileSync(join(root, 'evals/seo-aeo/lib/visibility-choice-v1-supplement.mjs'), 'utf8');
  assert.equal(source.includes('gold.json'), false);
});

test('the staged inputs match the pinned request hashes and the original runner still blocks them', () => {
  const out = mkdtempSync(join(tmpdir(), 'supp-real-'));
  const prepared = prepareSupplement({ answersRoot: SUPPLEMENT_INPUTS, outRoot: out });
  assert.equal(prepared.calls, 0);
  assert.equal(prepared.plan.items[0].status, 'ready');
  assert.equal(prepared.plan.items[1].status, 'ready');
  assert.equal(prepared.plan.items[0].responseUtf8Bytes, 2740);
  assert.equal(prepared.plan.items[0].requestUtf8Bytes, 4055);
  assert.equal(prepared.plan.items[0].conservativeInputTokens, 8151);
  assert.equal(prepared.plan.items[0].requestSha256, PINNED_REQUESTS['fresh-google-signed-out-who-is'].requestSha256);
  assert.equal(prepared.plan.items[1].responseUtf8Bytes, 2718);
  assert.equal(prepared.plan.items[1].requestUtf8Bytes, 4033);
  assert.equal(prepared.plan.items[1].conservativeInputTokens, 8129);
  assert.equal(prepared.plan.items[1].requestSha256, PINNED_REQUESTS['fresh-google-signed-out-name'].requestSha256);
  const original = mkdtempSync(join(tmpdir(), 'orig-block-'));
  const blocked = prepareChoice({ answersRoot: SUPPLEMENT_INPUTS, outRoot: original });
  for (const id of SUPPLEMENT_IDS) {
    assert.equal(blocked.plan.items.find((item) => item.id === id).status, 'blocked');
  }
  rmSync(out, { recursive: true, force: true });
  rmSync(original, { recursive: true, force: true });
});

test('one byte over 8151 is preserved and a different under-ceiling text is refused', () => {
  const answers = mkdtempSync(join(tmpdir(), 'supp-over-'));
  const out = mkdtempSync(join(tmpdir(), 'supp-over-out-'));
  const who = readFileSync(join(SUPPLEMENT_INPUTS, 'fresh-google-signed-out-who-is.txt'));
  const extra = Buffer.concat([who, Buffer.from('a')]);
  writeFileSync(join(answers, 'fresh-google-signed-out-who-is.txt'), extra);
  const prepared = prepareSupplement({ answersRoot: answers, outRoot: out });
  assert.equal(prepared.plan.items[0].status, 'blocked');
  assert.equal(prepared.plan.items[0].conservativeInputTokens > 8151, true);
  assert.equal(existsSync(join(out, 'requests', 'fresh-google-signed-out-who-is.json')), false);
  const changed = Buffer.from(who);
  const index = changed.findIndex((byte) => byte >= 65 && byte <= 90);
  changed[index] = changed[index] === 65 ? 66 : 65;
  writeFileSync(join(answers, 'fresh-google-signed-out-who-is.txt'), changed);
  assert.throws(() => prepareSupplement({ answersRoot: answers, outRoot: mkdtempSync(join(tmpdir(), 'supp-mismatch-')) }), /does not match the pinned supplement request/);
  rmSync(answers, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
});

test('a malformed probability map stops before the second call', async () => {
  const answers = answerCopy();
  const out = mkdtempSync(join(tmpdir(), 'supp-bad-out-'));
  const prepared = prepareSupplement({ answersRoot: answers, outRoot: out });
  let calls = 0;
  const summary = await executeSupplement({
    plan: prepared.plan,
    runRoot: out,
    execute: true,
    sleep: () => Promise.resolve(),
    transport() {
      calls += 1;
      return {
        status: 200,
        headers: {},
        body: Buffer.from('{"usage":{"input_tokens":1,"output_tokens":1},"answers":{"visibility":{"type":"choice","choice":"Yes","probabilities":{"Yes":1.2,"No":0.1}}}}'),
      };
    },
  });
  assert.equal(calls, 1);
  assert.equal(summary.stopped, 'bad-probabilities');
  assert.deepEqual(summary.sent, ['fresh-google-signed-out-who-is']);
  assert.equal(readFileSync(join(out, 'responses', 'fresh-google-signed-out-who-is.body'), 'utf8').includes('1.2'), true);
  rmSync(answers, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
});

test('the two measured requests arm twice and spend exactly 683760 nanodollars', async () => {
  const answers = answerCopy();
  const out = mkdtempSync(join(tmpdir(), 'supp-two-out-'));
  const prepared = prepareSupplement({ answersRoot: answers, outRoot: out });
  const sleeps = [];
  const tokens = [8151, 8129];
  const summary = await executeSupplement({
    plan: prepared.plan,
    runRoot: out,
    execute: true,
    sleep: (ms) => { sleeps.push(ms); return Promise.resolve(); },
    transport() {
      const input = tokens.shift();
      return {
        status: 200,
        headers: {},
        body: Buffer.from(JSON.stringify({ usage: { input_tokens: input, output_tokens: 1 }, answers: { visibility: okAnswer } })),
      };
    },
  });
  assert.equal(summary.calls, 2);
  assert.equal(summary.stopped, null);
  assert.deepEqual(sleeps, [5000]);
  const budget = JSON.parse(readFileSync(join(out, 'budget.json'), 'utf8'));
  assert.equal(budget.calls, 2);
  assert.equal(budget.retries, 0);
  assert.equal(budget.spentNewNano, '683760');
  assert.equal(budget.priorUsageNano, '10539228');
  let again = 0;
  const restart = await executeSupplement({
    plan: prepared.plan,
    runRoot: out,
    execute: true,
    sleep: () => Promise.resolve(),
    transport() { again += 1; return { status: 200, headers: {}, body: Buffer.alloc(0) }; },
  });
  assert.equal(again, 0);
  assert.equal(restart.skipped.length, 2);
  rmSync(answers, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
});

test('the default command inventories the staged inputs and does not authenticate', async () => {
  const output = execFileSync(process.execPath, ['evals/seo-aeo/visibility-choice-v1-supplement-prepare.mjs'], { cwd: root, encoding: 'utf8' });
  const printed = JSON.parse(output);
  assert.equal(printed.calls, 0);
  assert.equal(printed.planned, 2);
  assert.equal(printed.ready, 2);
  assert.equal(printed.missing, 0);
  assert.equal(printed.newMaxUsd, '0.00068376');
  assert.equal(printed.cumulativeUsd, '0.011222988');
  assert.deepEqual(printed.ids, SUPPLEMENT_IDS);
  const original = mkdtempSync(join(tmpdir(), 'supp-original-'));
  writeFileSync(join(original, 'plan.json'), `${JSON.stringify({ version: 'visibility-choice-v1' })}\n`);
  assert.throws(() => prepareSupplement({ outRoot: original }), /original run/);
  const out = mkdtempSync(join(tmpdir(), 'supp-pin-'));
  mkdirSync(join(out, 'requests'), { recursive: true });
  prepareSupplement({ outRoot: out });
  let spawned = false;
  await assert.rejects(() => mainSupplement([
    '--execute',
    '--plan', join(out, 'plan.json'),
    '--plan-sha', 'abc',
    '--freeze-sha', sha256(readFileSync(join(root, 'evals/seo-aeo/visibility-choice-v1/supplement-freeze.json'))),
    '--run-root', out,
    '--az', process.execPath,
    '--endpoint', 'https://kalebcole2021-0169-resource.cognitiveservices.azure.com/providers/microsoft/v1/systemone',
    '--resource', 'https://cognitiveservices.azure.com',
    '--budget-prior', PRIOR_USD,
    '--budget-cap', '0.05',
    '--budget-new', NEW_MAX_USD,
  ], { spawnImpl() { spawned = true; } }), /plan file does not match/);
  assert.equal(spawned, false);
  rmSync(original, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
});
