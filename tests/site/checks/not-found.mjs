import assert from 'node:assert/strict';
import { collect, matches, text } from './helpers.mjs';

// The 404 route (DESIGN.md Shared footer, feeds, and error route).
export const check = collect('not-found', async ({ routes }) => {
  // Shared footer, feeds, and error route: one h1, one candid sentence, plain Home and Writing links, no redirect.
  const notFound = text(routes.get('/404'));
  assert.match(notFound, /<h1\b[^>]*>Page not found<\/h1>/i, '/404 h1 must read Page not found');
  const notFoundMain = notFound.match(/<main\b[\s\S]*?<\/main>/i)?.[0] ?? '';
  assert.deepEqual(matches(notFoundMain, /<a\b[^>]*href="([^"]+)"/gi).map((match) => match[1]), ['/', '/blog'], '/404 must link only to Home and Writing');
  assert.doesNotMatch(notFound, /<meta\b[^>]*http-equiv="refresh"|location\.(?:replace|assign|href\s*=)/i, '/404 must not redirect automatically');
  assert.doesNotMatch(notFoundMain, /<(?:form|input)\b[^>]*(?:search|type="search")/i, '/404 must not include search');
});
