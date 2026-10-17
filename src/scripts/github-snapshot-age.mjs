const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function showStaleGitHubSnapshotStatus(root = document, now = Date.now()) {
  for (const status of root.querySelectorAll('[data-github-snapshot-verified-at]')) {
    const verifiedAt = Date.parse(status.dataset.githubSnapshotVerifiedAt);
    if (Number.isFinite(verifiedAt) && now - verifiedAt > MAX_AGE_MS) {
      status.querySelector('[data-github-snapshot-stale]')?.removeAttribute('hidden');
    }
  }
}
