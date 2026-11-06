import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import test from 'node:test';
import { eventually, withChrome } from '../support/chrome.mjs';
import { dist, root } from '../support/root.mjs';

// Small phones must never scroll sideways. Mobile emulation matters: a phone
// browser widens its layout viewport to fit overflow seen during load (for
// example a transformed entrance animation), so innerWidth growing past
// clientWidth is the symptom, not just scrollWidth.
const widths = [320, 375];
const posts = readdirSync(join(root, 'src', 'content', 'blog'))
  .filter((file) => file.endsWith('.md'))
  .filter((file) => !/^draft:\s*true\s*$/m.test(readFileSync(join(root, 'src', 'content', 'blog', file), 'utf8')))
  .map((file) => `/blog/${file.replace(/\.md$/, '')}/`);
const routes = ['/', '/blog/', ...posts, '/recommends/', '/projects/', '/privacy/', '/404.html'];

const types = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2' };

async function startStaticServer() {
  const server = createServer((request, response) => {
    const requested = normalize(join(dist, decodeURIComponent(new URL(request.url, 'http://localhost').pathname)));
    const file = existsSync(requested) && !requested.endsWith('/') && extname(requested) ? requested : join(requested, 'index.html');
    if (!file.startsWith(dist) || !existsSync(file)) return response.writeHead(404).end();
    response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    response.end(readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

const measure = `(async () => {
  const timeout = new Promise((resolve) => setTimeout(resolve, 5000));
  await Promise.race([Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {}))), timeout]);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const page = document.documentElement;
  return { href: location.href, readyState: document.readyState, clientWidth: page.clientWidth, scrollWidth: page.scrollWidth, innerWidth };
})()`;

test('main routes do not scroll sideways on small phones', async () => {
  assert.ok(existsSync(dist), 'dist must exist; run the production build first');
  const { server, origin } = await startStaticServer();
  const failures = [];
  try {
    await withChrome(async (cdp) => {
      for (const width of widths) {
        await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 740, deviceScaleFactor: 2, mobile: true });
        for (const route of routes) {
          const url = `${origin}${route}?overflow=${width}`;
          await cdp.send('Page.navigate', { url });
          const result = await eventually(async () => {
            const evaluation = await cdp.send('Runtime.evaluate', { expression: measure, awaitPromise: true, returnByValue: true });
            const value = evaluation.result?.value;
            assert.equal(value?.href, url, 'measurement must observe the requested page');
            assert.equal(value.readyState, 'complete');
            return value;
          }, 15_000);
          if (result.scrollWidth > result.clientWidth || result.innerWidth > width) {
            failures.push(`${width}px ${route}: scrollWidth ${result.scrollWidth}, innerWidth ${result.innerWidth}, clientWidth ${result.clientWidth}`);
          }
        }
      }
    }, { label: 'horizontal overflow browser session' });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  assert.deepEqual(failures, [], `pages overflow horizontally:\n${failures.join('\n')}`);
});
