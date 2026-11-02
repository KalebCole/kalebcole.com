# AGENTS.md

Read the relevant source-of-truth documents before changing the site:

- `PRODUCT.md`: purpose, audience, voice, content boundaries, and accessibility requirements
- `DESIGN.md`: visual system, responsive behavior, components, and release budgets
- `CONTEXT.md`: shared editorial and design language

Inspect the current implementation before proposing changes. These documents describe intent, but the repository is the source of truth for current behavior.

## Working agreement

- Default branch: `master`
- Use a focused branch and pull request for changes.
- Keep writing personal, direct, candid, curious, and enthusiastic.
- Preserve Kaleb's wording unless an editorial change is explicit and reviewable.
- Follow the punctuation decision in `CONTEXT.md`: do not use em dashes anywhere in the repository or published output.
- Do not publish drafts. Content with `draft: true` must stay out of public pages and feeds.
- Treat WCAG 2.2 AA, responsive behavior, reduced motion, and lean delivery as release requirements.
- Use the canonical public origin `https://kalebcole.com`.
- Never commit credentials or tokens. Site builds read `src/data/github.json`; only the GitHub snapshot refresh requires `GITHUB_TOKEN`.
- There are no external contributors. Do not add community contribution workflows or policies unless Kaleb asks.

## Commands

```bash
npm ci
npm run dev
GITHUB_TOKEN="" npm run build
GITHUB_TOKEN="" npm run certify
npm run portrait
npm run recommend-thumbnails
```

The Projects page and homepage use the committed GitHub snapshot even when `GITHUB_TOKEN` is empty. Build or certification failures are not expected.

## Portrait

`assets/portrait.jpg` is the single source of truth for Kaleb's photo. To change it, replace that file and run a normal build. The `prebuild` hook automatically regenerates the homepage polaroid candidates (`public/me.jpg`, `public/me-600.webp`, `public/me-300.webp`) and the link-preview card used by Open Graph and Twitter metadata. The card filename includes the final rendered PNG's content hash, so portrait, layout, font, and renderer changes all give social platforms a new URL automatically. Commit the regenerated assets and `src/lib/portrait-social-image.generated.mjs` alongside the new master.

## Recommend thumbnails

Recommend frontmatter keeps the original `image` URL. Pages serve small local WebP copies from `public/recommends/thumbs/`, listed in `src/data/recommend-thumbnails.json`. After publishing a recommend with an `image`, or changing one, run `npm run recommend-thumbnails` and commit the new WebP files and JSON. Certify fails while they are missing or stale.

## Before shipping

1. Review the diff for unrelated changes.
2. Run `GITHUB_TOKEN="" npm run certify`.
3. Verify the changed route or generated output directly.
4. Open a pull request with a concise explanation and real verification evidence.
5. After merge, confirm the Vercel deployment and affected production URLs.
