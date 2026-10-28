import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import config from '../astro.config.mjs';

const processor = await createMarkdownProcessor(config.markdown ?? {});
const render = async (source) => (await processor.render(source)).code;

test('Astro renders plain, closed, and open Obsidian quote callouts without scripts', async () => {
  const html = await render('> [!quote] Visible quote\n> Always visible.\n\n> [!quote]- Closed quote\n> Hidden until opened.\n\n> [!quote]+ Open quote\n> Open on load.\n');
  assert.match(html, /<div class="callout"[^>]*data-callout="quote"/);
  assert.match(html, /<details\b(?![^>]*\bopen)[^>]*>[\s\S]*?<summary[^>]*>[\s\S]*?Closed quote/);
  assert.match(html, /<details\b[^>]*\bopen(?:="")?[^>]*>[\s\S]*?<summary[^>]*>[\s\S]*?Open quote/);
  assert.doesNotMatch(html, /<script\b|onclick=/);
  assert.doesNotMatch(html, /\[!quote\]/);
});

test('Astro keeps nested callouts inside their parent', async () => {
  const html = await render('> [!note]+ Outer\n> Outer body.\n>\n> > [!quote]- Inner\n> > Inner body.\n');
  assert.match(html, /<details\b[^>]*open[^>]*>[\s\S]*?Outer[\s\S]*?<details\b(?![^>]*\bopen)[^>]*>[\s\S]*?Inner[\s\S]*?<\/details>[\s\S]*?<\/details>/);
});

test('callout-like text inside code is not rendered as a callout', async () => {
  const html = await render('`> [!quote]-`\n\n```text\n> [!quote]+ Not a callout\n[[Private note]]\n```\n');
  assert.doesNotMatch(html, /<details\b|class="callout"/);
  assert.match(html, /\[!quote\]/);
  assert.match(html, /\[\[Private note\]\]/);
});

test('callouts use the site palette and native disclosure affordance, not a theme stylesheet', () => {
  const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');
  assert.match(css, /\.prose \.callout\s*\{[^}]*var\(--soft-blue\)[^}]*var\(--rule\)/);
  assert.match(css, /\.prose summary\.callout-title\s*\{[^}]*cursor: pointer/);
  assert.match(css, /\.prose summary\.callout-title:focus-visible\s*\{[^}]*var\(--blue\)/);
  assert.doesNotMatch(css, /@import[^;]*rehype-callouts/);
});
