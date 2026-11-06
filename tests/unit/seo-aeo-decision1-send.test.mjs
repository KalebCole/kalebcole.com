import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildDecision1Request, DECISION1_NEW_RESERVE_NANO, DECISION1_QUESTIONS_SHA256, planningEnvelopeNano } from '../../evals/seo-aeo/lib/decision1-strict.mjs';
import { DECISION1_ENDPOINT, PLAN_V2_REQUEST_BYTES, PLAN_V2_SHA256, assertPlanV2Document, assertSystemoneEndpoint, azTokenArgs, executeFrozenPlan, exportDecision1Sender, main, postHttps, readAzAccessToken, verifyFrozenRequest } from '../../evals/seo-aeo/lib/decision1-send.mjs';
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
  assert.throws(() => assertSystemoneEndpoint('http://example.openai.azure.com/providers/microsoft/v1/systemone'), /pinned systemone URL/);
  assert.throws(() => assertSystemoneEndpoint('https://unit.openai.azure.com/providers/microsoft/v1/systemone'), /pinned systemone URL/);
  const allowed = assertSystemoneEndpoint(DECISION1_ENDPOINT);
  assert.equal(allowed.host, 'kalebcole2021-0169-resource.cognitiveservices.azure.com');
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

function materialize(dir, count) {
  mkdirSync(join(dir, 'requests.v2'), { recursive: true });
  const texts = ['Synthetic judge input one.', 'Synthetic judge input two.'].slice(0, count);
  const built = texts.map((text) => ({ text, request: buildDecision1Request({ answerText: text }) }));
  const items = built.map((entry, index) => {
    const id = index === 0 ? 'one' : 'two';
    const requestPath = `requests.v2/${id}.json`;
    writeFileSync(join(dir, requestPath), entry.request.bytes);
    return item(id, requestPath, entry.request, entry.text);
  });
  const total = built.reduce((sum, entry) => sum + entry.request.bytes.length, 0);
  const envelope = planningEnvelopeNano(total, count);
  return {
    bytes: built[0].request.bytes,
    plan: {
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
      items,
    },
  };
}

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

test('the pinned endpoint is the existing systemone URL and token args do not carry a bearer', () => {
  assert.equal(assertSystemoneEndpoint(DECISION1_ENDPOINT).path, '/providers/microsoft/v1/systemone');
  assert.throws(() => assertSystemoneEndpoint('https://unit.openai.azure.com/providers/microsoft/v1/systemone'), /pinned systemone URL/);
  const args = azTokenArgs('/home/box/.local/share/azure-cli-venv/bin/az', 'https://cognitiveservices.azure.com');
  assert.deepEqual(args.slice(1, 3), ['account', 'get-access-token']);
  assert.equal(args.includes('rest'), false);
  assert.equal(args.some((arg) => String(arg).includes('Bearer')), false);
});

test('any non-200 stops, and an existing response file is not overwritten', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'decision1-status-'));
  const { plan } = materialize(dir, 1);
  const summary = await executeFrozenPlan({
    plan,
    runRoot: dir,
    execute: true,
    transport: () => ({ status: 500, body: Buffer.from('no') }),
  });
  assert.equal(summary.calls, 1);
  assert.equal(summary.stopped, 'http-500');
  assert.equal(readFileSync(join(dir, 'responses', 'one.http.body'), 'utf8'), 'no');
  const held = mkdtempSync(join(tmpdir(), 'decision1-wx-'));
  const frozen = materialize(held, 1);
  mkdirSync(join(held, 'responses'), { recursive: true });
  writeFileSync(join(held, 'responses', 'one.http'), 'kept');
  writeFileSync(join(held, 'responses', 'one.http.body'), 'kept-body');
  await assert.rejects(() => executeFrozenPlan({
    plan: frozen.plan,
    runRoot: held,
    execute: true,
    transport: () => ({ status: 200, body: Buffer.from('{"usage":{"input_tokens":1,"output_tokens":1}}') }),
  }), /refusing to overwrite/);
  assert.equal(readFileSync(join(held, 'responses', 'one.http.body'), 'utf8'), 'kept-body');
  rmSync(dir, { recursive: true, force: true });
  rmSync(held, { recursive: true, force: true });
});

test('provider usage must be nonnegative integers and unknown usage keeps the reserve', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'decision1-usage-'));
  const { plan } = materialize(dir, 1);
  await executeFrozenPlan({
    plan,
    runRoot: dir,
    execute: true,
    transport: () => ({ status: 200, body: Buffer.from('{"usage":{"input_tokens":-1,"output_tokens":1}}') }),
  });
  const budget = JSON.parse(readFileSync(join(dir, 'budget.json'), 'utf8'));
  assert.equal(budget.usageUnknown, true);
  assert.equal(budget.newReserveNano, '5000000');
  assert.equal(budget.spentNewNano, '0');
  const again = await executeFrozenPlan({
    plan,
    runRoot: dir,
    execute: true,
    transport: () => { throw new Error('must not send again'); },
  });
  assert.equal(again.calls, 0);
  assert.equal(JSON.parse(readFileSync(join(dir, 'budget.json'), 'utf8')).newReserveNano, '5000000');
  rmSync(dir, { recursive: true, force: true });
});

test('actual input tokens update the budget and stop at the new reserve', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'decision1-budget-'));
  const { plan } = materialize(dir, 2);
  const summary = await executeFrozenPlan({
    plan,
    runRoot: dir,
    execute: true,
    transport: () => ({ status: 200, body: Buffer.from('{"usage":{"input_tokens":200000,"output_tokens":1}}') }),
  });
  assert.equal(summary.calls, 1);
  assert.equal(summary.stopped, 'new-reserve');
  const budget = JSON.parse(readFileSync(join(dir, 'budget.json'), 'utf8'));
  assert.equal(budget.inputTokens, 200000);
  assert.equal(budget.spentNewNano, String(200000 * 42));
  const restart = await executeFrozenPlan({
    plan,
    runRoot: dir,
    execute: true,
    transport: () => { throw new Error('must not send again'); },
  });
  assert.equal(restart.calls, 0);
  assert.equal(restart.stopped, 'new-reserve');
  assert.equal(JSON.parse(readFileSync(join(dir, 'budget.json'), 'utf8')).spentNewNano, String(200000 * 42));
  rmSync(dir, { recursive: true, force: true });
});

test('extra journal lines do not count as armed attempts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'decision1-armed-'));
  const { plan, bytes } = materialize(dir, 1);
  writeFileSync(join(dir, 'attempts.jsonl'), `${Array.from({ length: 20 }, () => JSON.stringify({ id: 'note', phase: 'note' })).join('\n')}\n`);
  const summary = await executeFrozenPlan({
    plan,
    runRoot: dir,
    execute: true,
    transport: (body) => {
      assert.equal(body.equals(bytes), true);
      return { status: 200, body: Buffer.from('{"usage":{"input_tokens":1,"output_tokens":1}}') };
    },
  });
  assert.equal(summary.calls, 1);
  assert.equal(summary.stopped, null);
  const blocked = mkdtempSync(join(tmpdir(), 'decision1-armed-cap-'));
  const second = materialize(blocked, 1);
  const armedLines = [];
  for (let index = 0; index < 8; index += 1) {
    armedLines.push(JSON.stringify({ id: `old-${index}`, phase: 'armed' }));
    armedLines.push(JSON.stringify({ id: `old-${index}`, phase: 'responded' }));
  }
  writeFileSync(join(blocked, 'attempts.jsonl'), `${armedLines.join('\n')}\n`);
  const capped = await executeFrozenPlan({
    plan: second.plan,
    runRoot: blocked,
    execute: true,
    transport: () => { throw new Error('must not send'); },
  });
  assert.equal(capped.calls, 0);
  assert.equal(capped.stopped, 'attempt-cap');
  rmSync(dir, { recursive: true, force: true });
  rmSync(blocked, { recursive: true, force: true });
});

test('the plan hash is enforced before auth and node https posts the exact bytes', async () => {
  const planPath = join(root, 'evals/seo-aeo/plans/input-plan.v2.json');
  const empty = mkdtempSync(join(tmpdir(), 'decision1-hash-'));
  let spawned = false;
  await assert.rejects(() => main([
    '--execute', '--plan', planPath, '--run-root', empty, '--plan-sha', 'abc',
    '--az', process.execPath, '--endpoint', DECISION1_ENDPOINT, '--resource', 'https://cognitiveservices.azure.com',
  ], { spawnImpl() { spawned = true; } }), /plan file does not match/);
  assert.equal(spawned, false);
  await assert.rejects(() => main([
    '--execute', '--plan', planPath, '--run-root', empty, '--plan-sha', PLAN_V2_SHA256,
    '--az', process.execPath, '--endpoint', DECISION1_ENDPOINT, '--resource', 'https://cognitiveservices.azure.com',
  ], { spawnImpl() { spawned = true; } }), /request file is missing/);
  assert.equal(spawned, false);
  const mutated = mkdtempSync(join(tmpdir(), 'decision1-mutated-'));
  const mutatedPlan = join(mutated, 'plan.json');
  writeFileSync(mutatedPlan, Buffer.concat([planBytes, Buffer.from(' ')]));
  const mutatedSha = createHash('sha256').update(readFileSync(mutatedPlan)).digest('hex');
  await assert.rejects(() => main([
    '--execute', '--plan', mutatedPlan, '--run-root', empty, '--plan-sha', mutatedSha,
    '--az', process.execPath, '--endpoint', DECISION1_ENDPOINT, '--resource', 'https://cognitiveservices.azure.com',
  ], { spawnImpl() { spawned = true; } }), /reviewed v2 plan/);
  assert.equal(spawned, false);
  const token = 'unit-token-value';
  const posted = [];
  const child = {
    stdout: { on(event, fn) { if (event === 'data') fn(`${token}\n`); } },
    stderr: { on() {} },
    on(event, fn) { if (event === 'close') fn(0); },
  };
  const got = await readAzAccessToken({ azBin: 'az', resource: 'https://cognitiveservices.azure.com', spawnImpl: () => child });
  assert.equal(got, token);
  const response = await postHttps({
    endpoint: DECISION1_ENDPOINT,
    body: Buffer.from('{"state":{"answer_text":"x"}}'),
    token,
    requestImpl(url, options, callback) {
      posted.push({ href: url.href, authorization: options.headers.authorization, length: options.headers['content-length'] });
      const res = {
        statusCode: 200,
        on(event, fn) {
          if (event === 'data') fn(Buffer.from('{"usage":{"input_tokens":1,"output_tokens":1}}'));
          if (event === 'end') fn();
        },
      };
      callback(res);
      return { on() {}, destroy() {}, end() {} };
    },
  });
  assert.equal(response.status, 200);
  assert.equal(posted[0].href, DECISION1_ENDPOINT);
  assert.equal(posted[0].authorization, `Bearer ${token}`);
  assert.equal(posted.length, 1);
  let destroyed = false;
  await assert.rejects(() => postHttps({
    endpoint: DECISION1_ENDPOINT,
    body: Buffer.from('x'),
    token,
    requestImpl() {
      const handlers = {};
      return {
        on(event, fn) { handlers[event] = fn; },
        destroy() { destroyed = true; },
        end() { handlers.timeout(); },
      };
    },
  }), /timed out/);
  assert.equal(destroyed, true);
  await assert.rejects(() => postHttps({
    endpoint: DECISION1_ENDPOINT,
    body: Buffer.from('x'),
    token,
    requestImpl() {
      const handlers = {};
      return {
        on(event, fn) { handlers[event] = fn; },
        destroy() {},
        end() { handlers.error(new Error(`socket ${token}`)); },
      };
    },
  }), (error) => {
    assert.equal(error.message.includes(token), false);
    assert.match(error.message, /redacted/);
    return true;
  });
  rmSync(empty, { recursive: true, force: true });
  rmSync(mutated, { recursive: true, force: true });
});

test('the exported bundle fails closed before any request when flags are missing', () => {
  const out = mkdtempSync(join(tmpdir(), 'sender-bundle-'));
  exportDecision1Sender(out);
  assert.throws(() => execFileSync(process.execPath, ['send.mjs', '--execute'], { cwd: out, encoding: 'utf8', stdio: 'pipe' }), (error) => {
    assert.equal(error.status, 1);
    assert.match(`${error.stderr}`, /missing --plan/);
    assert.doesNotMatch(`${error.stderr}`, /Bearer|accessToken/);
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
