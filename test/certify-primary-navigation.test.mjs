import assert from 'node:assert/strict';
import test from 'node:test';
import { hasCanonicalResumeLinkInPrimaryNavigation } from '../scripts/certify-primary-navigation.mjs';

test('rejects a résumé link outside primary navigation', () => {
  const html = '<nav aria-label="Primary navigation"><a href="/blog">Writing</a></nav><footer><a href="/resume.pdf">Résumé</a></footer>';
  assert.equal(hasCanonicalResumeLinkInPrimaryNavigation(html), false);
});

test('rejects a primary-navigation résumé link that opens a new tab', () => {
  const html = '<nav aria-label="Primary navigation"><a href="/resume.pdf" target="_blank">Résumé</a></nav>';
  assert.equal(hasCanonicalResumeLinkInPrimaryNavigation(html), false);
});

test('accepts the intended same-tab résumé link in primary navigation', () => {
  const html = '<nav aria-label="Primary navigation"><a href="/resume.pdf">Résumé</a></nav>';
  assert.equal(hasCanonicalResumeLinkInPrimaryNavigation(html), true);
});
