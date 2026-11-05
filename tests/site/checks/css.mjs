import assert from 'node:assert/strict';
import { relative } from 'node:path';
import { budgets, collect, dist, gzipSize, text } from './helpers.mjs';

// Built CSS: per-file budget and required media handling.
export const check = collect('css', async ({ cssFiles }) => {
  assert.ok(cssFiles.length > 0, 'production build must emit CSS');
  for (const path of cssFiles) {
    assert.ok(gzipSize(path) <= budgets.css, `${relative(dist, path)} exceeds compressed CSS budget`);
    const css = text(path);
    assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/i, 'CSS must include reduced-motion handling');
    assert.match(css, /@media\s*\(forced-colors:\s*active\)/i, 'CSS must include forced-colors handling');
    assert.match(css, /@media\s*\(hover:\s*hover\)/i, 'CSS must gate hover-only effects');
    assert.match(css, /env\(safe-area-inset-bottom\)/i, 'CSS must honor safe areas');
    assert.match(css, /:focus-visible/i, 'CSS must provide visible keyboard focus');
  }
});
