import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { join } from 'node:path';
import { fixtures } from '../support/root.mjs';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import remarkXPost from '../../src/lib/remark-x-post.mjs';
import { canonicalStatusUrl, parseXPostBlock, renderXPost } from '../../src/lib/x-post.mjs';

const fixture = readFileSync(join(fixtures, 'x-post', 'writing-with-embed.md'), 'utf8');
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

test('card uses X standard markup with do-not-track and no third-party script', () => {
  const html = renderXPost(base);
  assert.match(html, /^<figure class="x-post"><div class="x-post-card">/);
  assert.match(html, /<blockquote class="twitter-tweet" data-dnt="true" data-conversation="none" cite="https:\/\/x\.com\/Kalebicole\/status\/1850000000000000000" lang="en">/);
  assert.match(html, /<span class="x-post-author">Kaleb Cole<\/span> <span class="x-post-handle">@Kalebicole<\/span>/);
  assert.doesNotMatch(html, /data-x-post-time/, 'a date without a time is left alone');
  assert.match(html, /<a class="x-post-link" href="https:\/\/x\.com\/Kalebicole\/status\/1850000000000000000"><time datetime="2026-11-01">Nov 1, 2026<\/time><span class="sr-only"> on X \(external site\)<\/span><\/a>/);
  assert.match(html, /href="https:\/\/x\.com\/intent\/post\?in_reply_to=1850000000000000000">[\s\S]*?Reply<span class="sr-only"> on X \(external site\)<\/span><\/a>/);
  assert.match(html, /<button class="x-post-action x-post-copy" type="button" data-x-post-copy="https:\/\/x\.com\/Kalebicole\/status\/1850000000000000000" hidden>/, 'Copy link waits for the first-party script');
  assert.match(html, /<a class="x-post-replies" href="https:\/\/x\.com\/Kalebicole\/status\/1850000000000000000">Read replies<span class="sr-only"> on X \(external site\)<\/span><\/a>/);
  assert.match(html, /<span class="x-post-avatar x-post-initial" aria-hidden="true">K<\/span>/, 'no avatar falls back to an initial');
  assert.doesNotMatch(html, /x-post-badge|x-post-reply"|x-post-likes|<figcaption|<script|widgets\.js|target=|twimg/i);
});

test('optional card fields: avatar, badge, reply context, UTC time, caption', () => {
  const html = renderXPost({
    ...base,
    date: '2026-10-08T01:47:16Z',
    avatar: '/x-avatars/kalebicole.webp',
    verified: 'true',
    replyto: '@paulg',
    caption: 'Kaleb on X',
    captionurl: 'https://x.com/Kalebicole/status/1?s=20',
  });
  assert.match(html, /<img class="x-post-avatar" src="\/x-avatars\/kalebicole\.webp" width="48" height="48" loading="lazy" decoding="async" alt="">/);
  assert.match(html, /<svg class="x-post-badge"[^>]*role="img" aria-label="Verified account"/);
  assert.match(html, /<p class="x-post-reply">Replying to <span class="x-post-reply-handle">@paulg<\/span><\/p>/);
  assert.match(html, /<time datetime="2026-10-08T01:47:16Z" data-x-post-time>1:47 AM UTC · Oct 8, 2026<\/time>/, 'times render in UTC and are marked for the local-time script');
  assert.match(html, /<figcaption><a href="https:\/\/x\.com\/Kalebicole\/status\/1">Kaleb on X<\/a><\/figcaption><\/figure>$/);
  assert.throws(() => renderXPost({ ...base, avatar: 'https://pbs.twimg.com/a.jpg' }), /self-hosted/);
  assert.throws(() => renderXPost({ ...base, date: '2026-10-08T01:47:16-07:00' }), /"date" must be/);
});

test('like and reply counts are off by default and show only when given', () => {
  assert.doesNotMatch(renderXPost(base), /likes|Read \d/);
  const html = renderXPost({ ...base, likes: '12953', replies: '1511' });
  assert.match(html, /<span class="x-post-likes">[\s\S]*?13K<span class="sr-only"> likes<\/span><\/span>/);
  assert.match(html, />Read 1\.5K replies</);
  assert.match(renderXPost({ ...base, replies: 1 }), />Read 1 reply</);
  assert.throws(() => renderXPost({ ...base, likes: 'lots' }), /"likes" must be a whole number/);
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
  assert.match(code, /<p>A paragraph of Writing before the embed\.<\/p>\s*<figure class="x-post"><div class="x-post-card">[\s\S]*?<blockquote class="twitter-tweet" data-dnt="true"/);
  assert.ok(code.includes('href="https://x.com/Kalebicole/status/1850000000000000000"'), 'tracking parameters are dropped');
  assert.ok(code.includes('<p>First paragraph with &#x3C;angle brackets> &#x26; "quotes".<br>Second line of the same paragraph.</p><p>A second paragraph.</p>'), code);
  assert.equal((code.match(/class="twitter-tweet"/g) ?? []).length, 1);
  assert.match(code, /<pre class="astro-code/);
  assert.doesNotMatch(code, /<script|x-post\n|language-x-post/);
});
