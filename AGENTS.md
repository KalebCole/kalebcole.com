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

`.astro` pages use `src/components/XPost.astro` with the same fields as props. The block renders a card that looks like an X post, with X's standard `blockquote.twitter-tweet` markup (`data-dnt="true"`) for the text and same-tab links for the time, Reply, and Read replies. The local time and Copy link come from a small first-party script (`src/scripts/x-post.mjs`) that `Post.astro` inlines only on Writing pages with an `x-post` block; without JavaScript the time stays in UTC and Copy link stays hidden. An `.astro` page using `XPost.astro` does not get that script. It never loads `widgets.js` or anything else from X: the release budget allows 0 third-party JavaScript (`DESIGN.md`), and certify fails any route that loads it. Tracking parameters such as `?s=20` are dropped from the link. A missing field, a bad link, a remote avatar, or an em dash in the quoted text stops the build with the reason; an em dash in someone else's words needs Kaleb's call on the replacement. Quoted text is someone else's exact words: copy it, never edit it.

## Where checks live

`npm run certify` builds the site, then runs two kinds of checks:

- Static checks on the built output in `scripts/certify/`. `scripts/certify.mjs` is a thin runner: it loads `dist/` once (`context.mjs`), runs every module listed in `MODULES`, prints every failure with its module name, and exits 1 if any failed. Each topic (meta, JSON-LD, writing, recommends, fonts, icons, budgets, feeds, and so on) is one module that exports `check(context)` and returns its failures. Shared helpers and budgets are in `helpers.mjs`.
- Browser checks in `test/*.test.mjs`, run with `node --test` in headless Chrome against `dist/` (set `CHROME_BIN`). Measured layout rules from `DESIGN.md`, such as media centering, live in `test/design-layout.test.mjs`.

To add a check: put the assertion in the module for its topic, with a message that names the route and the rule. For a new topic, copy a small module (such as `scripts/certify/icons.mjs`), wrap the assertions in `collect('<name>', async (context) => { ... })`, and add its name to `MODULES`. If a rule needs real layout, add it to a browser test instead and wait for the page to settle (fonts, images, animations) rather than sleeping. Break the rule in `dist/` once to see the check fail before you ship it.

## Before shipping

1. Review the diff for unrelated changes.
2. Run `GITHUB_TOKEN="" npm run certify`.
3. Verify the changed route or generated output directly.
4. Open a pull request with a concise explanation and real verification evidence.
5. After merge, confirm the Vercel deployment and affected production URLs.
