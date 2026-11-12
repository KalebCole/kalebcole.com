import assert from 'node:assert/strict';
import test from 'node:test';

import { staticDocumentKind } from '../scripts/certify-static-documents.mjs';

test('recognizes only the exact search verification payload, not an arbitrary HTML exemption', () => {
  assert.equal(staticDocumentKind('google392a8a65c24b8980.html', 'google-site-verification: google392a8a65c24b8980.html\n'), 'verification');
  assert.equal(staticDocumentKind('google392a8a65c24b8980.html', '<p>Not a verification response</p>'), 'page');
  assert.equal(staticDocumentKind('nested/google392a8a65c24b8980.html', 'google-site-verification: google392a8a65c24b8980.html'), 'page');
});

test('distinguishes generated sitemaps from RSS without exempting unknown XML', () => {
  assert.equal(staticDocumentKind('sitemap-index.xml', '<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>'), 'sitemap');
  assert.equal(staticDocumentKind('sitemap-0.xml', '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'), 'sitemap');
  assert.equal(staticDocumentKind('rss.xml', '<?xml version="1.0"?><rss version="2.0"></rss>'), 'rss');
  assert.equal(staticDocumentKind('sitemap-0.xml', '<unknown/>'), 'rss');
  assert.equal(staticDocumentKind('unknown.xml', '<urlset/>'), 'rss');
});
