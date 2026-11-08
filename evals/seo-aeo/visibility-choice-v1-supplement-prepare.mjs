#!/usr/bin/env node
// Two-slot supplement preflight. The default prints the eligible ids and does not send.
import { mainSupplement } from './lib/visibility-choice-v1-supplement.mjs';

mainSupplement(process.argv.slice(2)).then((code) => process.exit(code ?? 0), (error) => {
  console.error(error.message);
  process.exit(1);
});
