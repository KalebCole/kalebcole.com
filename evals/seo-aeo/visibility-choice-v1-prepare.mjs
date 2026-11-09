#!/usr/bin/env node
// Single-choice preflight. The default prints the 24 slots and does not send.
import { mainChoice } from './lib/visibility-choice-v1.mjs';

mainChoice(process.argv.slice(2)).then((code) => process.exit(code ?? 0), (error) => {
  console.error(error.message);
  process.exit(1);
});
