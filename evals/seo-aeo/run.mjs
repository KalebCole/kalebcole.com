#!/usr/bin/env node
// SEO and AEO eval runner. Manual only: never part of npm test, the build,
// or PR CI. See README.md.
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { createAdapterRegistry } from './lib/adapters/index.mjs';
import { loadEnv } from './lib/env.mjs';
import { loadDefinitions } from './lib/load.mjs';
import { executeRun, formatPlan, importManual, planRun, rescoreRun } from './lib/runner.mjs';
import { syntheticDecision1Example } from './lib/decision1-strict.mjs';
import { assertPlanV2Document, verifyPlanFiles } from './lib/decision1-send.mjs';
import { loadStrictJudgeRequest, persistRawResponse, prepareStrictValidation, validateStrictPreparation } from './lib/strict-judge.mjs';
import { loadStrictRubric, readExtractionFile, renderStrictVisibilityReport, scoreStrictVisibility, verifyFrozenQuestionFiles } from './lib/strict-visibility.mjs';
import { scoreStrictVisibilityV2 } from './lib/strict-visibility-v2.mjs';
import { readFileSync } from 'node:fs';

const USAGE = `Usage: npm run eval:seo-aeo -- <command> [options]

Commands:
  plan                 Preflight only (the default): calls, spend ceiling, skips.
  run                  Run the selected providers and write artifacts.
  import <file>        Import manual UI captures (answer records) and score them.
  report <run-dir>     Rescore a run, optionally with --review decisions.
  validate             Check queries, facts, rubric, config, and frozen question hashes.
  score-strict <file>  Score strict-visibility-win-v1 extractions offline. No network calls.
  score-strict-v2 <file>  Score strict-visibility-win-v2 extractions offline. No network calls. Does not rescore v1.
  prepare-strict <plan>  Write a no-call strict judge plan. Refuses network.
  persist-raw          Store one prepared raw response. Needs --out, --key, --body, and token counts.
  validate-strict      Check a preparation. Does not read gold labels or call a model.
  decision1-example    Print one synthetic Decision-1 request. Does not call a model.
  decision1-verify-plan <plan>  Check a frozen plan. Add --run-root to require exact request files. Does not send.

Options:
  --provider <ids>     Comma-separated provider ids (default: enabled providers).
  --query <ids>        Comma-separated query ids (default: enabled queries).
  --repeats <n>        Repeats per query (default: config.json repeats).
  --max-cost-usd <n>   Lower the per-run spend cap for this run.
  --max-requests <n>   Lower the per-run request cap for this run.
  --fixture <file>     Fixture file for the fixture provider.
  --out <dir>          Artifacts directory (default: evals/seo-aeo/artifacts, gitignored).
  --review <file>      Review decisions (JSON array or JSONL) for report.
  --rescore-with-current
                       Let report rescore a run whose definitions have changed.
  --dry-run            Same as plan.
  --help               Show this help.`;

const list = (value) => (value ? value.split(',').map((item) => item.trim()).filter(Boolean) : undefined);

function number(name, value, config) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`--${name} must be a non-negative number`);
  if (config !== undefined && parsed > config) throw new Error(`--${name} ${parsed} is above the config.json cap ${config}; edit config.json to raise it`);
  return parsed;
}

async function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      provider: { type: 'string' },
      query: { type: 'string' },
      repeats: { type: 'string' },
      'max-cost-usd': { type: 'string' },
      'max-requests': { type: 'string' },
      fixture: { type: 'string' },
      out: { type: 'string' },
      review: { type: 'string' },
      'rescore-with-current': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
      body: { type: 'string' },
      key: { type: 'string' },
      'input-tokens': { type: 'string' },
      'output-tokens': { type: 'string' },
      'run-root': { type: 'string' },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }

  const [command = 'plan', target] = positionals;
  if (command === 'decision1-example') {
    console.log(JSON.stringify(syntheticDecision1Example(), null, 2));
    return 0;
  }
  if (command === 'decision1-verify-plan') {
    if (!target) throw new Error('decision1-verify-plan needs a plan file');
    const plan = JSON.parse(readFileSync(resolve(target), 'utf8'));
    const checked = assertPlanV2Document(plan);
    if (values['run-root']) {
      const files = verifyPlanFiles(plan, resolve(values['run-root']));
      console.log(`verified ${files.length} request files; envelope tokens ${checked.envelope.tokens}; calls 0`);
      return 0;
    }
    console.log(`plan document ok; ${plan.items.length} items; ${checked.totalRequestBytes} request bytes; calls 0`);
    return 0;
  }
  if (command === 'prepare-strict' || command === 'persist-raw' || command === 'validate-strict') {
    if (values.provider) throw new Error(`${command} does not call a provider`);
    loadStrictJudgeRequest();
    if (command === 'prepare-strict') {
      if (!target) throw new Error('prepare-strict needs a plan file');
      if (!values.out) throw new Error('prepare-strict needs --out');
      const plan = JSON.parse(readFileSync(resolve(target), 'utf8'));
      const result = prepareStrictValidation({ dir: resolve(values.out), items: plan.items });
      console.log(`${result.status} ${result.dir} request ${result.manifest.requestSha256} calls ${result.manifest.calls}`);
      return 0;
    }
    if (!values.out) throw new Error(`${command} needs --out`);
    const dir = resolve(values.out);
    if (command === 'persist-raw') {
      if (!values.key || !values.body) throw new Error('persist-raw needs --key and --body');
      const usage = {
        inputTokens: number('input-tokens', values['input-tokens']),
        outputTokens: number('output-tokens', values['output-tokens']),
      };
      const result = persistRawResponse({ dir, idempotenceKey: values.key, body: readFileSync(resolve(values.body)), usage });
      console.log(`${result.status} ${result.sha256}`);
      return 0;
    }
    const report = validateStrictPreparation(dir);
    console.log(`protocol ${report.protocol}; stored ${report.stored}; missing ${report.missing}; judgeAccuracy ${report.judgeAccuracy}; calls ${report.calls}`);
    return 0;
  }
  if (command === 'score-strict') {
    if (!target) throw new Error('score-strict needs an extraction file');
    const rubric = loadStrictRubric();
    const result = scoreStrictVisibility(readExtractionFile(resolve(target)), rubric);
    console.log(renderStrictVisibilityReport(result, rubric));
    return 0;
  }
  if (command === 'score-strict-v2') {
    if (!target) throw new Error('score-strict-v2 needs an extraction file');
    const records = readExtractionFile(resolve(target));
    console.log(JSON.stringify(records.map((record) => scoreStrictVisibilityV2(record)), null, 2));
    return 0;
  }
  const definitions = loadDefinitions();
  if (command === 'validate') {
    verifyFrozenQuestionFiles();
    loadStrictRubric();
    loadStrictJudgeRequest();
    console.log(`Definitions are valid. facts.json status: ${definitions.facts.status}. Frozen question hashes match. Strict judge candidate hash matches.`);
    return 0;
  }
  if (command === 'import') {
    if (!target) throw new Error('import needs a file of captures');
    const result = importManual({ definitions, file: resolve(target), outDir: values.out });
    console.log(`Imported ${result.answers.length} capture(s) into ${result.dir}`);
    return 0;
  }
  if (command === 'report') {
    if (!target) throw new Error('report needs a run directory');
    const result = rescoreRun({ definitions, runDir: resolve(target), reviewFile: values.review && resolve(values.review), allowDefinitionChange: values['rescore-with-current'] });
    console.log(`Rescored ${result.dir}; see report.md and review.jsonl`);
    return 0;
  }
  if (command !== 'plan' && command !== 'run') throw new Error(`Unknown command ${command}\n\n${USAGE}`);

  const { config } = definitions;
  const env = loadEnv({ dir: definitions.dir, files: config.envFiles });
  const registry = createAdapterRegistry({ fixturePath: values.fixture && resolve(values.fixture) });
  const repeats = values.repeats === undefined ? undefined : number('repeats', values.repeats, 5);
  if (repeats !== undefined && (!Number.isInteger(repeats) || repeats < 1)) throw new Error('--repeats must be a whole number from 1 to 5');
  const plan = planRun({
    definitions,
    registry,
    env,
    providerIds: list(values.provider),
    queryIds: list(values.query),
    repeats,
    limits: {
      maxCostUsdPerRun: number('max-cost-usd', values['max-cost-usd'], config.limits.maxCostUsdPerRun),
      maxRequestsPerRun: number('max-requests', values['max-requests'], config.limits.maxRequestsPerRun),
    },
  });
  console.log(formatPlan(plan));
  if (command === 'plan' || values['dry-run']) {
    console.log('\nDry run: nothing was called.');
    return plan.blocked.length ? 1 : 0;
  }
  if (plan.blocked.length) return 1;
  if (plan.runnable.length === 0 && plan.skipped.length === 0) {
    console.log('\nNothing to run.');
    return 0;
  }
  const result = await executeRun({ definitions, plan, env, outDir: values.out });
  console.log(`\nWrote ${result.dir}`);
  for (const group of result.scores.groups) {
    const metrics = Object.entries(group.metrics).map(([name, entry]) => `${name} ${entry.status === 'measured' ? entry.score : entry.status}`).join(', ');
    console.log(`${group.provider}: ${metrics}`);
  }
  if (result.scores.review.length) console.log(`${result.scores.review.length} item(s) need human review: ${result.dir}/review.jsonl`);
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    console.error(error.message);
    process.exit(1);
  },
);
