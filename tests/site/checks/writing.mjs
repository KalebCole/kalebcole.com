import assert from 'node:assert/strict';
import { attribute, collect, matches, text } from './helpers.mjs';

// Writing: homepage writing rows and dates match the Writing index, pinned writing, and the article opening and ending.
export const check = collect('writing', async ({ routes, publishedPostSlugs, homepage, writingIndex }) => {
  assert.match(homepage, /<section\b[^>]*class="recent-writing"[\s\S]*?<div\b[^>]*class="recent-heading"[^>]*\bdata-motion-beat\b[^>]*>[\s\S]*?<h2[^>]*>Recent writing<\/h2>/i, 'Recent writing heading must be a publication motion beat');
  const homepageWritingRows = matches(homepage, /<article\b[^>]*class="writing-row"[^>]*>[\s\S]*?<\/article>/gi)
    .map((match) => match[0]);
  const homepageWritingMotionRows = matches(homepage, /<article\b[^>]*class="writing-row"[^>]*\bdata-motion-beat\b[^>]*>/gi);
  assert.equal(homepageWritingMotionRows.length, homepageWritingRows.length, 'every homepage writing row must be a publication motion beat');
  const writingIndexArchiveRows = matches(writingIndex, /<article\b[^>]*class="writing-row"[^>]*>[\s\S]*?<\/article>/gi)
    .map((match) => match[0]);
  const writingDatePresentation = (row, surface) => {
    const href = row.match(/<h3[^>]*>\s*<a\b[^>]*href="([^"]+)"/i)?.[1];
    const date = row.match(/<time\b[^>]*>([\s\S]*?)<\/time>/i)?.[1]?.replace(/\s+/g, ' ').trim();
    assert.ok(href && date, `${surface} writing rows must expose a linked title and date`);
    return [href, date];
  };
  const writingIndexDates = new Map(writingIndexArchiveRows.map((row) => writingDatePresentation(row, 'Writing index')));
  for (const row of homepageWritingRows) {
    const [href, date] = writingDatePresentation(row, 'homepage');
    assert.equal(writingIndexDates.get(href), date, `homepage Writing date presentation must match the corresponding Writing index row (${href})`);
  }
  const homepagePinnedWriting = homepage.match(/<article\b[^>]*class="pinned-writing"[^>]*>[\s\S]*?<\/article>/i)?.[0];
  const writingIndexPinned = writingIndex.match(/<article\b[^>]*class="pinned-writing"[^>]*>[\s\S]*?<\/article>/i)?.[0];
  const writingIndexUrls = matches(writingIndex, /<(?:h2|h3)[^>]*>\s*<a\b[^>]*href="([^"]+)"/gi).map((match) => match[1]);
  const homepageWritingUrls = [
    homepagePinnedWriting?.match(/<h3[^>]*>\s*<a\b[^>]*href="([^"]+)"/i)?.[1],
    ...matches(homepage, /<article\b[^>]*class="writing-row"[^>]*>[\s\S]*?<h3[^>]*>\s*<a\b[^>]*href="([^"]+)"/gi).map((match) => match[1]),
  ].filter(Boolean);
  assert.equal(Boolean(homepagePinnedWriting), Boolean(writingIndexPinned), 'homepage must use pinned writing whenever the Writing index does');
  if (homepagePinnedWriting) {
    assert.match(homepagePinnedWriting, /class="note-mount"[^>]*aria-label="Overview"/i, 'homepage pinned writing must include its overview');
    assert.match(homepagePinnedWriting, /<h3[^>]*>\s*<a\b/i, 'homepage pinned writing title must follow its section heading at h3');
    assert.match(writingIndexPinned, /<h2[^>]*>\s*<a\b/i, 'Writing index pinned title must retain its default h2 level');
  }
  assert.equal(homepageWritingUrls.length, Math.min(3, writingIndexUrls.length), 'homepage writing must use the deliberate three-item cap');
  assert.deepEqual(homepageWritingUrls, writingIndexUrls.slice(0, 3), 'homepage writing must match the Writing index newest-first chronology');
  assert.doesNotMatch(homepage, /class="year-heading"/i, 'homepage writing preview must not render year headings');
  assert.match(homepage, /class="all-writing-link"[^>]*\bdata-motion-beat\b[^>]*href="\/blog"[^>]*>\s*All writing/i, 'homepage writing preview must end with a motion-enabled All writing link');

  // Writing article: return link, title, one-sentence summary, metadata, sign-off, onward links.
  for (const slug of publishedPostSlugs) {
    const route = `/blog/${slug}/`;
    const html = text(routes.get(route));
    const header = html.match(/<header\b[^>]*class="article-header"[^>]*>([\s\S]*?)<\/header>/i)?.[1] ?? '';
    assert.match(header, /^\s*<a\b[^>]*class="back-link"[^>]*href="\/blog"[^>]*>← Writing<\/a>\s*<h1\b/i, `${route} must open with a visible ← Writing link, then the title (DESIGN.md Writing article)`);
    assert.match(header, /<\/h1>\s*<p\b[^>]*class="article-summary"[^>]*>[^<]+<\/p>/i, `${route} title must be followed by the description summary`);
    const metaLine = header.match(/<p\b[^>]*class="meta-line"[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '';
    assert.match(metaLine, /^\s*<time\b[^>]*datetime="[^"]+"[^>]*>[^<]+<\/time>\s*<span>[1-9]\d* min read<\/span>/i, `${route} metadata must show the publication date, then a reading time of at least one minute`);
    const published = attribute(metaLine.match(/<time\b[^>]*>/i)[0], 'datetime');
    const longDate = new Date(published).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
    const ending = html.match(/<footer\b[^>]*class="article-ending"[^>]*>([\s\S]*?)<\/footer>/i)?.[1] ?? '';
    assert.match(ending, new RegExp(`class="article-signoff"[^>]*>\\s*<p>[^<]*Kaleb</p>\\s*<time\\b[^>]*datetime="${published}"[^>]*>\\s*${longDate}\\s*</time>`), `${route} must end with the Kaleb sign-off and the publication date written out (${longDate})`);
    assert.match(ending, /<nav\b[^>]*>\s*<a\b[^>]*href="\/blog"[^>]*>← All writing<\/a>/i, `${route} must offer ← All writing after the sign-off`);
    // No table of contents, facts box, author bio, or side rail.
    assert.doesNotMatch(html, /class="[^"]*\b(?:toc|table-of-contents|facts-box|author-bio|side-rail)\b/i, `${route} must not add a table of contents, facts box, author bio, or side rail (DESIGN.md Writing article)`);
  }
});
