# Writing: from what the owner sends to a focused PR

Policy: `PRODUCT.md` (Voice and Personality; Content and Publishing Boundaries), `CONTEXT.md` (Punctuation; Language), `DESIGN.md` (Writing article; Portrait and editorial imagery). Frontmatter schema: the `blog` collection in `src/content.config.ts`. X post embeds: `AGENTS.md` (X post embeds in Writing).

## 1. Identify the input and the ask

| The owner sends | Treat it as |
| --- | --- |
| Pasted text or a Markdown file | Final wording. |
| A voice note transcript | Their words with transcription noise. Ask before turning speech into prose, and propose the cleaned version as a diff. |
| A doc or note export (Google Doc, Obsidian) | Final wording. Fetch the source and keep its headings, links, quotes, captions, and TODOs. |
| A link plus a take | Probably a recommend. Confirm, then use `recommends.md`. |

Do only what was asked: prepare (mechanical changes only), review (findings only), edit (the named pass), or PR. "Finalize" is ambiguous, so ask which one.

## 2. What counts as mechanical

Mechanical changes need no approval:

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
- Keep quotations exact; flag a quote that looks wrong separately.
- Read the PR history and prior review threads before editing a piece that was revised before, so an approved choice is not undone.
- Reviewer subagents get the same exact text, the scope, and the protected quotes, and return findings only; the main agent makes the edits.

## 4. Images and video

Copy the pattern in `src/content/blog/amazon-muse-shopping-agents.md` (figures with `<picture>`, WebP plus PNG fallback, video with a fallback link).

1. Copy each image into `public/blog/<slug>/` with a PNG or JPEG fallback plus a WebP candidate, and copy the figure markup and attributes from that post. Sizing and captions: `DESIGN.md` (Portrait and editorial imagery). When the original source is known, its link goes in the caption. Never invent attribution.
2. Third-party video: ask before re-hosting, then store it under `public/blog/<slug>/` and copy the video markup from that post, with a caption that credits and links the original.
3. Every `<video>` needs a visible description of at least 80 characters in the same `<figure>`, referenced by `aria-describedby`; `tests/site/checks/page-structure.mjs` fails the build otherwise. Those words are not the owner's, so draft them from what is on screen: extract frames (`ffmpeg -i <video> -vf fps=1 /tmp/frames/%03d.png`), read the surrounding post, and write a short neutral description with no personal data from the demo. Check the audio (`ffmpeg -i <video> -af volumedetect -f null -`) before saying "no audio". Get the owner's ok on the wording, as for any non-mechanical edit.

## 5. Prepare the PR

1. Branch as in `shipping.md` and keep only this piece in the diff.
2. Run the checks in `shipping.md`, then open `/blog/<slug>/` in the preview and confirm the title, one exact quote from the body, every image URL (WebP and fallback), the figcaptions, and video controls if any.

## Pitfall

If Astro reports a duplicate content ID but only one source file exists, delete both `.astro/` and `node_modules/.astro/`, rerun the checks, and confirm the text appears once on the page and in `/rss.xml`.
