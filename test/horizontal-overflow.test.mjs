import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Small phones must never scroll sideways. Mobile emulation matters: a phone
// browser widens its layout viewport to fit overflow seen during load (for
// example a transformed entrance animation), so innerWidth growing past
// clientWidth is the symptom, not just scrollWidth.
const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const chromeExecutable = process.env.CHROME_BIN
  ?? (existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : null);
const widths = [320, 375];
const posts = readdirSync(join(root, 'src', 'content', 'blog'))
  .filter((file) => file.endsWith('.md'))
  .filter((file) => !/^draft:\s*true\s*$/m.test(readFileSync(join(root, 'src', 'content', 'blog', file), 'utf8')))
  .map((file) => `/blog/${file.replace(/\.md$/, '')}/`);
const routes = ['/', '/blog/', ...posts, '/recommends/', '/projects/', '/404.html'];

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

async function eventually(callback, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try { return await callback(); } catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  throw lastError ?? new Error('Timed out waiting for browser');
}

async function openCdp(debugOrigin) {
  const target = await eventually(async () => {
    const page = (await (await fetch(`${debugOrigin}/json/list`)).json()).find((candidate) => candidate.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, 'Chrome must expose a page target');
    return page;
  });
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 1;
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  return {
    async send(method, params = {}) {
      const id = nextId++;
      const message = await new Promise((resolve) => { pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params })); });
      if (message.error) throw new Error(`${method}: ${message.error.message}`);
      return message.result;
    },
    close: () => socket.close(),
  };
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
  assert.ok(chromeExecutable, 'Set CHROME_BIN to a Chrome-family executable for browser layout certification');
  const { server, origin } = await startStaticServer();
  const profile = await mkdtemp(join(tmpdir(), 'kalebcole-overflow-'));
  const debugPort = 9833 + (process.pid % 500);
  const chrome = spawn(chromeExecutable, [
    '--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank',
  ], { stdio: 'ignore' });
  const cdp = await openCdp(`http://127.0.0.1:${debugPort}`);
  const failures = [];
  try {
    await cdp.send('Page.enable');
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
  } finally {
    cdp.close();
    chrome.kill();
    await new Promise((resolve) => chrome.once('exit', resolve));
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    await new Promise((resolve) => server.close(resolve));
  }
  assert.deepEqual(failures, [], `pages overflow horizontally:\n${failures.join('\n')}`);
});
