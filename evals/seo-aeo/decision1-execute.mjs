#!/usr/bin/env node
// Opt-in Decision-1 sender. Without --execute it only verifies.
// This file does not call the network unless the operator passes --execute.
import { main } from './lib/decision1-send.mjs';

main(process.argv.slice(2)).then((code) => process.exit(code ?? 0), (error) => {
  console.error(error.message);
  process.exit(1);
});
