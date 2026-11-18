import assert from 'node:assert/strict';
import { join } from 'node:path';
import { KEY } from '../../../scripts/indexnow.mjs';
import { collect, dist, root, text } from './helpers.mjs';

export const check = collect('indexnow', async () => {
  assert.match(KEY, /^[a-f0-9]{32}$/, 'IndexNow key must be 32 hex characters');
  const filename = `${KEY}.txt`;
  assert.equal(text(join(root, 'public', filename)), KEY, 'public IndexNow filename and content must match exactly');
  assert.equal(text(join(dist, filename)), KEY, 'built IndexNow file must contain only the key as plain UTF-8 text');
  assert.equal(text(join(root, '.vercel', 'output', 'static', filename)), KEY, 'Vercel static output must preserve the plain text key');
  const config = JSON.parse(text(join(root, 'vercel.json')));
  assert.ok(config.headers.some((entry) => entry.source === `/${filename}` && entry.headers.some((header) =>
    header.key.toLowerCase() === 'content-type' && header.value === 'text/plain; charset=utf-8')),
  'Vercel must serve the built IndexNow file as plain text');
});
