import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizePinnedReposResponse, parseGitHubSnapshot } from '../src/lib/github.mjs';

const snapshotPath = fileURLToPath(new URL('../src/data/github.json', import.meta.url));
const REVERIFY_AFTER_MS = 21 * 24 * 60 * 60 * 1000;

const query = `query {
  user(login: "KalebCole") {
    pinnedItems(first: 6, types: REPOSITORY) {
      nodes { ... on Repository { name description url } }
    }
  }
}`;

export async function refreshGitHubSnapshot({ token, path = snapshotPath, fetchImpl = fetch, now = new Date() }) {
  if (!token) throw new Error('GITHUB_TOKEN is required to refresh GitHub data.');
  const response = await fetchImpl('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'kalebcole.com snapshot refresh',
    },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) throw new Error(`GitHub refresh failed with HTTP ${response.status}.`);

  const repos = normalizePinnedReposResponse(await response.json());
  if (repos.length > 6 || new Set(repos.map((repo) => repo.name)).size !== repos.length) {
    throw new Error('GitHub returned duplicate or excessive pinned repositories.');
  }

  let previous;
  try {
    previous = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (previous && parseGitHubSnapshot(previous, now).status === 'invalid') {
    throw new Error('Existing GitHub snapshot is malformed. Repair it before refreshing.');
  }
  if (
    previous && JSON.stringify(previous.pinnedRepositories) === JSON.stringify(repos)
    && now.getTime() - Date.parse(previous.verifiedAt) < REVERIFY_AFTER_MS
  ) {
    return false;
  }
  const snapshot = { version: 1, verifiedAt: now.toISOString(), pinnedRepositories: repos };
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`);
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const changed = await refreshGitHubSnapshot({ token: process.env.GITHUB_TOKEN });
  console.log(changed ? 'Updated GitHub snapshot.' : 'Pinned repositories are unchanged.');
}
