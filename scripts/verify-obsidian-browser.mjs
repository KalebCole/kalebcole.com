import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Slow integration helper. Nothing from this module ships to article pages.
export async function verifyCalloutBrowser(url) {
  const executable = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  assert.ok(existsSync(executable), 'Set CHROME_BIN to verify native callout behavior');
  const profile = await mkdtemp(join(tmpdir(), 'obsidian-callout-browser-'));
  const chrome = spawn(executable, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  let socket;
  const pending = new Map();
  let nextId = 0;
  const eventually = async (check) => {
    const deadline = Date.now() + 15000;
    let last;
    while (Date.now() < deadline) {
      try { return await check(); } catch (error) { last = error; await new Promise((ok) => setTimeout(ok, 100)); }
    }
    throw last;
  };
  try {
    const port = await eventually(async () => {
      const value = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
      assert.match(value, /^\d+$/);
      return value;
    });
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(pages.find((page) => page.type === 'page').webSocketDebuggerUrl);
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      clearTimeout(waiter.timeout);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
    });
    await new Promise((ok, fail) => { socket.addEventListener('open', ok, { once: true }); socket.addEventListener('error', fail, { once: true }); });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 10000);
      pending.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true });
      assert.ok(!result.exceptionDetails, result.exceptionDetails?.text);
      assert.ok(Object.hasOwn(result.result, 'value'), 'browser must return a value');
      return result.result.value;
    };
    await send('Page.enable');
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await send('Emulation.setScriptExecutionDisabled', { value: true });
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 800, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url });
    await eventually(async () => assert.equal(await evaluate('location.href === ' + JSON.stringify(url) + ' && document.readyState === "complete"'), true));
    const state = await evaluate(`(() => {
      const callouts = [...document.querySelectorAll('details.callout')];
      const closed = callouts.find(node => node.querySelector('summary').textContent.includes('Closed quote'));
      const open = callouts.find(node => node.querySelector('summary').textContent.includes('Open quote'));
      return { count: callouts.length, closed: closed?.open, open: open?.open,
        nested: Boolean(open?.querySelector('details.callout')),
        overflow: document.documentElement.scrollWidth > innerWidth,
        images: [...document.querySelectorAll('.prose img')].map(image => ({ width: image.naturalWidth, loaded: image.complete })) };
    })()`);
    assert.equal(state.count, 3);
    assert.equal(state.closed, false);
    assert.equal(state.open, true);
    assert.equal(state.nested, true);
    assert.equal(state.overflow, false, 'callouts and figures must fit 320px without page overflow');
    await evaluate(`(() => {
      const summary = [...document.querySelectorAll('summary')].find(node => node.textContent.includes('Closed quote'));
      summary.focus(); summary.scrollIntoView(); return true;
    })()`);
    assert.equal(await evaluate('document.activeElement.tagName'), 'SUMMARY');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await eventually(async () => assert.equal(await evaluate('document.activeElement.parentElement.open'), true, 'Enter must open native disclosure with site scripts disabled'));
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await eventually(async () => assert.equal(await evaluate('document.activeElement.parentElement.open'), false, 'Space must close native disclosure'));
    const focus = await evaluate('({ style: getComputedStyle(document.activeElement).outlineStyle, width: getComputedStyle(document.activeElement).outlineWidth })');
    assert.equal(focus.style, 'solid');
    assert.equal(focus.width, '2px');
    for (const mode of ['light', 'dark']) {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: mode }] });
      await eventually(async () => {
        const colors = await evaluate('({ ink: getComputedStyle(document.querySelector(".callout")).color, page: getComputedStyle(document.body).color })');
        assert.equal(colors.ink, colors.page, `${mode} callouts must inherit site ink`);
      });
    }
    console.log('Verified 320px callout reflow, default folding, nesting, keyboard Enter/Space, visible focus, and both themes with site JavaScript disabled.');
  } finally {
    socket?.close();
    for (const waiter of pending.values()) clearTimeout(waiter.timeout);
    if (chrome.exitCode === null) {
      const exited = new Promise((ok) => chrome.once('exit', ok));
      chrome.kill();
      await exited;
    }
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
