# Writing: from what the owner sends to a focused PR

Policy: `PRODUCT.md` (Voice and Personality; Content and Publishing Boundaries), `CONTEXT.md` (Punctuation; Language), `DESIGN.md` (Writing article; Portrait and editorial imagery). Frontmatter schema: the `blog` collection in `src/content.config.ts`. X post embeds: `AGENTS.md` (X post embeds in Writing).

## 1. Identify the input and the ask

| The owner sends | Treat it as |
| --- | --- |
| Pasted text or a Markdown file | Final wording. |
| A voice note transcript | Their words with transcription noise. Ask before turning speech into prose, and propose the cleaned version as a diff. |
| A doc or note export (Google Doc, Obsidian) | Final wording. Fetch the source and keep its headings, links, quotes, captions, and TODOs. |
| A link plus a take | Probably a recommend. Confirm, then use `recommends.md`. |

Then pin down what was asked. Each step is a separate permission, because each one moves the owner's words closer to public, and doing one does not authorize the next:

1. Prepare the piece for the site (mechanical changes only).
2. Review it (findings only, no file changes).
3. Edit it (one bounded pass of the named kind).
4. Open or update a PR.
5. Merge and publish (`shipping.md`).

"Finalize" or "wrap it up" does not say which of these; ask.

## 2. What counts as mechanical

Mechanical changes need no approval but still show in the PR diff:

- Frontmatter the schema requires, filled only from what was given. If `title`, `date`, or `description` is missing, ask rather than invent one.
- Converting syntax the site cannot render (Obsidian `![[embeds]]`, wiki links, unsupported callouts) into the site's equivalent, keeping every word.
- Fixing a broken or tracking-laden link to the same destination.
- Moving supplied media into `public/blog/<slug>/` and writing the figure markup (section 4).
- Applying the `CONTEXT.md` punctuation rule where it is a pure character swap that keeps meaning. If the swap needs rewording, it is not mechanical.
- Setting or bumping `updated: YYYY-MM-DD` when editing an already-published post, because it feeds `dateModified` in the article's structured data. Skip it only for a typo fix the owner says not to date.

Anything else is not mechanical: a changed word, heading, sentence order, quote, claim strength, title, or description; cutting or adding text; "fixing" grammar.

## 3. Showing a non-mechanical edit

- Review requests: return findings without touching files, grouped as required corrections (real errors), optional suggestions (style), and meaning-sensitive changes (anything that alters certainty, scope, causality, attribution, or the author's position). A stronger claim is never a grammar fix.
- Edit requests: run only the passes named (grammar and mechanics, clarity and flow, structure and argument, audience, voice). A grammar request is not a restructure.
- Show each proposed change as a before/after diff quoting the exact passage. Apply only what is approved, in the source file, in one pass. No duplicate rewrite files.
- Keep quotations exact; flag a quote that looks wrong separately. If an exact-copy instruction includes an apparent slip, keep it and raise it at the next review.
- Read the PR history and prior review threads before editing a piece that was revised before, so an approved choice is not undone.
- Reviewer subagents get the same exact text, the scope, and the protected quotes, and return findings only; the main agent makes the edits. Use none for a typo.
- For a disputed transition or ending, draft the full replacement, let the owner choose, then apply it.

## 4. Images and video

Copy the pattern in `src/content/blog/amazon-muse-shopping-agents.md` (figures with `<picture>`, WebP plus PNG fallback, video with a fallback link).

1. Copy each image into `public/blog/<slug>/`, keep a PNG or JPEG fallback, and add a WebP candidate. Sizing: `DESIGN.md` (Portrait and editorial imagery).
2. Write a `<figure>` with `<picture>`, `<source type="image/webp">`, and an `<img>` with intrinsic `width` and `height`, `loading="lazy"` below the fold, `decoding="async"`, and contextual `alt`.
3. Captions follow `DESIGN.md`. Keep a supplied caption. When the original source is known, its link goes in the caption rather than loose in the body. Never invent attribution.
4. Third-party video: ask before re-hosting. Then store it under `public/blog/<slug>/` with native `controls`, `playsinline`, `preload="metadata"`, intrinsic size, a download fallback, and a caption that credits and links the original.
5. Every `<video>` needs a visible description of at least 80 characters in the same `<figure>`, referenced by `aria-describedby`; `tests/site/checks/page-structure.mjs` fails the build otherwise. Those words are not the owner's, so draft them from what is on screen: extract frames (`ffmpeg -i <video> -vf fps=1 /tmp/frames/%03d.png`), read the surrounding post, and write a short neutral description with no personal data from the demo. Check the audio (`ffmpeg -i <video> -af volumedetect -f null -`) before saying "no audio". Get the owner's ok on the wording, as for any non-mechanical edit.
6. Leave no Obsidian `![[...]]` syntax behind, and do not hotlink an image that exists only on a remote site.

## 5. Formatting an Obsidian note itself

When asked to format the note (not the site copy): keep prose, quotes, links, images, captions, research, and TODOs; change only layout (headings, breaks, lists, callout type and fold state); offer any heading text change as a suggestion. Return a diff, and do not rename or move the note or change its publish state.

## 6. Prepare the PR

1. Branch `content/<slug>` or `fix/<slug>-<topic>` and keep only this piece in the diff.
2. Run the checks in `shipping.md`, then open `/blog/<slug>/` in the preview and confirm the title, one exact quote from the body, every image URL (WebP and fallback), the figcaptions, and video controls if any.
3. In the PR body, say where the words came from and list every approved non-mechanical change.
4. Leave it open for the owner. After it is live, go to `publish-day.md`.

## Pitfall

If Astro reports a duplicate content ID but only one source file exists, delete both `.astro/` and `node_modules/.astro/`, rerun the checks, and confirm the text appears once on the page and in `/rss.xml`.
