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
npm test
GITHUB_TOKEN="" npm run test:site
CHROME_BIN=/path/to/chrome GITHUB_TOKEN="" npm run test:e2e
CHROME_BIN=/path/to/chrome GITHUB_TOKEN="" npm run check
npm run portrait
npm run recommend-thumbnails
```

The Projects page and homepage use the committed GitHub snapshot even when `GITHUB_TOKEN` is empty. Build or check failures are not expected.

## Portrait

`assets/portrait.jpg` is the single source of truth for Kaleb's photo. To change it, replace that file and run a normal build. The `prebuild` hook automatically regenerates the homepage polaroid candidates (`public/me.jpg`, `public/me-600.webp`, `public/me-300.webp`) and the link-preview card used by Open Graph and Twitter metadata. The card filename includes the final rendered PNG's content hash, so portrait, layout, font, and renderer changes all give social platforms a new URL automatically. Commit the regenerated assets and `src/lib/portrait-social-image.generated.mjs` alongside the new master.

## Recommend thumbnails

Recommend frontmatter keeps the original `image` URL. Pages serve small local WebP copies from `public/recommends/thumbs/`, listed in `src/data/recommend-thumbnails.json`. The `prebuild` hook runs `npm run recommend-thumbnails`, which downloads and converts only images that are new or changed and deletes unused copies, so every build (local and Vercel) has them. Commit the generated WebP files and JSON with the recommend: they are a cache that keeps builds offline and keeps thumbnails working if the source host drops the image. If a download fails, the build stops and names the recommend and URL. Use `npm run recommend-thumbnails -- --force` after changing thumbnail widths or encoder settings.

## X post embeds in Writing

Writing is plain Markdown, so an X post is a fenced block with the `x-post` language. Fields first, one blank line, then the post text exactly as it appears on X (blank lines make paragraphs):

````markdown
```x-post
url: https://x.com/name/status/1234567890
author: Display Name
date: 2026-11-01

The post text, word for word.
```
````

`handle` (defaults to the username in `url`) and `lang` (defaults to `en`) are optional. `date` is the post's day, or its UTC time as `2026-11-01T12:34:56Z` to show the time like X does. The page renders that time in UTC, and the card script then shows it in the reader's own time zone ("6:47 PM PDT · Oct 7, 2026"). Optional card fields:

- `avatar`: a self-hosted copy of the account's profile photo, such as `/x-avatars/name.webp` (96px square WebP). Never hotlink `pbs.twimg.com`. Without it the card shows the author's initial.
- `verified: true`: shows the verified badge.
- `replyto`: the username the post replies to, shown as "Replying to @name".
- `likes`, `replies`: like and reply counts. They are a snapshot that goes stale, so leave them out unless Kaleb asks; without them the card shows Reply, Copy link, and "Read replies".
- `caption`, `captionurl`: Kaleb's caption under the card, linked to `captionurl` (or the post).

`.astro` pages use `src/components/XPost.astro` with the same fields as props. The block renders a card that looks like an X post, with X's standard `blockquote.twitter-tweet` markup (`data-dnt="true"`) for the text and same-tab links for the time, Reply, and Read replies. The local time and Copy link come from a small first-party script (`src/scripts/x-post.mjs`) that `Post.astro` inlines only on Writing pages with an `x-post` block; without JavaScript the time stays in UTC and Copy link stays hidden. An `.astro` page using `XPost.astro` does not get that script. It never loads `widgets.js` or anything else from X: the release budget allows 0 third-party JavaScript (`DESIGN.md`), and the site checks fail any route that loads it. Tracking parameters such as `?s=20` are dropped from the link. A missing field, a bad link, a remote avatar, or an em dash in the quoted text stops the build with the reason; an em dash in someone else's words needs Kaleb's call on the replacement. Quoted text is someone else's exact words: copy it, never edit it.

## Where checks live

Tests live in `tests/`, grouped by how they run:

- `tests/unit/`: fast tests that need no build. `npm test` runs them.
- `tests/site/`: checks on the production build in `dist/`, plus tests that run a build themselves. `npm run test:site` builds the site, then runs `tests/site/run.mjs` and the `*.test.mjs` files in `tests/site/`. The runner loads `dist/` once (`checks/context.mjs`), runs every module listed in `MODULES`, prints every failure with its module name, and exits 1 if any failed. Each topic (meta, JSON-LD, writing, recommends, fonts, icons, budgets, feeds, and so on) is one module in `tests/site/checks/` that exports `check(context)` and returns its failures. Shared helpers and budgets are in `checks/helpers.mjs`.
- `tests/e2e/`: real-browser checks in headless Chrome over the DevTools protocol, against `dist/` (set `CHROME_BIN`). `npm run test:e2e` builds the site, then runs them; `npm run test:e2e:run` runs them on an existing build. Measured layout rules from `DESIGN.md`, such as media centering, live in `tests/e2e/design-layout.test.mjs`.
- `tests/fixtures/`: test pages and sample data.
- `tests/support/run-tests.mjs <folder> <minimum>`: runs every `*.test.mjs` file in a folder with `node --test`, and fails if it finds fewer files than the minimum in `package.json`, so a moved or empty folder cannot pass with zero tests. No shell globs, so it works on any OS. If you remove a test file on purpose, lower that minimum in the same change.
- `tests/support/root.mjs`: the repository root, `dist/`, and `tests/fixtures/` for any test. Use it instead of a relative path like `new URL('..', import.meta.url)`.

`scripts/` holds only build tools (portrait, recommend thumbnails, the GitHub snapshot, and their helpers). A check that needs one of their helpers imports it from `scripts/`.

`npm run check` runs all three (unit, site, then e2e on the same build). `npm run certify` is a deprecated alias for it. CI runs the same three as the `unit`, `site`, and `e2e` jobs in `.github/workflows/check.yml`.

To add a check: put the assertion in the module for its topic, with a message that names the route and the rule. For a new topic, copy a small module (such as `tests/site/checks/icons.mjs`), wrap the assertions in `collect('<name>', async (context) => { ... })`, and add its name to `MODULES` in `tests/site/run.mjs`. If a rule needs real layout, add it to a browser test in `tests/e2e/` instead and wait for the page to settle (fonts, images, animations) rather than sleeping. Break the rule in `dist/` once to see the check fail before you ship it. A pure function that a check uses can get fast tests in `tests/unit/`.

## Before shipping

1. Review the diff for unrelated changes.
2. Run `GITHUB_TOKEN="" npm run check` (set `CHROME_BIN` for the browser checks).
3. Verify the changed route or generated output directly.
4. Open a pull request with a concise explanation and real verification evidence.
5. After merge, confirm the Vercel deployment and affected production URLs.
