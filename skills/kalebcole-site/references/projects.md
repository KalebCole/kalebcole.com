# Projects page and homepage project rows

Policy: `PRODUCT.md` (Content and Publishing Boundaries), `DESIGN.md` (Projects index; Homepage; Composition and spacing). Snapshot data, refresh, and staleness rules: `README.md` (GitHub project data).

## Where things are

- `src/components/PinnedRepos.astro`: renders one hand-written project first, then the snapshot repos. Curated copy and images live in its `repoOverrides`, with images in `public/projects/`.
- `HOME_PROJECT_LIMIT` in `src/pages/index.astro`: the homepage cap. It counts the hand-written project, so the homepage shows that one plus `limit - 1` repos. The number is a design decision; change it only after `DESIGN.md` changes.

## Common tasks

- **A pinned repo changed on GitHub.** Refresh the snapshot instead of hand-editing `src/data/github.json`, so its verification fields stay consistent. The `refresh-github.yml` workflow commits straight to `master`, which publishes, so running it (`gh workflow run refresh-github.yml`) is the owner's decision.
- **Better copy or image for a project.** Edit its `repoOverrides` entry. The description is the owner's words, so ask for it rather than writing one. Give the image real `width`, `height`, and `alt`.

## Verify

Run the checks in `shipping.md` (`tests/unit/github-snapshot.test.mjs` covers the snapshot). In the preview, check that `/` shows the capped row count with an `All projects` link, and that `/projects` shows everything.
