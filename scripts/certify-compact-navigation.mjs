import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const chromeCandidates = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const chrome = chromeCandidates.find(existsSync);
assert.ok(chrome, 'compact navigation certification requires Google Chrome or Chromium; set CHROME_BIN when it is not in a standard location');
const expectedMenuLinks = [
  { text: 'Writing', href: '/blog' },
  { text: 'Recommends', href: '/recommends' },
  { text: 'Projects', href: '/projects' },
  { text: 'Résumé', href: '/resume.pdf' },
  { text: 'Feed', href: '/rss.xml' },
];
const mimeTypes = new Map([
  ['.css', 'text/css'],
  ['.html', 'text/html'],
  ['.js', 'text/javascript'],
  ['.mjs', 'text/javascript'],
  ['.svg', 'image/svg+xml'],
  ['.woff2', 'font/woff2'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

function outputPath(url) {
  const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '').replace(/\/$/, '/index.html');
  const output = normalize(join(dist, relative));
  assert.ok(output.startsWith(`${dist}/`) || output === dist, `invalid static route: ${pathname}`);
  return output;
}

const server = createServer((request, response) => {
  try {
    const output = outputPath(request.url ?? '/');
    if (!statSync(output).isFile()) throw new Error('not a file');
    response.writeHead(200, { 'content-type': mimeTypes.get(extname(output)) ?? 'application/octet-stream' });
    response.end(readFileSync(output));
  } catch {
    response.writeHead(404).end('Not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object', 'compact-navigation server must bind a local port');
const origin = `http://127.0.0.1:${address.port}`;
let browser;

try {
  browser = await chromium.launch({ executablePath: chrome, headless: true });
  for (const width of [320, 390, 760]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
    await page.goto(`${origin}/links/`, { waitUntil: 'networkidle' });
    const initial = await page.evaluate(() => {
      const rectangle = (element) => {
        const { left, right, top, bottom, width, height } = element.getBoundingClientRect();
        return { left, right, top, bottom, width, height };
      };
      const nav = document.querySelector('.nav');
      const home = document.querySelector('.site-home');
      const controls = document.querySelector('.nav-controls');
      const toggle = document.querySelector('[data-nav-toggle]');
      if (!nav || !home || !controls || !toggle) throw new Error('shared navigation is missing required controls');
      return {
        viewport: { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth },
        nav: rectangle(nav),
        home: rectangle(home),
        controls: rectangle(controls),
        toggle: rectangle(toggle),
        expanded: toggle.getAttribute('aria-expanded'),
      };
    });

    assert.equal(initial.viewport.width, width, `${width}px must be a real CSS viewport`);
    assert.equal(initial.viewport.scrollWidth, width, `${width}px compact navigation must not create horizontal overflow`);
    for (const [name, bounds] of Object.entries(initial).filter(([name]) => ['nav', 'home', 'controls', 'toggle'].includes(name))) {
      assert.ok(bounds.left >= 0 && bounds.right <= width, `${width}px ${name} must remain inside the viewport`);
    }
    assert.equal(initial.expanded, 'false', `${width}px navigation must begin collapsed`);
    if (width === 320) {
      assert.ok(initial.controls.top >= initial.home.bottom, '320px navigation must reflow controls below the home link');
    }

    await page.locator('[data-nav-toggle]').click();
    const open = await page.evaluate(() => {
      const rectangle = (element) => {
        const { left, right, top, bottom } = element.getBoundingClientRect();
        return { left, right, top, bottom };
      };
      const menu = document.querySelector('.nav-links');
      const toggle = document.querySelector('[data-nav-toggle]');
      const theme = document.querySelector('[data-theme-toggle]');
      const links = [...document.querySelectorAll('.nav-links > a')];
      if (!menu || !toggle || !theme) throw new Error('opened navigation is missing required controls');
      return {
        viewport: { width: innerWidth, height: innerHeight },
        expanded: toggle.getAttribute('aria-expanded'),
        display: getComputedStyle(menu).display,
        menu: rectangle(menu),
        theme: rectangle(theme),
        links: links.map((link) => ({ text: link.textContent.trim(), href: link.getAttribute('href'), bounds: rectangle(link) })),
      };
    });
    const assertInViewport = (name, bounds) => {
      assert.ok(
        bounds.left >= 0 && bounds.right <= open.viewport.width && bounds.top >= 0 && bounds.bottom <= open.viewport.height,
        `${width}px ${name} must remain fully inside the viewport`,
      );
    };
    assert.equal(open.expanded, 'true', `${width}px navigation toggle must expose its open state`);
    assert.equal(open.display, 'flex', `${width}px navigation links must be visible after opening`);
    assert.deepEqual(
      open.links.map(({ text, href }) => ({ text, href })),
      expectedMenuLinks,
      `${width}px navigation must retain the intended primary destinations in order`,
    );
    assertInViewport('opened menu', open.menu);
    assertInViewport('theme control', open.theme);
    for (const link of open.links) {
      assertInViewport(`${link.text} menu link`, link.bounds);
      assert.ok(link.bounds.bottom > link.bounds.top, `${width}px ${link.text} menu link must have a visible hit target`);
    }
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-nav-toggle]').getAttribute('aria-expanded'), 'false', `${width}px Escape must close compact navigation`);
    await page.close();
  }
  console.log('Certified compact navigation at 320px, 390px, and 760px with overflow, reflow, toggle, and Escape checks.');
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
