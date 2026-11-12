import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import config from '../astro.config.mjs';

const processor = await createMarkdownProcessor(config.markdown);
const source = '| Feature | Expected |\n| :--- | ---: |\n| Formatting | Preserved |\n| Callouts | Native folding |\n';

test('article tables retain semantics and alignment inside a named keyboard-scroll region', async () => {
  const { code } = await processor.render(source);
  assert.match(code, /<div\b[^>]*class="article-table-scroll"[^>]*role="region"[^>]*aria-label="Table 1"[^>]*tabindex="0"[^>]*>\s*<table>/);
  assert.match(code, /<th\b[^>]*scope="col"[^>]*>Feature<\/th>/);
  assert.match(code, /<th\b[^>]*scope="col"[^>]*>Expected<\/th>/);
  assert.match(code, /<td\b[^>]*align="right"[^>]*>Preserved<\/td>/);
  assert.doesNotMatch(code, /<script\b/);
});

test('multiple article tables have distinct accessible region names', async () => {
  const { code } = await processor.render(`${source}\nSeparate text.\n\n${source}`);
  assert.match(code, /aria-label="Table 1"/);
  assert.match(code, /aria-label="Table 2"/);
  assert.equal((code.match(/class="article-table-scroll"/g) ?? []).length, 2);
});

test('article table styles use site tokens, cell padding, horizontal rules, and local overflow', () => {
  const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');
  assert.match(css, /\.prose \.article-table-scroll\s*\{[^}]*overflow-x: auto/);
  assert.match(css, /\.prose table\s*\{[^}]*width: 100%/);
  assert.match(css, /\.prose thead\s*\{[^}]*var\(--soft-blue\)/);
  assert.match(css, /\.prose :where\(th, td\)\s*\{[^}]*padding:[^}]*vertical-align: top/);
  assert.match(css, /\.prose tbody tr\s*\{[^}]*border-bottom:[^}]*var\(--rule\)/);
  assert.match(css, /\.prose \.article-table-scroll:focus-visible\s*\{[^}]*var\(--blue\)/);
});
