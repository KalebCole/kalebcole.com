import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { collect, dist, root, site, text } from './helpers.mjs';

// Sitemap and robots.txt.
export const check = collect('crawlers', async ({ expectedRoutes }) => {
  const sitemapIndex = text(join(dist, 'sitemap-index.xml'));
  const sitemap = text(join(dist, 'sitemap-0.xml'));
  assert.match(sitemapIndex, /<sitemapindex\b[\s\S]*?<loc>https:\/\/kalebcole\.com\/sitemap-0\.xml<\/loc>/, 'sitemap index must reference the canonical sitemap');
  assert.match(sitemap, /<urlset\b/, 'sitemap must contain a URL set');
  assert.ok(!sitemap.includes(`<loc>${site}/404`), 'sitemap must not include the 404 page');
  for (const name of readdirSync(join(root, 'src', 'content', 'blog')).filter((file) => file.endsWith('.md'))) {
    if (/^draft:\s*true\s*$/m.test(text(join(root, 'src', 'content', 'blog', name)))) {
      assert.ok(!sitemap.includes(`/blog/${name.replace(/\.md$/, '')}/`), `sitemap must not include draft writing ${name}`);
    }
  }
  const robots = text(join(dist, 'robots.txt'));
  assert.match(robots, /^User-agent: \*$/m, 'robots.txt must address all crawlers');
  assert.doesNotMatch(robots, /^Disallow: \S/m, 'robots.txt must not block any path');
  assert.match(robots, new RegExp(`^Sitemap: ${site}/sitemap-index\\.xml$`, 'm'), 'robots.txt must point to the sitemap index');
  for (const route of expectedRoutes.filter((route) => route !== '/404')) {
    assert.ok(sitemap.includes(`<loc>${site}${route}</loc>`), `sitemap must include ${route}`);
  }
});
