import assert from 'node:assert/strict';
import test from 'node:test';
import { ELSEWHERE_LINKS } from '../src/lib/elsewhere.mjs';
import { blogPostingSchema, serializeJsonLd } from '../src/lib/json-ld.mjs';
import { PERSON_AUTHOR, PERSON_ID, PERSON_SCHEMA } from '../src/lib/person-schema.mjs';

const post = {
  title: 'A title',
  description: 'A description.',
  url: new URL('https://kalebcole.com/blog/a-title/'),
  date: new Date('2026-07-16T00:00:00Z'),
};

test('BlogPosting names the site Person as its author by shared @id', () => {
  const posting = blogPostingSchema(post);
  assert.equal(posting['@type'], 'BlogPosting');
  assert.equal(posting.headline, 'A title');
  assert.equal(posting.url, 'https://kalebcole.com/blog/a-title/');
  assert.equal(posting.datePublished, '2026-07-16');
  assert.equal('dateModified' in posting, false, 'dateModified is omitted without an updated date');
  assert.equal(posting.author, PERSON_AUTHOR);
  assert.equal(PERSON_SCHEMA['@id'], PERSON_ID);
  assert.deepEqual(posting.author, {
    '@type': 'Person',
    '@id': 'https://kalebcole.com/#person',
    name: 'Kaleb Cole',
    url: 'https://kalebcole.com/',
    sameAs: ELSEWHERE_LINKS.map((link) => link.href).filter((href) => href.startsWith('https://')),
  });
});

test('BlogPosting carries dateModified when the post was updated', () => {
  assert.equal(blogPostingSchema({ ...post, updated: new Date('2026-08-01T00:00:00Z') }).dateModified, '2026-08-01');
});

test('serialized JSON-LD round-trips and cannot close its script element', () => {
  const posting = blogPostingSchema({ ...post, title: 'Ends </script><script>alert(1)</script>' });
  const serialized = serializeJsonLd(posting);
  assert.equal(serialized.includes('<'), false);
  assert.deepEqual(JSON.parse(serialized), posting);
});
