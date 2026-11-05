// Headless Chrome over the DevTools protocol for the e2e checks. One place for
// the parts that can hang: Chrome's exit is captured at spawn, Chrome picks
// its own free debugging port, every CDP call has a ceiling, and a whole
// browser session has a deadline, so a stuck page fails fast with its reason
// instead of running into the CI job timeout.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const chromeExecutable = process.env.CHROME_BIN ?? (existsSync(macChrome) ? macChrome : null);
export const CDP_CALL_TIMEOUT_MS = 30_000;
export const SESSION_TIMEOUT_MS = 5 * 60_000;

export async function eventually(callback, timeoutMs = 10_000) {
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

// Spawn a child and capture its exit right away, so a child that dies early
// (a Chrome crash, a bad CHROME_BIN) is still observed by cleanup.
export function spawnTracked(command, args, options) {
  const child = spawn(command, args, options);
  const exited = new Promise((resolve) => {
    child.once('exit', resolve);
    child.once('error', resolve);
  });
  return { child, exited };
}

export async function stopTracked({ child, exited }) {
  if (child.exitCode === null && child.signalCode === null) child.kill();
  await exited;
}

// Rejects with `message` after `ms`, and lets the caller cancel the timer.
function deadline(ms, message) {
  let timer;
  const expired = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
  return { expired, cancel: () => clearTimeout(timer) };
}

export async function openCdp(webSocketDebuggerUrl, { callTimeoutMs = CDP_CALL_TIMEOUT_MS } = {}) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 1;
  let closedError;
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    pending.get(message.id)?.resolve(message);
    pending.delete(message.id);
  });
  socket.addEventListener('close', () => {
    closedError = new Error('Chrome closed the DevTools connection');
    for (const { reject } of pending.values()) reject(closedError);
    pending.clear();
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('could not open the DevTools connection')), { once: true });
  });
  return {
    async send(method, params = {}) {
      if (closedError) throw new Error(`${method}: ${closedError.message}`);
      const id = nextId++;
      const limit = deadline(callTimeoutMs, `${method} got no answer from Chrome in ${callTimeoutMs / 1000}s`);
      const answer = new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
      try {
        const message = await Promise.race([answer, limit.expired]);
        if (message.error) throw new Error(`${method}: ${message.error.message}`);
        return message.result;
      } finally {
        limit.cancel();
        pending.delete(id);
      }
    },
    close: () => socket.close(),
  };
}

// Launches headless Chrome on a free port, opens CDP to its page, enables the
// Page domain, runs callback(cdp), and always cleans up: closes the socket,
// stops Chrome, and removes the profile. The session fails with a clear message
// if it runs longer than timeoutMs.
export async function withChrome(callback, { label = 'browser session', args = [], timeoutMs = SESSION_TIMEOUT_MS } = {}) {
  assert.ok(chromeExecutable, 'Set CHROME_BIN to a Chrome-family executable for the e2e browser checks');
  const profile = await mkdtemp(join(tmpdir(), 'kalebcole-e2e-'));
  const chrome = spawnTracked(chromeExecutable, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', ...args, 'about:blank',
  ], { stdio: 'ignore' });
  const limit = deadline(timeoutMs, `${label} did not finish within ${timeoutMs / 1000}s; Chrome was stopped`);
  let cdp;
  try {
    const session = (async () => {
      // Chrome writes the port it picked to DevToolsActivePort in the profile.
      const port = await eventually(async () => {
        if (chrome.child.exitCode !== null || chrome.child.signalCode !== null) throw new Error(`Chrome exited during startup (${chrome.child.exitCode ?? chrome.child.signalCode})`);
        const value = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
        assert.ok(value > 0, 'Chrome must report its debugging port');
        return value;
      }, 20_000);
      const target = await eventually(async () => {
        const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((candidate) => candidate.type === 'page');
        assert.ok(page?.webSocketDebuggerUrl, 'Chrome must expose a page CDP target');
        return page;
      }, 20_000);
      cdp = await openCdp(target.webSocketDebuggerUrl);
      await cdp.send('Page.enable');
      return callback(cdp);
    })();
    // A timed-out session keeps running until cleanup closes its socket; keep
    // that late rejection from becoming an unhandled one.
    session.catch(() => {});
    return await Promise.race([session, limit.expired]);
  } finally {
    limit.cancel();
    cdp?.close();
    await stopTracked(chrome);
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
