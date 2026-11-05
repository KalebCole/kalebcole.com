# Shipping: branch to verified production

The commands and the release checklist are in `AGENTS.md` (Commands; Where checks live; Before shipping). This file covers what those leave out.

## 1. Branch

- Name branches by kind, as recent history does: `content/<slug>`, `fix/<topic>`, `feat/<topic>`, `seo/<topic>`, `docs/<topic>`.
- Keep one concern per branch so the owner can approve or reject it as a unit.
- Stacked PRs: if PR B targets PR A's branch, retarget B to `master` (`gh pr edit <B> --base master`) before A merges. Merging A with branch deletion deletes B's base, and GitHub closes B instead of retargeting it.

## 2. Check

```bash
npm ci
CHROME_BIN=/usr/bin/google-chrome GITHUB_TOKEN="" npm run check
```

- Set `CHROME_BIN` to the local Chrome or Chromium binary. On a headless box without it, the `tests/e2e` checks fail with "Set CHROME_BIN", which is a setup problem, not a site bug.
- `GITHUB_TOKEN=""` proves the build works without a token, which is how Vercel builds run.
- The build rewrites portrait outputs. `prebuild` regenerates `public/me.jpg`, `public/me-*.webp`, the social card in `public/social/`, and `src/lib/portrait-social-image.generated.mjs`, and they can differ byte for byte even when nothing changed. Unless the task changed `assets/portrait.jpg` or the card renderer, restore them before committing:
  ```bash
  git checkout -- public/me.jpg public/me-*.webp public/social src/lib/portrait-social-image.generated.mjs
  git status --short
  ```
  Delete any new untracked file under `public/social/`; the card filename is a content hash, so a changed card appears as a new file.
- A failure on a route you did not touch is still a failure. Report it rather than calling the run a pass.
- Look at the real output: `npm run preview -- --host 127.0.0.1` and request the changed routes, or grep `dist/`. Confirm drafts are absent from pages, `/rss.xml`, and `/recommends/rss.xml`. Stop the preview server afterwards.

## 3. PR

- `gh pr create` with a short summary, the source of any wording, and real verification output (the `npm run check` result plus what you checked in the preview).
- Vercel comments a preview deployment on the PR. Hand over the direct page URL on the preview host (for example `https://<preview-host>/blog/<slug>/`) and call it a PR preview, never production.

## 4. Merge (only on the owner's explicit yes)

Squash is the repo convention. Pin the merge to the commit that was reviewed, so a late push cannot slip into production unreviewed:

```bash
sha=$(gh pr view <number> --json headRefOid --jq .headRefOid)
gh pr merge <number> --squash --match-head-commit "$sha"
gh pr view <number> --json mergeCommit --jq .mergeCommit.oid
```

Pass the full 40 character SHA, as `headRefOid` returns it. Record the merge commit SHA from the last command. Delete the branch only if asked, and check for stacked PRs first (section 1).

## 5. Verify production (before saying "shipped")

1. Find the Vercel production deployment for the merge commit (Vercel connector, Vercel CLI, or the GitHub deployment status on the merge commit). Pass only when its state is `READY` and its git commit SHA equals the merge commit SHA. If it is still building, wait and check again. If it is `ERROR`, report it with the build log; do not retry by changing project settings.
2. Request every affected route and representative asset on `https://kalebcole.com` (the page, its images and video, `/rss.xml`, `/sitemap-index.xml`). Each must return 200 and contain the change (grep the HTML for the new title or text). A brand-new route can 404 briefly after the deploy goes ready; retry once after a short wait before calling it a failure.
3. If a content extractor disagrees with what merged, fetch the raw HTML with `curl` and compare it with the source.
4. Only now say it is live, with the production URL. For Writing, continue to `publish-day.md`.

## Stale link previews

When someone reports an old portrait or card on a shared link, fetch the production HTML, read `og:image` and `twitter:image`, download that image, and compare it with the repo's generated card before changing code. If production is correct, the platform cached the old preview; it is not a site bug.
