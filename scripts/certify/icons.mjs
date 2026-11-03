import assert from 'node:assert/strict';
import { join } from 'node:path';
import { attribute, collect, dist, icoDimensions, matches, pngDimensions, text } from './helpers.mjs';

// Favicon and touch icon dimensions, declaration order, and no web manifest or PWA icons (DESIGN.md Open-tail KC identity).
export const check = collect('icons', async ({ routes, productionNames }) => {
  assert.deepEqual(pngDimensions(join(dist, 'favicon-16x16.png')), [16, 16], '16px favicon dimensions');
  assert.deepEqual(pngDimensions(join(dist, 'favicon-32x32.png')), [32, 32], '32px favicon dimensions');
  assert.deepEqual(pngDimensions(join(dist, 'apple-touch-icon.png')), [180, 180], 'touch icon dimensions');
  const icoSizes = icoDimensions(join(dist, 'favicon.ico'));
  assert.ok(icoSizes.some(([width, height]) => width === 16 && height === 16), 'ICO must contain 16px image');
  assert.ok(icoSizes.some(([width, height]) => width === 32 && height === 32), 'ICO must contain 32px image');
  assert.match(text(join(dist, 'favicon.svg')), /viewBox=/i, 'adaptive SVG must declare a viewBox');

  const iconOrder = ['/favicon.ico', '/favicon-16x16.png', '/favicon-32x32.png', '/favicon.svg', '/apple-touch-icon.png'];
  for (const [route, path] of routes) {
    const html = text(path);
    // Open-tail KC identity: ICO and PNG fallbacks before the SVG primary, then the touch icon; no manifest.
    const icons = matches(html, /<link\b[^>]*\brel="(?:icon|apple-touch-icon)"[^>]*>/gi).map((match) => attribute(match[0], 'href'));
    assert.deepEqual(icons, iconOrder, `${route} must declare icons in the DESIGN.md order: ICO, 16px PNG, 32px PNG, SVG, then the Apple touch icon`);
    assert.doesNotMatch(html, /<link\b[^>]*\brel="manifest"/i, `${route} must not link a web manifest until installability is a product decision (DESIGN.md)`);
  }
  assert.equal(
    productionNames.filter((name) => /(?:manifest\.(?:json|webmanifest)|site\.webmanifest|(?:^|[-_])(?:192|512)(?:x(?:192|512))?\.png$)/i.test(name)).length,
    0,
    'production output must not contain a web manifest or 192px/512px PWA icons (DESIGN.md Open-tail KC identity)',
  );
});
