import assert from 'node:assert/strict';
import { join, relative } from 'node:path';
import { attribute, collect, dist, matches, text } from './helpers.mjs';

// Writing and Recommends RSS feeds, and which feed each route advertises.
export const check = collect('feeds', async ({ routes, xmlFiles }) => {
  for (const path of xmlFiles) {
    const xml = text(path);
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/i, `${relative(dist, path)} XML declaration`);
    assert.match(xml, /<rss\b[^>]*version="2\.0"/i, `${relative(dist, path)} must be RSS 2.0`);
    const items = matches(xml, /<item>([\s\S]*?)<\/item>/gi).map((match) => match[1]);
    assert.ok(items.length > 0, `${relative(dist, path)} must include items`);
    const dates = items.map((item) => Date.parse(item.match(/<pubDate>(.*?)<\/pubDate>/i)?.[1] ?? ''));
    assert.ok(dates.every(Number.isFinite), `${relative(dist, path)} items must have valid dates`);
    assert.deepEqual(dates, [...dates].sort((a, b) => b - a), `${relative(dist, path)} must be newest first`);
    for (const item of items) {
      assert.match(item, /<title>.+<\/title>/i, 'feed item title');
      assert.match(item, /<description>.+<\/description>/i, 'feed item description');
      const link = item.match(/<link>(.*?)<\/link>/i)?.[1];
      assert.ok(link?.startsWith('https://'), 'feed item links must be absolute HTTPS URLs');
    }
  }

  const recommendsFeed = text(join(dist, 'recommends', 'rss.xml'));
  const writingFeed = text(join(dist, 'rss.xml'));
  assert.match(writingFeed, /<link>https:\/\/kalebcole\.com\/blog\//i, 'Writing feed links must use the production origin');
  assert.doesNotMatch(writingFeed, /kalebcole\.dev/i, 'Writing feed must not retain the former origin');
  assert.doesNotMatch(recommendsFeed, /kalebcole\.dev/i, 'Recommends feed must not retain the former origin');
  assert.match(recommendsFeed, /<category>read<\/category>/i, 'Recommends feed must retain medium categories');
  assert.match(recommendsFeed, /<category>curation<\/category>/i, 'Recommends feed may retain hidden topic categories');

  for (const [route, path] of routes) {
    const html = text(path);
    // Shared footer, feeds: Writing feed on the homepage, Writing index, and articles; Recommends advertises only its own feed.
    const feeds = matches(html, /<link\b[^>]*\brel="alternate"[^>]*\btype="application\/rss\+xml"[^>]*>/gi).map((match) => attribute(match[0], 'href'));
    if (route === '/' || route.startsWith('/blog/')) assert.deepEqual(feeds, ['/rss.xml'], `${route} must advertise only the Writing feed (DESIGN.md Shared footer, feeds)`);
    if (route === '/recommends/') assert.deepEqual(feeds, ['/recommends/rss.xml'], '/recommends/ must advertise only the Recommends feed, never combined with Writing');
  }
});
