import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildDecision1Request, DECISION1_NEW_RESERVE_NANO, DECISION1_QUESTIONS_SHA256, planningEnvelopeNano } from '../../evals/seo-aeo/lib/decision1-strict.mjs';
import { PLAN_V2_REQUEST_BYTES, PLAN_V2_SHA256, assertPlanV2Document, assertSystemoneEndpoint, azRestArgs, executeFrozenPlan, exportDecision1Sender, verifyFrozenRequest } from '../../evals/seo-aeo/lib/decision1-send.mjs';
import { root } from '../support/root.mjs';

const planPath = join(root, 'evals/seo-aeo/plans/input-plan.v2.json');
const planBytes = readFileSync(planPath);
const reviewed = JSON.parse(planBytes.toString('utf8'));

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

test('the reviewed plan v2 hash, wire, and request byte total match', () => {
  assert.equal(createHash('sha256').update(planBytes).digest('hex'), PLAN_V2_SHA256);
  const checked = assertPlanV2Document(reviewed);
  assert.equal(checked.totalRequestBytes, PLAN_V2_REQUEST_BYTES);
  assert.equal(reviewed.items.length, 8);
  assert.equal(reviewed.wire_source.sha256, DECISION1_QUESTIONS_SHA256);
  assert.equal(checked.envelope.tokens, 90531n);
  assert.equal(checked.envelope.costNano, 3802302n);
  assert.equal(reviewed.items.filter((item) => item.judge_input_sha256 !== item.body_sha256).length, 7);
  assert.equal(reviewed.budget_preflight.conservative_planning_envelope_usd, '0.003802302');
  assert.equal(DECISION1_NEW_RESERVE_NANO, 5_000_000n);
  const envelope = planningEnvelopeNano(57763, 8);
  assert.ok(envelope.costNano < DECISION1_NEW_RESERVE_NANO);
  assert.ok(planningEnvelopeNano(57763, 8).costNano > 2_000_000n);
});

test('request files are checked by judge input hash and are not regenerated', () => {
  const answerText = 'Synthetic judge input. Not a captured answer.';
  const built = buildDecision1Request({ answerText });
  const dir = mkdtempSync(join(tmpdir(), 'plan-v2-'));
  const relative = 'requests.v2/synthetic__a1.json';
  mkdirSync(join(dir, 'requests.v2'), { recursive: true });
  writeFileSync(join(dir, relative), built.bytes);
  const item = {
    id: 'synthetic',
    request_path: relative,
    request_sha256: built.sha256,
    request_utf8_bytes: built.bytes.length,
    judge_input_sha256: sha256(answerText),
    body_sha256: 'b'.repeat(64),
    reviewed_raw_body_sha256: 'b'.repeat(64),
    transformation: { header_removed: false },
  };
  const verified = verifyFrozenRequest(item, dir);
  assert.equal(verified.payload.state.answer_text, answerText);
  assert.equal(sha256(verified.payload.state.answer_text) === item.body_sha256, false);
  item.judge_input_sha256 = item.body_sha256;
  assert.throws(() => verifyFrozenRequest(item, dir), /judge_input_sha256/);
  assert.throws(() => verifyFrozenRequest({ ...item, id: 'missing', request_path: 'requests.v2/missing.json', judge_input_sha256: sha256(answerText) }, dir), /refusing to regenerate/);
  rmSync(dir, { recursive: true, force: true });
  assert.throws(() => assertSystemoneEndpoint('http://example.openai.azure.com/providers/microsoft/v1/systemone'), /https/);
  assert.throws(() => assertSystemoneEndpoint('https://evil.example/providers/microsoft/v1/systemone'), /allowed Azure host/);
  const allowed = assertSystemoneEndpoint('https://unit.openai.azure.com/providers/microsoft/v1/systemone');
  assert.equal(allowed.host, 'unit.openai.azure.com');
});

test('a frozen plan sends exact bytes, stops without retry, and does not send twice', async () => {
  const firstText = 'Synthetic first judge input.';
  const secondText = 'Synthetic second judge input.';
  const first = buildDecision1Request({ answerText: firstText });
  const second = buildDecision1Request({ answerText: secondText });
  const dir = mkdtempSync(join(tmpdir(), 'send-plan-'));
  mkdirSync(join(dir, 'requests.v2'), { recursive: true });
  writeFileSync(join(dir, 'requests.v2/one.json'), first.bytes);
  writeFileSync(join(dir, 'requests.v2/two.json'), second.bytes);
  const total = first.bytes.length + second.bytes.length;
  const envelope = planningEnvelopeNano(total, 2);
  const plan = {
    version: 'strict-visibility-win-v1-8case-offline-plan-v2',
    prediction_calls_made: 0,
    labels_or_outcomes_read: false,
    wire_source: { sha256: DECISION1_QUESTIONS_SHA256 },
    budget_preflight: {
      new_planning_reserve_usd: '0.005',
      prior_estimated_usd: '0.009095688',
      cumulative_cap_usd: '0.05',
      serialized_payload_total_utf8_bytes: total,
      conservative_planning_envelope_tokens: Number(envelope.tokens),
    },
    items: [
      item('one', 'requests.v2/one.json', first, firstText),
      item('two', 'requests.v2/two.json', second, secondText),
    ],
  };
  const calls = [];
  const sleeps = [];
  const dry = await executeFrozenPlan({ plan, runRoot: dir, execute: false, transport: () => { throw new Error('should not send'); } });
  assert.equal(dry.calls, 0);
  const stopped = await executeFrozenPlan({
    plan,
    runRoot: dir,
    execute: true,
    spacingMs: 5000,
    sleep: (ms) => { sleeps.push(ms); return Promise.resolve(); },
    transport: (bytes) => {
      calls.push(bytes);
      return Promise.resolve({ status: 401, body: Buffer.from('{"error":"unauthorized"}') });
    },
  });
  assert.equal(stopped.calls, 1);
  assert.equal(stopped.stopped, 'http-401');
  assert.deepEqual(calls.length, 1);
  assert.equal(Buffer.compare(calls[0], first.bytes), 0);
  assert.deepEqual(sleeps, []);
  const reserve = JSON.parse(readFileSync(join(dir, 'budget.json'), 'utf8'));
  assert.equal(reserve.newReserveNano, '5000000');
  assert.equal(reserve.calls, 0);
  assert.equal(reserve.retries, 0);
  const again = await executeFrozenPlan({
    plan,
    runRoot: dir,
    execute: true,
    transport: () => { calls.push('again'); return Promise.resolve({ status: 200, body: Buffer.from('{}') }); },
  });
  assert.equal(again.calls, 0);
  assert.equal(again.stopped, 'already-stopped');
  assert.equal(calls.length, 1);
  rmSync(dir, { recursive: true, force: true });
});

function item(id, requestPath, built, answerText) {
  return {
    id,
    judge_deployment: 'decision-1-eval',
    judge_model_version: '1 (management verified earlier; not inference tested)',
    question_spec_version: 'strict-visibility-decision1-v1',
    request_path: requestPath,
    request_sha256: built.sha256,
    request_utf8_bytes: built.bytes.length,
    judge_input_sha256: createHash('sha256').update(answerText).digest('hex'),
    body_sha256: 'c'.repeat(64),
    reviewed_raw_body_sha256: 'c'.repeat(64),
    transformation: { header_removed: false },
  };
}

test('missing provider usage stops the run and leaves the reserve in place', async () => {
  const text = 'Synthetic judge input with no usage.';
  const built = buildDecision1Request({ answerText: text });
  const dir = mkdtempSync(join(tmpdir(), 'send-usage-'));
  mkdirSync(join(dir, 'requests.v2'), { recursive: true });
  writeFileSync(join(dir, 'requests.v2/one.json'), built.bytes);
  const envelope = planningEnvelopeNano(built.bytes.length, 1);
  const plan = {
    version: 'strict-visibility-win-v1-8case-offline-plan-v2',
    prediction_calls_made: 0,
    labels_or_outcomes_read: false,
    wire_source: { sha256: DECISION1_QUESTIONS_SHA256 },
    budget_preflight: {
      new_planning_reserve_usd: '0.005',
      prior_estimated_usd: '0.009095688',
      cumulative_cap_usd: '0.05',
      serialized_payload_total_utf8_bytes: built.bytes.length,
      conservative_planning_envelope_tokens: Number(envelope.tokens),
    },
    items: [item('one', 'requests.v2/one.json', built, text)],
  };
  const result = await executeFrozenPlan({
    plan,
    runRoot: dir,
    execute: true,
    transport: () => Promise.resolve({ status: 200, body: Buffer.from('{"answers":{}}') }),
  });
  assert.equal(result.stopped, 'missing-usage');
  assert.equal(result.calls, 1);
  const budget = JSON.parse(readFileSync(join(dir, 'budget.json'), 'utf8'));
  assert.equal(budget.newReserveNano, '5000000');
  assert.equal(budget.calls, 0);
  const restart = await executeFrozenPlan({
    plan,
    runRoot: dir,
    execute: true,
    transport: () => { throw new Error('must not send again'); },
  });
  assert.equal(restart.calls, 0);
  assert.equal(restart.stopped, 'already-stopped');
  rmSync(dir, { recursive: true, force: true });
});

test('az args pin the systemone path and do not carry a bearer token', () => {
  const args = azRestArgs({
    endpoint: 'https://unit.openai.azure.com/providers/microsoft/v1/systemone',
    bodyPath: 'requests.v2/one.json',
    resource: 'https://cognitiveservices.azure.com',
  });
  assert.equal(args.some((arg) => String(arg).includes('Bearer')), false);
  assert.equal(args.includes('--uri'), true);
  assert.equal(args.includes('https://unit.openai.azure.com/providers/microsoft/v1/systemone'), true);
});

test('the exported bundle verifies the plan and refuses to execute', () => {
  const out = mkdtempSync(join(tmpdir(), 'sender-bundle-'));
  exportDecision1Sender(out);
  assert.throws(() => execFileSync(process.execPath, ['send.mjs', '--execute'], { cwd: out, encoding: 'utf8', stdio: 'pipe' }), (error) => {
    assert.equal(error.status, 2);
    assert.match(`${error.stderr}`, /No request was sent/);
    return true;
  });
  rmSync(out, { recursive: true, force: true });
});

test('decision1-verify-plan does not send and reports the reviewed byte total', () => {
  const output = execFileSync(process.execPath, ['evals/seo-aeo/run.mjs', 'decision1-verify-plan', 'evals/seo-aeo/plans/input-plan.v2.json'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.match(output, /8 items/);
  assert.match(output, /57763 request bytes/);
  assert.match(output, /calls 0/);
  const missing = mkdtempSync(join(tmpdir(), 'no-requests-'));
  assert.throws(() => execFileSync(process.execPath, ['evals/seo-aeo/run.mjs', 'decision1-verify-plan', 'evals/seo-aeo/plans/input-plan.v2.json', '--run-root', missing], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  }));
  rmSync(missing, { recursive: true, force: true });
});
