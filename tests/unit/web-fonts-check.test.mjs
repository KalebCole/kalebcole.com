import assert from 'node:assert/strict';
import test from 'node:test';
import { webFontFaceProblems } from '../site/checks/fonts.mjs';

test('local-only fallback faces are not web fonts', () => {
  assert.deepEqual(webFontFaceProblems('@font-face{font-family:"Azeret Mono Fallback Menlo";src:local("Menlo");size-adjust:98%}'), []);
});

test('a self-hosted WOFF2 face with font-display: swap passes, local() first or not', () => {
  assert.deepEqual(webFontFaceProblems('@font-face{font-family:Inter;src:url(/fonts/inter.woff2) format("woff2");font-display:swap}'), []);
  assert.deepEqual(webFontFaceProblems('@font-face{font-family:Inter;src:local("Inter"),url("/fonts/inter.woff2") format("woff2");font-display:swap}'), []);
});

test('a local() first web font is still checked for font-display: swap and self-hosted WOFF2', () => {
  assert.match(webFontFaceProblems('@font-face{font-family:Inter;src:local("Inter"),url(/fonts/inter.woff2);font-display:block}').join('\n'), /font-display: swap/);
  assert.match(webFontFaceProblems('@font-face{font-family:Inter;src:local("Inter"),url(https://fonts.example.com/inter.woff2);font-display:swap}').join('\n'), /self-hosted WOFF2 file, found https:\/\/fonts\.example\.com\/inter\.woff2/);
  assert.match(webFontFaceProblems('@font-face{font-family:Inter;src:local(Inter),url(/fonts/inter.ttf);font-display:swap}').join('\n'), /found \/fonts\/inter\.ttf/);
});
