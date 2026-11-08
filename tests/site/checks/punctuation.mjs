import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { FROZEN_EMDASH_EXCEPTION, SUPPLEMENT_CAPTURE_PATHS } from '../../../evals/seo-aeo/lib/frozen-path.mjs';
import { collect, dist, emDash, root, utf8Text } from './helpers.mjs';

// Em dashes: none in tracked files (CONTEXT.md Punctuation) or emitted output.
// The frozen visibility-only question is the one exception: its sha256 is
// pinned, and editing the historical dash would present a different payload
// as that frozen question. New files are still rejected.
export const check = collect('punctuation', async ({ emittedFiles }) => {
  const trackedFiles = execFileSync('git', ['ls-files', '-z'], { cwd: root })
    .toString()
    .split('\0')
    .filter(Boolean)
    .map((path) => join(root, path))
    .filter(existsSync);
  for (const path of trackedFiles) {
    const source = utf8Text(path);
    if (source === null) continue;
    const rel = relative(root, path).split('\\').join('/');
    if (rel === FROZEN_EMDASH_EXCEPTION || SUPPLEMENT_CAPTURE_PATHS.includes(rel)) continue;
    assert.equal(source.includes(emDash), false, `${rel} must not contain em dashes`);
  }

  for (const path of emittedFiles) {
    const source = utf8Text(path);
    if (source === null) continue;
    assert.equal(source.includes(emDash), false, `${relative(dist, path)} must not emit em dashes`);
  }
});
