import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Measured DESIGN.md rules, checked in headless Chrome on the production build.
// Each check waits for a settled page (exact URL, readyState complete, fonts,
// every image decoded, video metadata, finished animations, two frames) before
// it measures, so nothing depends on a fixed sleep. A load that never settles
// fails with its reason instead of measuring a half-loaded page.
const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const blogSource = join(root, 'src', 'content', 'blog');
const chromeExecutable = process.env.CHROME_BIN
  ?? (existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : null);
const posts = readdirSync(blogSource)
  .filter((file) => file.endsWith('.md'))
  .filter((file) => !/^draft:\s*true\s*$/m.test(readFileSync(join(blogSource, file), 'utf8')))
  .map((file) => `/blog/${file.replace(/\.md$/, '')}/`);
const routes = ['/', '/blog/', ...posts, '/recommends/', '/projects/', '/404.html'];
// DESIGN.md, Composition and spacing: "Detailed media breakout: centered on the
// prose column and capped near 56rem." Writing article: "At 760px and below
// they collapse to the container and never widen the page."
const MEDIA_WIDTHS = [1280, 768, 320];
const MEDIA_CAP_REM = 56;
const COMPACT_MAX = 760;
const TOLERANCE = 1;

const types = {
  '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.avif': 'image/avif', '.jpg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm', '.vtt': 'text/vtt', '.pdf': 'application/pdf',
};

// Static server with byte ranges, so Chrome can read video metadata the way it
// does in production. A page requested with ?__nojs is served with its scripts
// removed: the no-JavaScript reading of the page, while the test itself can
// still run measurement code (CDP's script switch would block that too).
async function startStaticServer() {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url, 'http://localhost');
    const requested = normalize(join(dist, decodeURIComponent(requestUrl.pathname)));
    const file = existsSync(requested) && !requested.endsWith('/') && extname(requested) ? requested : join(requested, 'index.html');
    if (!file.startsWith(dist) || !existsSync(file)) return response.writeHead(404).end();
    if (extname(file) === '.html' && requestUrl.searchParams.has('__nojs')) {
      const html = readFileSync(file, 'utf8').replace(/<script\b(?![^>]*type="application\/ld\+json")[\s\S]*?<\/script>/gi, '');
      return response.writeHead(200, { 'content-type': 'text/html' }).end(html);
    }
    const size = statSync(file).size;
    const headers = { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'accept-ranges': 'bytes' };
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '');
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || start > end) return response.writeHead(416, { 'content-range': `bytes */${size}` }).end();
      response.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
      return createReadStream(file, { start, end }).pipe(response);
    }
    response.writeHead(200, { ...headers, 'content-length': size });
    createReadStream(file).pipe(response);
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
      let timer;
      const message = await Promise.race([
        new Promise((resolve) => { pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params })); }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${method} got no answer from Chrome in 30s`)), 30_000); }),
      ]).finally(() => clearTimeout(timer));
      if (message.error) throw new Error(`${method}: ${message.error.message}`);
      return message.result;
    },
    close: () => socket.close(),
  };
}

async function withBrowser(callback) {
  assert.ok(existsSync(dist), 'dist must exist; run the production build first');
  assert.ok(chromeExecutable, 'Set CHROME_BIN to a Chrome-family executable for browser layout certification');
  const { server, origin } = await startStaticServer();
  const profile = await mkdtemp(join(tmpdir(), 'kalebcole-design-layout-'));
  const debugPort = 10_400 + (process.pid % 500);
  const chrome = spawn(chromeExecutable, [
    '--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--autoplay-policy=user-gesture-required', 'about:blank',
  ], { stdio: 'ignore' });
  let cdp;
  try {
    cdp = await openCdp(`http://127.0.0.1:${debugPort}`);
    await cdp.send('Page.enable');
    // Overlay scrollbars, as on phones: the layout viewport is the full emulated width.
    await cdp.send('Emulation.setScrollbarsHidden', { hidden: true });
    await callback(cdp, origin);
  } finally {
    cdp?.close();
    chrome.kill();
    await new Promise((resolve) => chrome.once('exit', resolve));
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    await new Promise((resolve) => server.close(resolve));
  }
}

async function evaluate(cdp, expression) {
  const evaluation = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  assert.ok(!evaluation.exceptionDetails, `page evaluation failed: ${evaluation.exceptionDetails?.exception?.description ?? evaluation.exceptionDetails?.text}`);
  return evaluation.result.value;
}

// Everything the layout depends on, awaited in the page. Lazy images are
// switched to eager so they load now instead of when scrolled to.
const settle = `(async () => {
  const deadline = (ms, what) => new Promise((_, reject) => setTimeout(() => reject(new Error('timed out waiting for ' + what)), ms));
  await Promise.race([document.fonts.ready, deadline(10000, 'fonts')]);
  const images = [...document.images];
  for (const image of images) image.loading = 'eager';
  await Promise.race([Promise.all(images.map(async (image) => {
    if (!image.complete) await new Promise((resolve) => { image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', resolve, { once: true }); });
    if (!image.naturalWidth) throw new Error('image failed to load: ' + image.currentSrc);
    await image.decode().catch(() => {});
  })), deadline(15000, 'images')]);
  await Promise.race([Promise.all([...document.querySelectorAll('video')].map((video) => {
    if (video.preload === 'none' || video.readyState >= 1) return null;
    return new Promise((resolve, reject) => {
      video.addEventListener('loadedmetadata', resolve, { once: true });
      video.addEventListener('error', () => reject(new Error('video failed to load: ' + video.currentSrc)), { once: true });
    });
  })), deadline(15000, 'video metadata')]);
  await Promise.race([Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {}))), deadline(10000, 'animations')]);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return { href: location.href, readyState: document.readyState };
})()`;

let navigationCount = 0;
async function open(cdp, origin, route, { javascript = true } = {}) {
  const url = new URL(route, origin);
  url.searchParams.set('__design', String(++navigationCount));
  if (!javascript) url.searchParams.set('__nojs', '1');
  await cdp.send('Page.navigate', { url: url.href });
  await eventually(async () => {
    const state = await evaluate(cdp, '({ href: location.href, readyState: document.readyState })');
    assert.equal(state.href, url.href, 'measurement must observe the requested page, not the previous one');
    assert.equal(state.readyState, 'complete');
  }, 20_000);
  const settled = await evaluate(cdp, settle);
  assert.equal(settled.href, url.href, 'page must not navigate away while settling');
}

// The rendered media itself, not its frame: a 720px video centered inside an
// 896px breakout frame passes, the same video left-aligned in it fails.
const measureMedia = `(() => {
  const prose = document.querySelector('.article-page .prose');
  if (!prose) throw new Error('article has no .prose column');
  const box = (element) => { const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right, width: rect.width }; };
  const describe = (element) => {
    if (element.matches('figure.x-post')) return 'X post card ' + (element.querySelector('a[href*="/status/"]')?.getAttribute('href') ?? '');
    const source = element.currentSrc || element.getAttribute('src') || element.querySelector('source')?.getAttribute('src') || '';
    return element.localName + ' ' + source.split('/').pop();
  };
  const media = [...prose.querySelectorAll('img, video, iframe, figure.x-post, pre')]
    .filter((element) => !(element.localName === 'img' && element.closest('.x-post')));
  return {
    rootFontSize: parseFloat(getComputedStyle(document.documentElement).fontSize),
    column: box(prose),
    viewport: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    media: media.map((element) => ({ kind: element.localName === 'figure' ? 'x-post' : element.localName, label: describe(element), ...box(element) })),
  };
})()`;

function staticMediaCount(route) {
  const html = readFileSync(join(dist, ...route.split('/').filter(Boolean), 'index.html'), 'utf8');
  const prose = html.match(/<div class="prose">([\s\S]*)<footer class="article-ending">/)?.[1] ?? '';
  const withoutCards = prose.replace(/<figure class="x-post">[\s\S]*?<\/figure>/g, '<figure class="x-post"></figure>');
  return (withoutCards.match(/<(?:img|video|iframe|pre)\b/g) ?? []).length + (prose.match(/<figure class="x-post"/g) ?? []).length;
}

export function mediaFailures(measurement, { route, width, mode }) {
  const failures = [];
  const where = `${route} at ${width}px (${mode})`;
  const cap = MEDIA_CAP_REM * measurement.rootFontSize;
  const columnCenter = (measurement.column.left + measurement.column.right) / 2;
  for (const item of measurement.media) {
    const offset = (item.left + item.right) / 2 - columnCenter;
    if (Math.abs(offset) > TOLERANCE) {
      failures.push(`${where}: ${item.label} is ${offset.toFixed(1)}px off the prose column center (media ${item.left.toFixed(1)}-${item.right.toFixed(1)}, column ${measurement.column.left.toFixed(1)}-${measurement.column.right.toFixed(1)})`);
    }
    if (item.width > cap + TOLERANCE) failures.push(`${where}: ${item.label} is ${item.width.toFixed(1)}px wide, over the ${cap}px (56rem) cap`);
    if (width <= COMPACT_MAX && (item.left < measurement.column.left - TOLERANCE || item.right > measurement.column.right + TOLERANCE)) {
      failures.push(`${where}: ${item.label} (${item.left.toFixed(1)}-${item.right.toFixed(1)}) leaves the ${measurement.column.width.toFixed(1)}px prose column; at 760px and below media stays in the column`);
    }
    if (item.left < -TOLERANCE || item.right > measurement.viewport + TOLERANCE) failures.push(`${where}: ${item.label} runs off the ${measurement.viewport}px viewport`);
  }
  if (measurement.scrollWidth > measurement.viewport) failures.push(`${where}: page scrolls sideways (${measurement.scrollWidth}px > ${measurement.viewport}px)`);
  return failures;
}

test('media failure reporting catches off-center, oversized, and escaping media', () => {
  const column = { left: 200, right: 880, width: 680 };
  const base = { rootFontSize: 16, column, viewport: 1280, scrollWidth: 1280 };
  assert.deepEqual(mediaFailures({ ...base, media: [{ label: 'centered', left: 280, right: 800, width: 520 }] }, { route: '/r/', width: 1280, mode: 'js' }), []);
  assert.match(mediaFailures({ ...base, media: [{ label: 'left', left: 192, right: 912, width: 720 }] }, { route: '/r/', width: 1280, mode: 'js' })[0], /12\.0px off the prose column center/);
  assert.match(mediaFailures({ ...base, media: [{ label: 'wide', left: 140, right: 940, width: 900 }] }, { route: '/r/', width: 1280, mode: 'js' })[0], /over the 896px \(56rem\) cap/);
  assert.match(mediaFailures({ ...base, viewport: 320, scrollWidth: 320, column: { left: 20, right: 300, width: 280 }, media: [{ label: 'escape', left: 10, right: 310, width: 300 }] }, { route: '/r/', width: 320, mode: 'js' })[0], /leaves the 280\.0px prose column/);
});

test('article media is centered on the prose column and capped at 56rem (DESIGN.md media breakout)', async () => {
  const failures = [];
  let measured = 0;
  await withBrowser(async (cdp, origin) => {
    for (const mode of ['js', 'no-js']) {
      for (const width of MEDIA_WIDTHS) {
        await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        for (const route of posts) {
          await open(cdp, origin, route, { javascript: mode === 'js' });
          const measurement = await evaluate(cdp, measureMedia);
          assert.equal(measurement.media.length, staticMediaCount(route), `${route} at ${width}px (${mode}) must measure every image, video, iframe, code block, and X card in its prose`);
          measured += measurement.media.length;
          failures.push(...mediaFailures(measurement, { route, width, mode }));
        }
      }
    }
  });
  assert.ok(measured > 0, 'at least one published post must contain media for this check to mean anything');
  assert.deepEqual(failures, [], `article media must be centered on the prose column and capped at 56rem:\n${failures.join('\n')}`);
});

test('navigation height, touch targets, and text wrapping follow DESIGN.md on every route', async () => {
  const failures = [];
  await withBrowser(async (cdp, origin) => {
    // Composition and spacing: navigation is at least 86px tall. (The 1180px shell
    // maximum is not checked: the code uses 1280px; see the DESIGN.md checks issue.)
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1000, deviceScaleFactor: 1, mobile: false });
    for (const route of routes) {
      await open(cdp, origin, route);
      const nav = await evaluate(cdp, `document.querySelector('nav[aria-label="Primary navigation"]')?.getBoundingClientRect().height ?? 0`);
      if (nav < 86 - TOLERANCE) failures.push(`${route} at 1920px: navigation is ${nav}px tall, under 86px`);
    }
    // Shared navigation: at narrow widths the mode control stays a 44px target;
    // navigation targets (release gates) and Recommends filters reach 44px on coarse pointers.
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 740, deviceScaleFactor: 2, mobile: true });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }] });
    for (const route of routes) {
      await open(cdp, origin, route);
      const value = await evaluate(cdp, `(() => {
        const nav = document.querySelector('nav[aria-label="Primary navigation"]');
        const visible = (element) => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden'; };
        // Typography: text-wrap balance on headings and pretty on prose.
        const wrap = (element) => getComputedStyle(element).textWrapStyle || getComputedStyle(element).textWrap;
        return {
          headings: [...document.querySelectorAll('main :is(h1, h2, h3)')].filter((element) => !wrap(element).includes('balance')).map((element) => element.localName + ' "' + element.textContent.trim().slice(0, 40) + '": ' + wrap(element)),
          prose: [...document.querySelectorAll('.article-page .prose > p')].filter((element) => !wrap(element).includes('pretty')).map((element) => '"' + element.textContent.trim().slice(0, 40) + '": ' + wrap(element)),
          nav: nav.getBoundingClientRect().height,
          targets: [...nav.querySelectorAll('a, button'), ...document.querySelectorAll('[data-recommend-filter]')].filter(visible).map((element) => {
            const rect = element.getBoundingClientRect();
            return { label: (element.getAttribute('aria-label') || element.textContent).trim().replace(/\\s+/g, ' '), button: element.localName === 'button', filter: element.hasAttribute('data-recommend-filter'), width: rect.width, height: rect.height };
          }),
        };
      })()`);
      for (const heading of value.headings) failures.push(`${route}: heading must use text-wrap: balance, ${heading}`);
      for (const paragraph of value.prose) failures.push(`${route}: prose paragraph must use text-wrap: pretty, ${paragraph}`);
      if (value.nav < 86 - TOLERANCE) failures.push(`${route} at 320px: navigation is ${value.nav}px tall, under 86px`);
      if (route === '/recommends/' && value.targets.filter((target) => target.filter).length !== 4) failures.push(`/recommends/ at 320px: expected four visible filter buttons, found ${value.targets.filter((target) => target.filter).length}`);
      if (!value.targets.some((target) => target.button)) failures.push(`${route} at 320px: no visible navigation or mode control button`);
      for (const target of value.targets) {
        if (target.height < 44 - TOLERANCE || (target.button && target.width < 44 - TOLERANCE)) {
          failures.push(`${route} at 320px coarse pointer: "${target.label}" is ${target.width.toFixed(1)}x${target.height.toFixed(1)}px, under the 44px target`);
        }
      }
    }
  });
  assert.deepEqual(failures, [], `navigation, targets, and text wrapping must match DESIGN.md:\n${failures.join('\n')}`);
});

// DESIGN.md Writing article: "Article prose and media remain still; do not animate
// while someone reads." Scoped to the article itself: the shared header's settle
// still runs on every route, which the issue lists as a question for Kaleb.
test('article content holds still: nothing inside the article animates (DESIGN.md No Article-Page Motion)', async () => {
  const failures = [];
  await withBrowser(async (cdp, origin) => {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    for (const route of posts) {
      const url = new URL(route, origin);
      url.searchParams.set('__design', String(++navigationCount));
      await cdp.send('Page.navigate', { url: url.href });
      await eventually(async () => {
        const state = await evaluate(cdp, '({ href: location.href, readyState: document.readyState })');
        assert.equal(state.href, url.href);
        assert.equal(state.readyState, 'complete');
      }, 20_000);
      // Read animations before settle, which would wait them out. Scrolling must not start any either.
      const atLoad = await evaluate(cdp, `document.getAnimations().filter((animation) => animation.effect?.target?.closest?.('main article')).map((animation) => (animation.effect.target.className || animation.effect.target.localName) + ' ' + (animation.animationName || animation.constructor.name))`);
      await evaluate(cdp, `(async () => { window.scrollTo(0, document.documentElement.scrollHeight); await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); })()`);
      const afterScroll = await evaluate(cdp, `document.getAnimations().filter((animation) => animation.effect?.target?.closest?.('main article')).map((animation) => (animation.effect.target.className || animation.effect.target.localName) + ' ' + (animation.animationName || animation.constructor.name))`);
      for (const animation of [...atLoad, ...afterScroll]) failures.push(`${route}: animation running inside the article: ${animation}`);
    }
  });
  assert.deepEqual(failures, [], `article pages must not animate:\n${failures.join('\n')}`);
});
