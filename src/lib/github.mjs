import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SNAPSHOT_PATH = resolve(process.cwd(), 'src/data/github.json');
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const REPO_URL = /^https:\/\/github\.com\/KalebCole\/[A-Za-z0-9_.-]+\/?$/;

export function normalizePinnedReposResponse(response) {
  const nodes = response?.data?.user?.pinnedItems?.nodes;
  if (!Array.isArray(nodes)) {
    throw new Error('GitHub returned an incomplete pinned repository response.');
  }

  if (response.errors?.some((error) => {
    const path = error?.path;
    return error?.type !== 'FORBIDDEN'
      || !Array.isArray(path) || path.length !== 4
      || path[0] !== 'user' || path[1] !== 'pinnedItems' || path[2] !== 'nodes'
      || !Number.isInteger(path[3]) || nodes[path[3]] !== null;
  })) {
    throw new Error('GitHub returned an incomplete pinned repository response.');
  }
  if (nodes.some((repo, index) => repo === null && !response.errors?.some((error) => error.path?.[3] === index))) {
    throw new Error('GitHub returned an unexplained empty pinned repository.');
  }

  const publicNodes = nodes.filter((repo) => repo !== null);
  if (publicNodes.length === 0 && response.errors?.length) {
    throw new Error('GitHub returned no accessible pinned repositories.');
  }

  return publicNodes.map((repo) => {
    if (
      !repo || typeof repo.name !== 'string' || !repo.name
      || (repo.description !== null && typeof repo.description !== 'string')
      || repo.description?.includes(String.fromCodePoint(0x2014))
      || typeof repo.url !== 'string' || !REPO_URL.test(repo.url)
      || new URL(repo.url).pathname.replace(/\/$/, '').split('/')[2] !== repo.name
    ) {
      throw new Error('GitHub returned an invalid pinned repository.');
    }
    return { name: repo.name, description: repo.description, url: repo.url };
  });
}

export function parseGitHubSnapshot(value, now = new Date()) {
  if (
    value?.version !== 1 || typeof value.verifiedAt !== 'string'
    || !Array.isArray(value.pinnedRepositories)
  ) {
    return { status: 'invalid', repos: [] };
  }

  const verifiedAt = Date.parse(value.verifiedAt);
  if (
    !Number.isFinite(verifiedAt) || new Date(verifiedAt).toISOString() !== value.verifiedAt
    || verifiedAt > now.getTime()
  ) {
    return { status: 'invalid', repos: [] };
  }

  try {
    const repos = normalizePinnedReposResponse({ data: { user: { pinnedItems: { nodes: value.pinnedRepositories } } } });
    if (repos.length > 6 || new Set(repos.map((repo) => repo.name)).size !== repos.length) {
      return { status: 'invalid', repos: [] };
    }
    return {
      status: now.getTime() - verifiedAt > MAX_AGE_MS ? 'stale' : 'ready',
      repos,
      verifiedAt: value.verifiedAt,
    };
  } catch {
    return { status: 'invalid', repos: [] };
  }
}

export function getPinnedRepos(path = SNAPSHOT_PATH, now = new Date()) {
  try {
    return parseGitHubSnapshot(JSON.parse(readFileSync(path, 'utf8')), now);
  } catch (error) {
    if (error?.code === 'ENOENT') return { status: 'missing', repos: [] };
    return { status: 'invalid', repos: [] };
  }
}
