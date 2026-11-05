#!/usr/bin/env node
// SEO and AEO eval runner. Manual only: never part of npm test, the build,
// or PR CI. See README.md.
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { createAdapterRegistry } from './lib/adapters/index.mjs';
import { loadEnv } from './lib/env.mjs';
import { loadDefinitions } from './lib/load.mjs';
import { executeRun, formatPlan, importManual, planRun, rescoreRun } from './lib/runner.mjs';

const USAGE = `Usage: npm run eval:seo-aeo -- <command> [options]

Commands:
  plan                 Preflight only (the default): calls, spend ceiling, skips.
  run                  Run the selected providers and write artifacts.
  import <file>        Import manual UI captures (answer records) and score them.
  report <run-dir>     Rescore a run, optionally with --review decisions.
  validate             Check queries, facts, rubric and config.

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
    },
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }

  const [command = 'plan', target] = positionals;
  const definitions = loadDefinitions();
  if (command === 'validate') {
    console.log(`Definitions are valid. facts.json status: ${definitions.facts.status}.`);
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
