import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const desktopViewport = { width: 1440, height: 900 };
const centerTolerancePx = 0.75;
const chromeExecutable = process.env.CHROME_BIN
  ?? (existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : null);

function contentType(path) {
  return ({
    '.css': 'text/css',
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
  })[extname(path)] ?? 'application/octet-stream';
}

async function startStaticServer() {
  const server = createServer((request, response) => {
    const requestPath = new URL(request.url, 'http://localhost').pathname;
    const relativePath = requestPath === '/' ? 'index.html' : requestPath.slice(1);
    const requested = normalize(join(dist, relativePath));
    const path = requested.endsWith('/') ? join(requested, 'index.html') : requested;
    const file = existsSync(path) ? path : join(path, 'index.html');
    if (!file.startsWith(dist) || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': contentType(file) });
    response.end(readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    server,
    origin: `http://127.0.0.1:${server.address().port}`,
  };
}

async function eventually(callback, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await callback();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError ?? new Error('Timed out waiting for browser');
}

async function openCdpSocket(debugOrigin) {
  const targets = await eventually(async () => {
    const response = await fetch(`${debugOrigin}/json/list`);
    assert.ok(response.ok, 'Chrome remote-debugging endpoint must respond');
    const pages = await response.json();
    const page = pages.find((target) => target.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, 'Chrome must expose a page CDP target');
    return page;
  });
  const socket = new WebSocket(targets.webSocketDebuggerUrl);
  const messages = new Map();
  let nextId = 1;
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const pending = messages.get(message.id);
    if (pending) {
      messages.delete(message.id);
      pending.resolve(message);
    }
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  return {
    async send(method, params = {}) {
      const id = nextId++;
      const response = new Promise((resolve, reject) => {
        messages.set(id, { resolve, reject });
      });
      socket.send(JSON.stringify({ id, method, params }));
      const message = await response;
      if (message.error) throw new Error(`${method}: ${message.error.message}`);
      return message.result;
    },
    close() { socket.close(); },
  };
}

async function measureCenters(origin) {
  assert.ok(chromeExecutable, 'Set CHROME_BIN to a Chrome-family executable for browser layout certification');
  const profile = await mkdtemp(join(tmpdir(), 'kalebcole-centering-'));
  const debugPort = 9322 + (process.pid % 500);
  const chrome = spawn(chromeExecutable, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank',
  ], { stdio: 'ignore' });
  const debugOrigin = `http://127.0.0.1:${debugPort}`;
  let cdp;
  try {
    cdp = await openCdpSocket(debugOrigin);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: desktopViewport.width,
      height: desktopViewport.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: origin });
    await eventually(async () => {
      const readyState = await cdp.send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
      assert.equal(readyState.result.value, 'complete');
    });
    const evaluation = await cdp.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const primary = document.querySelector('.home-primary-actions');
        const bubbles = [...document.querySelectorAll('.home-elsewhere-bubble')];
        if (!primary || bubbles.length !== 3) throw new Error('Expected CTA pair and three profile bubbles');
        const primaryRect = primary.getBoundingClientRect();
        const boxes = bubbles.map((bubble) => {
          const rect = bubble.getBoundingClientRect();
          const shadow = getComputedStyle(bubble).boxShadow.match(/(-?\\d+(?:\\.\\d+)?)px\\s+(-?\\d+(?:\\.\\d+)?)px/);
          if (!shadow) throw new Error('Expected a measurable bubble stamp shadow');
          return { left: rect.left, right: rect.right, shadowX: Number(shadow[1]) };
        });
        const visibleLeft = Math.min(...boxes.map((box) => Math.min(box.left, box.left + box.shadowX)));
        const visibleRight = Math.max(...boxes.map((box) => Math.max(box.right, box.right + box.shadowX)));
        const ctaCenter = primaryRect.left + primaryRect.width / 2;
        const bubbleFootprintCenter = (visibleLeft + visibleRight) / 2;
        return { ctaCenter, bubbleFootprintCenter, delta: bubbleFootprintCenter - ctaCenter, visibleLeft, visibleRight };
      })()`,
    });
    return evaluation.result.value;
  } finally {
    cdp?.close();
    chrome.kill();
    await rm(profile, { recursive: true, force: true });
  }
}

test('desktop hero profile-bubble footprint is centered under the CTA pair', async () => {
  assert.ok(existsSync(dist), 'dist must exist; run the production build first');
  const { server, origin } = await startStaticServer();
  try {
    const measurement = await measureCenters(origin);
    assert.ok(
      Math.abs(measurement.delta) <= centerTolerancePx,
      `visible bubble footprint must align with CTA center within ${centerTolerancePx}px at ${desktopViewport.width}px; delta was ${measurement.delta.toFixed(2)}px`,
    );
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
