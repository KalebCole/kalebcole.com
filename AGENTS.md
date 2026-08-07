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
- Do not publish drafts. Content with `draft: true` must stay out of public pages and feeds.
- Treat WCAG 2.2 AA, responsive behavior, reduced motion, and lean delivery as release requirements.
- Use the canonical public origin `https://kalebcole.com`.
- Never commit credentials or tokens.
- There are no external contributors. Do not add community contribution workflows or policies unless Kaleb asks.

## Commands

```bash
npm ci
npm run dev
npm run build
npm run certify
npm run portrait
```

The build needs no environment variables. Every public surface is generated
from the repository.

## Projects

`/projects` is hand-authored. Each entry is a markdown file in
`src/content/projects/` validated by the `projects` schema in
`src/content.config.ts`. Set `order` to control the running order, `status` to
one of `idea`, `in progress`, `shipped`, or `archived`, and `image` plus
`imageAlt` together — the schema rejects an image without alternative text. An
entry without an image falls back to a typographic mark rather than breaking
the row.

## Portrait

`assets/portrait.jpg` is the single source of truth for Kaleb's photo. To change it, replace that file and run `npm run portrait`, which regenerates the homepage polaroid candidates (`public/me.jpg`, `public/me-600.webp`, `public/me-300.webp`) and the link-preview card served in Open Graph and Twitter metadata. Commit the regenerated assets alongside the new master.

Bump the card's version suffix (`public/social/homepage-vN.png`, referenced from `src/lib/social-image.mjs` and asserted in `scripts/certify.mjs`) whenever its appearance changes, so social platforms drop their cached preview. Update the wording in `src/lib/portrait.mjs` when the new photo no longer matches the existing alternative text.

## Before shipping

1. Review the diff for unrelated changes.
2. Run `npm run certify`.
3. Verify the changed route or generated output directly.
4. Open a pull request with a concise explanation and real verification evidence.
5. After merge, confirm the Vercel deployment and affected production URLs.
