import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import remarkXPost from '../src/lib/remark-x-post.mjs';
import { canonicalStatusUrl, parseXPostBlock, renderXPost } from '../src/lib/x-post.mjs';

const fixture = readFileSync(new URL('./fixtures/x-post/writing-with-embed.md', import.meta.url), 'utf8');
const base = { url: 'https://x.com/Kalebicole/status/1850000000000000000', author: 'Kaleb Cole', date: '2026-11-01', text: 'Hello.' };

test('status links are canonicalized to x.com without tracking parameters', () => {
  assert.equal(
    canonicalStatusUrl('https://mobile.twitter.com/Kalebicole/statuses/1850000000000000000/?s=20#m').url,
    'https://x.com/Kalebicole/status/1850000000000000000',
  );
  for (const bad of ['', 'http://x.com/a/status/1', 'https://x.com/a', 'https://evil.example/x.com/a/status/1', 'javascript:alert(1)']) {
    assert.throws(() => canonicalStatusUrl(bad), /x-post: "url"/);
  }
});

test('embed uses X standard markup with do-not-track and no script', () => {
  const html = renderXPost(base);
  assert.match(html, /^<figure class="x-post">/);
  assert.match(html, /<blockquote class="twitter-tweet" data-dnt="true" data-conversation="none" cite="https:\/\/x\.com\/Kalebicole\/status\/1850000000000000000" lang="en">/);
  assert.match(html, /<figcaption class="x-post-byline">/);
  assert.match(html, /<span class="x-post-author">Kaleb Cole<\/span> <span class="x-post-handle">@Kalebicole<\/span>/);
  assert.match(html, /<a class="x-post-link" href="https:\/\/x\.com\/Kalebicole\/status\/1850000000000000000"><time datetime="2026-11-01">Nov 1, 2026<\/time> on X<span aria-hidden="true"> ↗<\/span><span class="sr-only"> \(external site\)<\/span><\/a>/);
  assert.doesNotMatch(html, /<script|widgets\.js|target=/i);
});

test('post text is escaped and split into paragraphs', () => {
  const html = renderXPost({ ...base, text: 'a <b> & "c"\nline two\n\nnext' });
  assert.ok(html.includes('<p>a &lt;b&gt; &amp; &quot;c&quot;<br>line two</p><p>next</p>'));
});

test('missing or invalid fields fail the build with a clear message', () => {
  assert.throws(() => renderXPost({ ...base, author: ' ' }), /"author" is required/);
  assert.throws(() => renderXPost({ ...base, date: '2026-02-30' }), /"date" must be/);
  assert.throws(() => renderXPost({ ...base, text: '' }), /post text is required/);
  assert.throws(() => renderXPost({ ...base, lang: 'en"><script>' }), /"lang" must be/);
  assert.throws(() => renderXPost({ ...base, text: `a ${String.fromCodePoint(0x2014)} b` }), /em dash/);
  assert.throws(() => parseXPostBlock('url: x\ncolor: red\n\ntext'), /expected a field/);
});

test('markdown x-post blocks render as the static embed and other code stays code', async () => {
  const processor = await createMarkdownProcessor({ remarkPlugins: [remarkXPost] });
  const { code } = await processor.render(fixture);
  assert.match(code, /<p>A paragraph of Writing before the embed\.<\/p>\s*<figure class="x-post"><blockquote class="twitter-tweet" data-dnt="true"/);
  assert.ok(code.includes('href="https://x.com/Kalebicole/status/1850000000000000000"'), 'tracking parameters are dropped');
  assert.ok(code.includes('<p>First paragraph with &#x3C;angle brackets> &#x26; "quotes".<br>Second line of the same paragraph.</p><p>A second paragraph.</p>'), code);
  assert.equal((code.match(/class="twitter-tweet"/g) ?? []).length, 1);
  assert.match(code, /<pre class="astro-code/);
  assert.doesNotMatch(code, /<script|x-post\n|language-x-post/);
});
