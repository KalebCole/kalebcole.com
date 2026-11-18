import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createPayload, KEY, main, ORIGIN, sitemapUrls, validateUrl } from '../../scripts/indexnow.mjs';

test('accepts canonical site URLs and preserves encoded paths and query strings', () => {
  for (const path of ['/', '/blog/hello-world/', '/recommends/?medium=read', '/blog/a%20b/']) {
    assert.equal(validateUrl(`${ORIGIN}${path}`), `${ORIGIN}${path}`);
  }
});

test('rejects foreign hosts, schemes, credentials, fragments and ambiguous input', () => {
  for (const url of [
    'https://evil.com/', 'https://kalebcole.com.evil.com/', 'https://www.kalebcole.com/',
    'http://kalebcole.com/', 'ftp://kalebcole.com/', 'https://kalebcole.com:444/',
    'https://user:pass@kalebcole.com/', 'https://kalebcole.com/#draft',
    '/blog/', '//kalebcole.com/', ' https://kalebcole.com/', 'https://kalebcole.com/a b',
    'https://kalebcole.com/\\evil', 'garbage',
  ]) assert.throws(() => validateUrl(url), undefined, url);
});

test('payload has public ownership proof, deduplicated URLs and bounded size', () => {
  assert.deepEqual(createPayload([ORIGIN, `${ORIGIN}/`, `${ORIGIN}/projects/`]), {
    host: 'kalebcole.com', key: KEY, keyLocation: `${ORIGIN}/${KEY}.txt`,
    urlList: [`${ORIGIN}/`, `${ORIGIN}/projects/`],
  });
  assert.throws(() => createPayload([]), /1 and 10,000/);
  assert.throws(() => createPayload(Array.from({ length: 10_001 }, (_, i) => `${ORIGIN}/${i}`)), /1 and 10,000/);
  assert.throws(() => createPayload([`${ORIGIN}/`, 'https://evil.com/']));
});

test('sitemap index traversal decodes XML and never submits sitemap files', async () => {
  const requested = [];
  const urls = await sitemapUrls(async (url, options) => {
    requested.push(url);
    assert.equal(options.redirect, 'error');
    return new Response(url.endsWith('sitemap-index.xml')
      ? `<sitemapindex><sitemap><loc>${ORIGIN}/sitemap-0.xml</loc></sitemap></sitemapindex>`
      : `<urlset><url><loc>${ORIGIN}/</loc></url><url><loc>${ORIGIN}/?a=1&amp;b=2</loc></url></urlset>`);
  });
  assert.deepEqual(requested, [`${ORIGIN}/sitemap-index.xml`, `${ORIGIN}/sitemap-0.xml`]);
  assert.deepEqual(urls, [`${ORIGIN}/`, `${ORIGIN}/?a=1&b=2`]);
});

test('sitemap errors and foreign child URLs stop submission', async () => {
  await assert.rejects(() => sitemapUrls(async () => new Response('', { status: 503 })), /503/);
  await assert.rejects(() => sitemapUrls(async () => new Response('<urlset/>')), /Empty sitemap/);
  await assert.rejects(() => sitemapUrls(async () => new Response('<sitemapindex><loc>https://evil.com/map.xml</loc></sitemapindex>')), /Only canonical/);
});

test('dry run prints payload without a network request', async () => {
  const output = [];
  await main(['--dry-run', `${ORIGIN}/projects/`], () => assert.fail('unexpected request'), (line) => output.push(line));
  assert.deepEqual(JSON.parse(output[0]), createPayload([`${ORIGIN}/projects/`]));
  await assert.rejects(() => main(['--unknown']), /Unknown option/);
  await assert.rejects(() => main(['--from-sitemap', ORIGIN]), /not both/);
});

test('submission POST accepts only HTTP 200 and 202 and reports status', async () => {
  for (const status of [200, 202, 204, 400, 403, 422, 429, 500]) {
    const output = [];
    const submit = () => main([`${ORIGIN}/`], async (url, options) => {
      assert.equal(url, 'https://api.indexnow.org/indexnow');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['Content-Type'], 'application/json; charset=utf-8');
      assert.deepEqual(JSON.parse(options.body), createPayload([`${ORIGIN}/`]));
      return new Response(null, { status });
    }, (line) => output.push(line));
    if ([200, 202].includes(status)) await submit();
    else await assert.rejects(submit, new RegExp(`HTTP ${status}`));
    assert.match(output[0], new RegExp(`HTTP ${status}`));
  }
});

test('CLI returns nonzero on invalid input', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../../scripts/indexnow.mjs', import.meta.url)), 'https://evil.com/'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Only canonical/);
});
