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
const chromeExecutable = process.env.CHROME_BIN
  ?? (existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : null);
const inlineActionsViewport = 1024;

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
    if (!file.startsWith(dist) || !existsSync(file)) return response.writeHead(404).end();
    response.writeHead(200, { 'content-type': contentType(file) });
    response.end(readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

async function eventually(callback, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try { return await callback(); } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError ?? new Error('Timed out waiting for browser');
}

async function openCdpSocket(debugOrigin) {
  const target = await eventually(async () => {
    const response = await fetch(`${debugOrigin}/json/list`);
    assert.ok(response.ok, 'Chrome remote-debugging endpoint must respond');
    const page = (await response.json()).find((candidate) => candidate.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, 'Chrome must expose a page CDP target');
    return page;
  });
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const messages = new Map();
  let nextId = 1;
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const pending = messages.get(message.id);
    if (pending) { messages.delete(message.id); pending.resolve(message); }
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  return {
    async send(method, params = {}) {
      const id = nextId++;
      const response = new Promise((resolve) => messages.set(id, { resolve }));
      socket.send(JSON.stringify({ id, method, params }));
      const message = await response;
      if (message.error) throw new Error(`${method}: ${message.error.message}`);
      return message.result;
    },
    close() { socket.close(); },
  };
}

async function withBrowser(origin, callback) {
  assert.ok(chromeExecutable, 'Set CHROME_BIN to a Chrome-family executable for browser layout certification');
  const profile = await mkdtemp(join(tmpdir(), 'kalebcole-inline-actions-'));
  const debugPort = 9322 + (process.pid % 500);
  const chrome = spawn(chromeExecutable, [
    '--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank',
  ], { stdio: 'ignore' });
  const cdp = await openCdpSocket(`http://127.0.0.1:${debugPort}`);
  try {
    await cdp.send('Page.enable');
    await callback(cdp, origin);
  } finally {
    cdp.close();
    chrome.kill();
    await new Promise((resolve) => chrome.once('exit', resolve));
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

async function setViewport(cdp, width, height = 900) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
}

async function navigate(cdp, url) {
  await cdp.send('Page.navigate', { url });
  await eventually(async () => {
    const state = await cdp.send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
    assert.equal(state.result.value, 'complete');
  });
  await new Promise((resolve) => setTimeout(resolve, 2_300));
}

async function layout(cdp) {
  const evaluation = await cdp.send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
    const rect = (element) => { const box = element.getBoundingClientRect(); return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height }; };
    const actions = document.querySelector('.home-actions');
    const primary = document.querySelector('.home-primary-actions');
    const elsewhere = document.querySelector('.home-elsewhere');
    const ctas = [...primary.querySelectorAll('.home-action')];
    const bubbles = [...document.querySelectorAll('.home-elsewhere-bubble')];
    if (!actions || !primary || !elsewhere || bubbles.length !== 3) throw new Error('Expected action cluster, CTA pair, and three bubbles');
    return {
      actions: rect(actions), primary: rect(primary), elsewhere: rect(elsewhere), ctas: ctas.map(rect), bubbles: bubbles.map(rect),
      actionsDisplay: getComputedStyle(actions).display, actionsDirection: getComputedStyle(actions).flexDirection,
      gap: getComputedStyle(actions).gap, scrollWidth: document.documentElement.scrollWidth, innerWidth: innerWidth,
      bubbleSizes: bubbles.map((bubble) => ({ width: getComputedStyle(bubble).width, height: getComputedStyle(bubble).height })),
      links: bubbles.map((bubble) => ({ href: bubble.href, label: bubble.getAttribute('aria-label'), target: bubble.getAttribute('target') })),
    };
  })()` });
  return evaluation.result.value;
}

async function socialMarkContrasts(cdp) {
  const evaluation = await cdp.send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
    const bubbles = [...document.querySelectorAll('.home-elsewhere-bubble')];
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const rgb = (value) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    };
    const luminance = ([red, green, blue]) => [red, green, blue].map((channel) => {
      const normalized = channel / 255;
      return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
    }).reduce((total, channel, index) => total + channel * [.2126, .7152, .0722][index], 0);
    const contrast = (foreground, background) => {
      const [lighter, darker] = [luminance(rgb(foreground)), luminance(rgb(background))].sort((a, b) => b - a);
      return (lighter + .05) / (darker + .05);
    };
    return bubbles.map((bubble) => {
      const mark = getComputedStyle(bubble.querySelector('svg'));
      const mount = getComputedStyle(bubble);
      return { hovered: bubble.matches(':hover'), mark: mark.color, mount: mount.backgroundColor, contrast: contrast(mark.color, mount.backgroundColor) };
    });
  })()` });
  assert.ok(!evaluation.exceptionDetails, `contrast measurement must evaluate: ${evaluation.exceptionDetails?.exception?.description ?? evaluation.exceptionDetails?.text}`);
  return evaluation.result.value;
}

function assertDesktopInline(measurement, width) {
  assert.equal(measurement.actionsDisplay, 'flex', `${width}px action cluster uses flex composition`);
  assert.equal(measurement.actionsDirection, 'row', `${width}px bubbles share the desktop CTA row`);
  assert.ok(measurement.elsewhere.left > measurement.primary.right, `${width}px bubble group is to the right of the primary CTA pair`);
  assert.ok(measurement.elsewhere.left - measurement.primary.right >= 20, `${width}px cluster preserves a deliberate primary-to-secondary gap`);
  assert.ok(Math.abs((measurement.elsewhere.top + measurement.elsewhere.bottom) / 2 - (measurement.primary.top + measurement.primary.bottom) / 2) <= 1, `${width}px secondary bubbles align with the primary CTA group`);
  assertPrimaryPairIsOneRow(measurement, width);
}

function assertPrimaryPairIsOneRow(measurement, width) {
  assert.equal(measurement.ctas.length, 2, `${width}px includes the two primary CTAs`);
  assert.ok(Math.abs(measurement.ctas[0].top - measurement.ctas[1].top) <= 1, `${width}px primary CTA pair never splits across rows`);
  assert.ok(measurement.ctas[1].left > measurement.ctas[0].right, `${width}px primary CTA order remains left to right`);
}

function assertBubblesBelow(measurement, width) {
  assert.equal(measurement.actionsDisplay, 'flex', `${width}px action cluster uses flex composition`);
  assert.equal(measurement.actionsDirection, 'column', `${width}px bubble group moves below the CTAs`);
  assert.ok(measurement.elsewhere.top >= measurement.primary.bottom + 10, `${width}px bubbles sit immediately below the primary CTA group`);
  const bubbleCenter = (measurement.elsewhere.left + measurement.elsewhere.right) / 2;
  const primaryCenter = (measurement.primary.left + measurement.primary.right) / 2;
  assert.ok(Math.abs(bubbleCenter - primaryCenter) <= 1, `${width}px bubble group is centered under the CTAs`);
  assert.ok(measurement.ctas.every((cta) => cta.bottom <= measurement.elsewhere.top), `${width}px primary CTAs stay together before the bubble row`);
}

test('production hero uses the approved inline-desktop and below-mobile action composition', async () => {
  assert.ok(existsSync(dist), 'dist must exist; run the production build first');
  const { server, origin } = await startStaticServer();
  try {
    await withBrowser(origin, async (cdp) => {
      for (const width of [1440, inlineActionsViewport, inlineActionsViewport + 1]) {
        await setViewport(cdp, width);
        await navigate(cdp, origin);
        const measurement = await layout(cdp);
        assertDesktopInline(measurement, width);
        assert.ok(measurement.scrollWidth <= measurement.innerWidth, `${width}px desktop hero must not introduce horizontal overflow`);
      }
      for (const width of [inlineActionsViewport - 1, 995, 900, 850, 390, 320]) {
        await setViewport(cdp, width);
        await navigate(cdp, origin);
        const measurement = await layout(cdp);
        assertBubblesBelow(measurement, width);
        if (width >= 850) assertPrimaryPairIsOneRow(measurement, width);
        assert.ok(measurement.scrollWidth <= measurement.innerWidth, `${width}px mobile hero must not introduce horizontal overflow`);
      }
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('production hero preserves bubble targets, exact destinations, and same-tab accessibility', async () => {
  assert.ok(existsSync(dist), 'dist must exist; run the production build first');
  const { server, origin } = await startStaticServer();
  try {
    await withBrowser(origin, async (cdp) => {
      await setViewport(cdp, 850);
      await navigate(cdp, origin);
      const measurement = await layout(cdp);
      assert.deepEqual(measurement.bubbleSizes, Array.from({ length: 3 }, () => ({ width: '48px', height: '48px' })));
      assert.deepEqual(measurement.links, [
        { href: 'https://www.linkedin.com/in/kaleb-cole', label: 'Kaleb Cole on LinkedIn, external link', target: null },
        { href: 'https://github.com/KalebCole', label: 'Kaleb Cole on GitHub, external link', target: null },
        { href: 'mailto:kalebcole2021@gmail.com', label: 'Email Kaleb Cole, opens email client', target: null },
      ]);
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('hero action cluster FLIPs as one target at its 1024px inline threshold and respects reduced motion', async () => {
  assert.ok(existsSync(dist), 'dist must exist; run the production build first');
  const { server, origin } = await startStaticServer();
  try {
    await withBrowser(origin, async (cdp) => {
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
        const animate = Element.prototype.animate;
        Element.prototype.animate = function (...args) {
          if (this.matches?.('.home-actions')) window.__homeActionFlips = (window.__homeActionFlips || 0) + 1;
          return animate.call(this, ...args);
        };
      })()` });
      await setViewport(cdp, inlineActionsViewport - 1);
      await navigate(cdp, origin);
      await setViewport(cdp, inlineActionsViewport);
      await new Promise((resolve) => setTimeout(resolve, 100));
      assertDesktopInline(await layout(cdp), inlineActionsViewport);
      const flipCount = await cdp.send('Runtime.evaluate', { expression: 'window.__homeActionFlips || 0', returnByValue: true });
      assert.equal(flipCount.result.value, 1, '1023 to 1024 must animate the single .home-actions target');
      await setViewport(cdp, inlineActionsViewport - 1);
      await new Promise((resolve) => setTimeout(resolve, 100));
      assertBubblesBelow(await layout(cdp), inlineActionsViewport - 1);
      const returnFlipCount = await cdp.send('Runtime.evaluate', { expression: 'window.__homeActionFlips || 0', returnByValue: true });
      assert.equal(returnFlipCount.result.value, 2, '1024 to 1023 must animate the same combined target back');

      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await setViewport(cdp, inlineActionsViewport - 1);
      await navigate(cdp, origin);
      await setViewport(cdp, inlineActionsViewport);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const reduced = await cdp.send('Runtime.evaluate', { expression: 'window.__homeActionFlips || 0', returnByValue: true });
      assert.equal(reduced.result.value, 0, 'reduced motion must reflow without FLIP animation');
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('production hero keeps mount-ink social marks readable across color modes and accessibility states', async () => {
  assert.ok(existsSync(dist), 'dist must exist; run the production build first');
  const { server, origin } = await startStaticServer();
  try {
    await withBrowser(origin, async (cdp) => {
      for (const [mode, widths] of [['light', [1440]], ['dark', [1440, 1024, 995, 390, 320]]]) {
        await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: mode }, { name: 'hover', value: 'hover' }] });
        for (const width of widths) {
          await setViewport(cdp, width);
          await navigate(cdp, origin);
          await cdp.send('Runtime.evaluate', { expression: `document.documentElement.dataset.mode = '${mode}'` });
          await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
          const normal = await socialMarkContrasts(cdp);
          assert.equal(normal.length, 3, `${mode} ${width}px renders three social marks`);
          for (const mark of normal) {
            assert.ok(mark.contrast >= 4.5, mode + ' ' + width + 'px social mark must clear 4.5:1: ' + JSON.stringify(mark));
          }
          if (width === 1440) {
            const bubbleRects = await cdp.send('Runtime.evaluate', { returnByValue: true, expression: `([...document.querySelectorAll('.home-elsewhere-bubble')].map((bubble) => { const rect = bubble.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; }))` });
            for (const [index, point] of bubbleRects.result.value.entries()) {
              await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
              await new Promise((resolve) => setTimeout(resolve, 200));
              const hover = (await socialMarkContrasts(cdp)).find((mark) => mark.hovered);
              assert.ok(hover, `${mode} ${width}px social bubble ${index} receives an actual hover state`);
              assert.ok(hover.contrast >= 3, mode + ' ' + width + 'px hovered social mark must clear 3:1: ' + JSON.stringify(hover));
            }
          }
          const measurement = await layout(cdp);
          if (width >= inlineActionsViewport) assertDesktopInline(measurement, width);
          else assertBubblesBelow(measurement, width);
          assert.ok(measurement.scrollWidth <= measurement.innerWidth, `${mode} ${width}px hero must not introduce horizontal overflow`);
        }
      }

      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
      await setViewport(cdp, 390);
      await navigate(cdp, origin);
      await cdp.send('Runtime.evaluate', { expression: 'document.activeElement?.blur()' });
      let bubbleFocused = false;
      for (let index = 0; index < 16 && !bubbleFocused; index += 1) {
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        const active = await cdp.send('Runtime.evaluate', { expression: "document.activeElement?.matches('.home-elsewhere-bubble')", returnByValue: true });
        bubbleFocused = active.result.value;
      }
      assert.equal(bubbleFocused, true, 'keyboard Tab navigation reaches a social bubble');
      const forcedColors = await cdp.send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
        const bubble = document.activeElement;
        const style = getComputedStyle(bubble);
        const mark = getComputedStyle(bubble.querySelector('svg'));
        return { borderColor: style.borderTopColor, backgroundColor: style.backgroundColor, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, markColor: mark.color };
      })()` });
      assert.notEqual(forcedColors.result.value.borderColor, 'rgba(0, 0, 0, 0)', 'forced colors retains a visible social-bubble border');
      assert.notEqual(forcedColors.result.value.outlineStyle, 'none', 'keyboard focus remains visible in forced colors');
      assert.notEqual(forcedColors.result.value.outlineWidth, '0px', 'keyboard focus retains a non-zero outline width in forced colors');
      assert.notEqual(forcedColors.result.value.markColor, 'rgba(0, 0, 0, 0)', 'forced colors retains a visible social SVG mark');
      assert.notEqual(forcedColors.result.value.markColor, forcedColors.result.value.backgroundColor, 'forced-colors social SVG mark contrasts with its bubble background');
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
