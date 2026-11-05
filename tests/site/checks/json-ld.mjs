import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { ELSEWHERE_LINKS } from '../../../src/lib/elsewhere.mjs';
import { PERSON_ID } from '../../../src/lib/person-schema.mjs';
import { attribute, blogSource, collect, matches, metaContent, site, text } from './helpers.mjs';

// JSON-LD: the homepage Person and one BlogPosting per published post.
export const check = collect('json-ld', async ({ routes, publishedPostSlugs, homepage }) => {
  function decodeEntities(value) {
    return value
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }

  function jsonLdBlocks(html, route) {
    return matches(html, /<script type="application\/ld\+json">(.*?)<\/script>/gs).map((match) => {
      try {
        return JSON.parse(match[1]);
      } catch (error) {
        assert.fail(`${route} JSON-LD must be well formed: ${error.message}`);
      }
    });
  }

  const profileSameAs = ELSEWHERE_LINKS.map((link) => link.href).filter((href) => href.startsWith('https://'));
  const expectedAuthor = { '@type': 'Person', '@id': PERSON_ID, name: 'Kaleb Cole', url: `${site}/`, sameAs: profileSameAs };
  const homepageJsonLd = jsonLdBlocks(homepage, '/');
  assert.equal(homepageJsonLd.length, 1, 'homepage must carry exactly one JSON-LD block');
  assert.equal(homepageJsonLd[0]['@type'], 'Person', 'homepage JSON-LD must be the Person');
  assert.equal(homepageJsonLd[0]['@id'], PERSON_ID, 'homepage Person must expose the shared @id');
  for (const [route, path] of routes) {
    if (route === '/') continue;
    const blocks = jsonLdBlocks(text(path), route);
    const isPost = /^\/blog\/[^/]+\/$/.test(route);
    assert.equal(blocks.length, isPost ? 1 : 0, `${route} must carry ${isPost ? 'one BlogPosting' : 'no'} JSON-LD block`);
  }

  assert.ok(publishedPostSlugs.length > 0, 'site checks need at least one published post');
  for (const slug of readdirSync(blogSource).filter((file) => file.endsWith('.md')).map((file) => file.replace(/\.md$/, ''))) {
    if (!publishedPostSlugs.includes(slug)) assert.ok(!routes.has(`/blog/${slug}/`), `draft writing ${slug} must not be built`);
  }
  for (const slug of publishedPostSlugs) {
    const route = `/blog/${slug}/`;
    assert.ok(routes.has(route), `published writing ${slug} must be built`);
    const html = text(routes.get(route));
    const [posting] = jsonLdBlocks(html, route);
    const canonical = attribute(html.match(/<link\b[^>]*rel="canonical"[^>]*>/i)[0], 'href');
    const published = attribute(html.match(/<time\b[^>]*datetime="[^"]+"[^>]*>/i)[0], 'datetime');
    const updated = html.match(/Updated <time\b[^>]*datetime="([^"]+)"/i)?.[1];
    assert.equal(posting['@context'], 'https://schema.org', `${route} BlogPosting context`);
    assert.equal(posting['@type'], 'BlogPosting', `${route} JSON-LD must be a BlogPosting`);
    assert.equal(`${posting.headline} | Kaleb Cole`, decodeEntities(metaContent(html, 'property', 'og:title')), `${route} BlogPosting headline must match the title`);
    assert.equal(posting.description, decodeEntities(metaContent(html, 'name', 'description')), `${route} BlogPosting description must match the meta description`);
    assert.equal(posting.url, canonical, `${route} BlogPosting url must be canonical`);
    assert.equal(posting.mainEntityOfPage, canonical, `${route} BlogPosting mainEntityOfPage must be canonical`);
    assert.equal(posting.datePublished, published.slice(0, 10), `${route} BlogPosting datePublished must match the visible date`);
    assert.equal(posting.dateModified, (updated ?? published).slice(0, 10), `${route} BlogPosting dateModified must match the visible updated date, or the publication date when there is none`);
    assert.equal(posting.image?.['@type'], 'ImageObject', `${route} BlogPosting must carry an image`);
    assert.equal(posting.image.url, metaContent(html, 'property', 'og:image'), `${route} BlogPosting image must be the page's og:image`);
    assert.equal(String(posting.image.width), metaContent(html, 'property', 'og:image:width'), `${route} BlogPosting image width must match og:image:width`);
    assert.equal(String(posting.image.height), metaContent(html, 'property', 'og:image:height'), `${route} BlogPosting image height must match og:image:height`);
    assert.deepEqual(posting.author, expectedAuthor, `${route} BlogPosting author must be the site Person`);
  }
});
