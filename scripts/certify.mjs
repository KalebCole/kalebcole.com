// Certify the production build in dist/. Each topic lives in scripts/certify/<topic>.mjs
// and exports check(context), which returns its failures. Add a module to MODULES to run it.
import { existsSync } from 'node:fs';
import { loadContext } from './certify/context.mjs';
import { dist } from './certify/helpers.mjs';

const MODULES = [
  'punctuation',
  'routes',
  'llms-txt',
  'crawlers',
  'page-structure',
  'navigation',
  'meta',
  'json-ld',
  'motion',
  'homepage',
  'writing',
  'projects',
  'recommends',
  'recommend-thumbnails',
  'css',
  'fonts',
  'budgets',
  'icons',
  'feeds',
  'not-found',
  'output',
  'theme-toggle',
];

if (!existsSync(dist)) {
  console.error('certify: dist must exist; run the production build first');
  process.exit(1);
}

const context = loadContext();
const failures = [];
for (const name of MODULES) {
  const { check } = await import(`./certify/${name}.mjs`);
  failures.push(...await check(context));
}

if (failures.length > 0) {
  console.error(`certify failed: ${failures.length} module${failures.length === 1 ? '' : 's'} reported a problem.`);
  for (const { module, message } of failures) console.error(`\n[${module}] ${message}`);
  process.exit(1);
}

console.log(`Certified ${context.routes.size} HTML routes, ${context.xmlFiles.length} feeds, and ${context.productionNames.length} emitted files.`);
console.log('Certified theme toggle icon states.');
