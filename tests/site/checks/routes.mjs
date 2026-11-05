import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { collect, dist, localAsset, root, text, walk } from './helpers.mjs';

// Every expected route, feed, the résumé PDF, and Google verification files are emitted.
export const check = collect('routes', async ({ routes, expectedRoutes }) => {
  for (const route of expectedRoutes) {
    assert.ok(routes.has(route), `production build must emit ${route}`);
  }
  for (const feed of ['/rss.xml', '/recommends/rss.xml']) {
    assert.ok(existsSync(localAsset(feed)), `production build must emit ${feed}`);
  }

  const resumePdf = localAsset('/resume.pdf');
  assert.ok(existsSync(resumePdf), 'production build must emit /resume.pdf');
  const resumeBytes = readFileSync(resumePdf);
  assert.equal(resumeBytes.subarray(0, 5).toString('ascii'), '%PDF-', '/resume.pdf must be a valid PDF');
  assert.ok(resumeBytes.byteLength > 10_000, '/resume.pdf must not be an empty placeholder');

  for (const path of walk(join(root, 'public')).filter((path) => /^google[a-f0-9]+\.html$/.test(relative(join(root, 'public'), path)))) {
    assert.equal(text(join(dist, relative(join(root, 'public'), path))), text(path), 'Google verification output must match its source');
  }
});
