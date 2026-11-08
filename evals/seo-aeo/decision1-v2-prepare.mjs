#!/usr/bin/env node
// v2 preflight and request pinner. The default does not send.
import { mainV2 } from './lib/decision1-v2-run.mjs';

mainV2(process.argv.slice(2)).then((code) => process.exit(code ?? 0), (error) => {
  console.error(error.message);
  process.exit(1);
});
