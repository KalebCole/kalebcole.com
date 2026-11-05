import assert from 'node:assert/strict';
import { collect } from './helpers.mjs';

// No prototype or comparison routes in production output.
export const check = collect('output', async ({ productionNames }) => {
  assert.equal(
    productionNames.filter((name) => /(?:prototype|comparison|compare|variant)/i.test(name)).length,
    0,
    'production output must not contain prototype or comparison routes',
  );
});
