#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertPlanV2Document, verifyPlanFiles } from './lib/decision1-send.mjs';

if (process.argv.includes('--execute')) {
  console.error('sending is disabled in this bundle until a separate review. No request was sent.');
  process.exit(2);
}
const [planPath, runRoot] = process.argv.slice(2);
if (!planPath) {
  console.error('usage: node send.mjs <plan.json> [run-root]');
  process.exit(2);
}
const plan = JSON.parse(readFileSync(resolve(planPath), 'utf8'));
const checked = assertPlanV2Document(plan);
if (runRoot) {
  const files = verifyPlanFiles(plan, resolve(runRoot));
  console.log(`verified ${files.length}; envelope tokens ${checked.envelope.tokens}; calls 0`);
} else {
  console.log(`plan ok; ${plan.items.length} items; ${checked.totalRequestBytes} bytes; calls 0`);
}
