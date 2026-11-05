import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolveSocialImageOrigin } from '../../../src/lib/site-origin.mjs';
import { attribute, budgets, collect, localAsset, matches, metaContent, pngDimensions, site, socialImageOrigin, text } from './helpers.mjs';

// Meta and SEO: canonical, Open Graph and Twitter tags on every route, the homepage title, description and social image, Writing index description, and article social images.
export const check = collect('meta', async ({ routes, homepage, homepageImageUrl, writingIndex }) => {
  for (const [route, path] of routes) {
    const html = text(path);
    const canonical = attribute(html.match(/<link\b[^>]*rel="canonical"[^>]*>/i)?.[0] ?? '', 'href');
    const ogUrl = attribute(html.match(/<meta\b[^>]*property="og:url"[^>]*>/i)?.[0] ?? '', 'content');
    const twitterUrl = metaContent(html, 'name', 'twitter:url');
    if (route === '/404') {
      assert.equal(metaContent(html, 'name', 'robots'), 'noindex', '/404 must ask search engines not to index it');
      assert.equal(canonical, undefined, '/404 must not declare a canonical URL');
      assert.equal(ogUrl, undefined, '/404 must not declare an Open Graph URL');
      assert.equal(twitterUrl, undefined, '/404 must not declare a Twitter URL');
    } else {
      assert.equal(metaContent(html, 'name', 'robots'), undefined, `${route} must stay indexable`);
      assert.ok(canonical?.startsWith(`${site}/`), `${route} canonical must be absolute`);
      assert.equal(ogUrl, canonical, `${route} Open Graph URL must match canonical`);
      assert.equal(twitterUrl, canonical, `${route} Twitter URL must match canonical`);
    }
    for (const property of ['og:title', 'og:description', 'og:type']) {
      assert.match(html, new RegExp(`<meta\\b[^>]*property="${property}"[^>]*content="[^"]+"`, 'i'), `${route} must include ${property}`);
    }
    for (const name of ['description', 'twitter:card', 'twitter:title', 'twitter:description']) {
      assert.match(html, new RegExp(`<meta\\b[^>]*name="${name}"[^>]*content="[^"]+"`, 'i'), `${route} must include ${name}`);
    }
    assert.equal(matches(html, /<meta\b[^>]*name="theme-color"/gi).length, 2, `${route} must include both theme colors`);
    assert.match(html, /<link\b[^>]*rel="alternate"[^>]*type="application\/rss\+xml"/i, `${route} must expose a feed`);
    assert.match(html, /<link\b[^>]*rel="apple-touch-icon"[^>]*sizes="180x180"/i, `${route} must expose the touch icon`);
  }

  const homepageDescription = 'I share what interests me here, along with things that might help someone else learn.';

  const homepageImageAlt = 'Portrait of Kaleb Cole beside his name, homepage description, and open-tail KC mark.';
  assert.equal(resolveSocialImageOrigin(), site, 'local builds must use the production social image origin');
  assert.equal(
    resolveSocialImageOrigin({ VERCEL_ENV: 'preview', VERCEL_URL: 'example-preview.vercel.app' }),
    'https://example-preview.vercel.app',
    'preview builds must use the Vercel deployment origin',
  );
  assert.throws(
    () => resolveSocialImageOrigin({ VERCEL_ENV: 'preview', VERCEL_URL: 'https://example-preview.vercel.app/path' }),
    /bare deployment hostname/,
    'preview deployment origins must reject URLs and paths',
  );
  assert.equal(metaContent(homepage, 'name', 'description'), homepageDescription, 'homepage description must stay first-person');
  // Approved by Kaleb on #156. Keep it under 50 characters so Google does not truncate it.
  const homepageTitle = 'Kaleb Cole | Software engineer in Seattle';
  assert.ok(homepageTitle.length < 50, 'homepage title must stay under 50 characters');
  assert.equal(matches(homepage, /<title>([^<]*)<\/title>/gi).map((match) => match[1]).join('\n'), homepageTitle, 'homepage document title');
  assert.equal(metaContent(homepage, 'property', 'og:title'), homepageTitle, 'homepage Open Graph title');
  assert.equal(metaContent(homepage, 'name', 'twitter:title'), homepageTitle, 'homepage Twitter title');
  assert.equal(metaContent(homepage, 'property', 'og:description'), homepageDescription, 'homepage Open Graph description');
  assert.equal(metaContent(homepage, 'name', 'twitter:description'), homepageDescription, 'homepage Twitter description');
  assert.equal(new URL(homepageImageUrl).origin, socialImageOrigin, 'homepage Open Graph image origin');
  assert.equal(metaContent(homepage, 'property', 'og:image:secure_url'), homepageImageUrl, 'homepage secure Open Graph image');
  assert.equal(metaContent(homepage, 'name', 'twitter:image'), homepageImageUrl, 'homepage Twitter image');
  assert.equal(metaContent(homepage, 'property', 'og:image:type'), 'image/png', 'homepage Open Graph image MIME type');
  assert.equal(metaContent(homepage, 'property', 'og:image:width'), '1200', 'homepage Open Graph image width');
  assert.equal(metaContent(homepage, 'property', 'og:image:height'), '630', 'homepage Open Graph image height');
  assert.equal(metaContent(homepage, 'name', 'twitter:image:width'), '1200', 'homepage Twitter image width');
  assert.equal(metaContent(homepage, 'name', 'twitter:image:height'), '630', 'homepage Twitter image height');
  assert.equal(metaContent(homepage, 'property', 'og:image:alt'), homepageImageAlt, 'homepage Open Graph image alt text');
  assert.equal(metaContent(homepage, 'name', 'twitter:image:alt'), homepageImageAlt, 'homepage Twitter image alt text');

  assert.equal(metaContent(homepage, 'name', 'twitter:card'), 'summary_large_image', 'homepage must request a large Twitter card');
  assert.match(homepageImageUrl, /homepage-[0-9a-f]{12}\.png$/, 'homepage social image URL must use a content hash');
  assert.equal(new URL(metaContent(homepage, 'property', 'og:url')).origin, site, 'preview Open Graph URLs must remain canonical');
  assert.equal(new URL(metaContent(homepage, 'name', 'twitter:url')).origin, site, 'preview Twitter URLs must remain canonical');

  const homepageImage = localAsset(new URL(homepageImageUrl).pathname);
  assert.ok(existsSync(homepageImage), 'homepage social image must exist in the production build');
  assert.deepEqual(pngDimensions(homepageImage), [1200, 630], 'homepage social image dimensions');
  assert.ok(statSync(homepageImage).size <= budgets.socialImage, 'homepage social image exceeds file-size budget');
  const homepageImageHash = createHash('sha256').update(readFileSync(homepageImage)).digest('hex').slice(0, 12);
  assert.equal(
    new URL(homepageImageUrl).pathname,
    `/social/homepage-${homepageImageHash}.png`,
    'homepage social image URL must use the final rendered PNG content hash',
  );

  assert.match(writingIndex, /<title>Writing \| Kaleb Cole<\/title>/i, 'Writing index document title');
  const writingDescription = 'Notes, essays, and half-finished thoughts from Kaleb Cole.';
  assert.equal(metaContent(writingIndex, 'name', 'description'), writingDescription, '/blog/ description must use the approved wording');
  assert.equal(metaContent(writingIndex, 'property', 'og:description'), writingDescription, '/blog/ Open Graph description');
  assert.equal(metaContent(writingIndex, 'name', 'twitter:description'), writingDescription, '/blog/ Twitter description');

  const articlePreview = text(routes.get('/blog/hello-world/'));

  assert.equal(metaContent(articlePreview, 'property', 'og:image'), homepageImageUrl, 'articles must share the homepage Open Graph image');
  assert.equal(metaContent(articlePreview, 'name', 'twitter:image'), homepageImageUrl, 'article Twitter cards must share the homepage image');
});
