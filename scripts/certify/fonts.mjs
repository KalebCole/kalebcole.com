import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { decompress } from 'wawoff2';
import { budgets, collect, dist, gzipSize, root, walk } from './helpers.mjs';

// DESIGN.md Typography: every web font is a self-hosted WOFF2 with
// font-display: swap. A face with only local() sources is not a web font
// (the metric-matched fallbacks); any face with a url() source is, even when
// it lists local() first.
export function webFontFaceProblems(css) {
  const problems = [];
  for (const face of css.match(/@font-face\s*\{[^}]*\}/gi) ?? []) {
    const sources = [...face.matchAll(/url\(([^)]+)\)/gi)].map((match) => match[1].trim().replace(/^["']|["']$/g, ''));
    if (sources.length === 0) continue;
    if (!/font-display:\s*swap\b/i.test(face)) problems.push(`web font must use font-display: swap (DESIGN.md Typography): ${face.slice(0, 120)}`);
    for (const source of sources) {
      if (!(source.startsWith('/') && source.endsWith('.woff2'))) problems.push(`web font must be a self-hosted WOFF2 file, found ${source}`);
    }
  }
  return problems;
}

// Fonts: payload budget and metric-matched Azeret Mono fallbacks (#161).
export const check = collect('fonts', async ({ builtCss }) => {
  const fontFiles = walk(join(dist, 'fonts')).filter((path) => extname(path) === '.woff2');
  const compressedFonts = fontFiles.reduce((total, path) => total + gzipSize(path), 0);
  assert.ok(compressedFonts <= budgets.fonts, 'compressed font payload exceeds budget');
  // Azeret Mono fallback faces (#161): each local monospace face must be scaled to
  // Azeret's real advance so the font swap cannot rewrap metadata.
  function sfntTable(font, tag) {
    const tables = font.readUInt16BE(4);
    for (let index = 0; index < tables; index += 1) {
      const record = 12 + index * 16;
      if (font.toString('ascii', record, record + 4) === tag) return font.subarray(font.readUInt32BE(record + 8));
    }
    assert.fail(`font is missing its ${tag} table`);
  }
  const azeret = Buffer.from(await decompress(readFileSync(join(root, 'public', 'fonts', 'azeret-mono-latin.woff2'))));
  const azeretUnitsPerEm = sfntTable(azeret, 'head').readUInt16BE(18);
  // The most common nonzero advance in hmtx is the monospace cell (ligature glyphs are multiples of it).
  const azeretHmtx = sfntTable(azeret, 'hmtx');
  const azeretAdvanceCounts = new Map();
  for (let index = 0; index < sfntTable(azeret, 'hhea').readUInt16BE(34); index += 1) {
    const advance = azeretHmtx.readUInt16BE(index * 4);
    if (advance > 0) azeretAdvanceCounts.set(advance, (azeretAdvanceCounts.get(advance) ?? 0) + 1);
  }
  const azeretAdvance = [...azeretAdvanceCounts].sort((first, second) => second[1] - first[1])[0][0] / azeretUnitsPerEm;
  const azeretFallbackAdvances = { Consolas: 1126 / 2048, Menlo: 1233 / 2048, Courier: 1229 / 2048 };

  const fontMetaStack = builtCss.match(/--font-meta:\s*([^;}]+)/)?.[1] ?? '';
  assert.match(
    fontMetaStack,
    /^"Azeret Mono",\s*"Azeret Mono Fallback Consolas",\s*"Azeret Mono Fallback Menlo",\s*"Azeret Mono Fallback Courier",\s*ui-monospace,\s*monospace$/,
    '--font-meta must list the metric-matched Azeret fallbacks before ui-monospace',
  );
  for (const [name, advance] of Object.entries(azeretFallbackAdvances)) {
    const face = builtCss.match(new RegExp(`@font-face\\s*\\{[^}]*font-family:\\s*"?Azeret Mono Fallback ${name}"?;[^}]*\\}`))?.[0];
    assert.ok(face, `Azeret Mono Fallback ${name} @font-face must be emitted`);
    assert.match(face, /src:\s*local\(/, `Azeret Mono Fallback ${name} must use only local fonts`);
    const sizeAdjust = Number(face.match(/size-adjust:\s*([\d.]+)%/)?.[1]) / 100;
    assert.ok(Math.abs(sizeAdjust - azeretAdvance / advance) < 0.0005, `Azeret Mono Fallback ${name} size-adjust must be ${((azeretAdvance / advance) * 100).toFixed(2)}%`);
    assert.match(face, /ascent-override:\s*[\d.]+%/, `Azeret Mono Fallback ${name} must override ascent`);
    assert.match(face, /descent-override:\s*[\d.]+%/, `Azeret Mono Fallback ${name} must override descent`);
  }

  // Typography: self-hosted WOFF2 with font-display: swap for every web font.
  assert.deepEqual(webFontFaceProblems(builtCss), [], 'every web font must be a self-hosted WOFF2 with font-display: swap');
});
