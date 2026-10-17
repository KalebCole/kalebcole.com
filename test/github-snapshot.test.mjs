import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { getPinnedRepos, parseGitHubSnapshot } from '../src/lib/github.mjs';
import { showStaleGitHubSnapshotStatus } from '../src/scripts/github-snapshot-age.mjs';
import { refreshGitHubSnapshot } from '../scripts/refresh-github.mjs';

const now = new Date('2026-10-16T12:00:00.000Z');
const repo = { name: 'example', description: null, url: 'https://github.com/KalebCole/example' };
const snapshot = (verifiedAt = now.toISOString()) => ({
  version: 1,
  verifiedAt,
  pinnedRepositories: [repo],
});

test('a valid snapshot serves pinned repositories without GitHub', () => {
  assert.deepEqual(parseGitHubSnapshot(snapshot(), now), { status: 'ready', repos: [repo], verifiedAt: now.toISOString() });
  assert.deepEqual(parseGitHubSnapshot(snapshot('2026-09-01T12:00:00.000Z'), now), {
    status: 'stale', repos: [repo], verifiedAt: '2026-09-01T12:00:00.000Z',
  });
});

test('a deployed page reveals its stale warning after 30 days without a rebuild', () => {
  let revealed = false;
  const status = {
    dataset: { githubSnapshotVerifiedAt: now.toISOString() },
    querySelector: () => ({ removeAttribute: (name) => { if (name === 'hidden') revealed = true; } }),
  };
  const root = { querySelectorAll: () => [status] };
  showStaleGitHubSnapshotStatus(root, now.getTime() + 29 * 24 * 60 * 60 * 1000);
  assert.equal(revealed, false);
  showStaleGitHubSnapshotStatus(root, now.getTime() + 31 * 24 * 60 * 60 * 1000);
  assert.equal(revealed, true);
});

test('missing and malformed snapshots have explicit states and no repository links', () => {
  const directory = mkdtempSync(join(tmpdir(), 'github-snapshot-'));
  const path = join(directory, 'github.json');
  try {
    assert.deepEqual(getPinnedRepos(path, now), { status: 'missing', repos: [] });
    writeFileSync(path, '{bad json');
    assert.deepEqual(getPinnedRepos(path, now), { status: 'invalid', repos: [] });
    writeFileSync(path, JSON.stringify({ ...snapshot(), pinnedRepositories: [{ ...repo, url: 'https://evil.example' }] }));
    assert.deepEqual(getPinnedRepos(path, now), { status: 'invalid', repos: [] });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('refresh writes normalized public data only when repositories change', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'github-refresh-'));
  const path = join(directory, 'github.json');
  const fetchImpl = async () => ({ ok: true, json: async () => ({
    data: { user: { pinnedItems: { nodes: [null, { ...repo, primaryLanguage: { name: 'JavaScript' } }] } } },
    errors: [{ type: 'FORBIDDEN', path: ['user', 'pinnedItems', 'nodes', 0] }],
  }) });
  try {
    assert.equal(await refreshGitHubSnapshot({ token: 'test', path, fetchImpl, now }), true);
    const first = readFileSync(path, 'utf8');
    assert.deepEqual(JSON.parse(first), snapshot());
    assert.equal(await refreshGitHubSnapshot({ token: 'test', path, fetchImpl, now: new Date('2026-10-20T12:00:00.000Z') }), false);
    assert.equal(readFileSync(path, 'utf8'), first);

    const reverifiedAt = new Date('2026-11-07T12:00:00.000Z');
    assert.equal(await refreshGitHubSnapshot({ token: 'test', path, fetchImpl, now: reverifiedAt }), true);
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), snapshot(reverifiedAt.toISOString()));
    assert.equal(parseGitHubSnapshot(JSON.parse(readFileSync(path, 'utf8')), new Date('2026-11-20T12:00:00.000Z')).status, 'ready');
    const reverified = readFileSync(path, 'utf8');

    await assert.rejects(
      refreshGitHubSnapshot({ token: 'test', path, fetchImpl: async () => ({ ok: false, status: 503 }), now }),
      /HTTP 503/,
    );
    assert.equal(readFileSync(path, 'utf8'), reverified);
    await assert.rejects(
      refreshGitHubSnapshot({ token: 'test', path, fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          data: { user: { pinnedItems: { nodes: [{ ...repo, description: `Prohibited${String.fromCodePoint(0x2014)}punctuation` }] } } },
        }),
      }), now }),
      /invalid pinned repository/,
    );
    assert.equal(readFileSync(path, 'utf8'), reverified);
    await assert.rejects(
      refreshGitHubSnapshot({ token: 'test', path, fetchImpl: async () => ({
        ok: true, json: async () => ({ errors: [{ message: 'partial response' }] }),
      }), now }),
      /incomplete/,
    );
    assert.equal(readFileSync(path, 'utf8'), reverified);
    await assert.rejects(
      refreshGitHubSnapshot({ token: 'test', path, fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          data: { user: { pinnedItems: { nodes: [null] } } },
          errors: [{ type: 'FORBIDDEN', path: ['user', 'pinnedItems', 'nodes', 0] }],
        }),
      }), now }),
      /no accessible/,
    );
    assert.equal(readFileSync(path, 'utf8'), reverified);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
