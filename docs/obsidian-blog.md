# Generate a blog post from one Obsidian note

From the repository root, select one note:

```sh
npm run blog:generate -- --vault /path/to/vault --note 'Writing/My note.md'
```

The command generates local files for review. It does not commit, push, deploy, or publish other notes.

## Prepare the note

```yaml
---
publish: true
title: A real title
date: 2026-10-16
description: A sentence that explains this piece in my own words.
slug: a-stable-url
draft: true
tags: []
---
```

Supply `title`, `date`, and `description`. Dates use `YYYY-MM-DD`; `updated` is optional and uses the same format. The command never invents metadata or reads dates from filesystem timestamps. `publish: true` permits export; it does not override the draft gate. An omitted `draft` defaults to `true`.

The exporter accepts only the fields shown above plus `updated`. Remove other Obsidian properties from the selected publication note rather than relying on the exporter to guess what they mean.

`slug` is optional. When omitted, the command derives it from the note's filename. Set it explicitly before renaming a note if its URL must stay the same. Slugs use lowercase letters, digits, and single hyphens. Assets do not change the article URL.

## Callouts

Write callouts as you would in Obsidian:

```md
> [!quote] Always visible
> Quoted words.

> [!quote]- Starts closed
> Open the disclosure to read these words.

> [!quote]+ Starts open
> The reader can close this disclosure.
>
> > [!note]- Nested callout
> > Nested words.
```

Astro renders folding callouts as native `details` and `summary` elements. They work without JavaScript and use the site's colors rather than an Obsidian theme.

## Approve wiki-link targets

Wiki links can point only to explicitly approved public notes that already have a non-draft blog entry. Create a small JSON map outside the public output:

```json
{
  "Writing/Another note.md": "another-note"
}
```

Then supply it with the selected note:

```sh
npm run blog:generate -- --vault /path/to/vault --note 'Writing/My note.md' --public-notes /path/to/public-notes.json
```

The target note must also opt in and be non-draft. Its explicit or filename-derived slug must match the map. `[[Another note]]` and `[[Writing/Another note|my label]]` become ordinary blog links. Use an explicit path when filenames are ambiguous; duplicate public titles or slugs fail validation. The command reads the selected note and named approvals, not every note in the vault. It does not export linked note bodies.

Text inside inline code and fenced or indented code blocks stays literal, even if it looks like a wiki link.

## Local images

Use a vault-relative PNG, JPEG, or WebP image and meaningful alternative text:

```md
![[Attachments/photo.png|A description of what matters in this photo]]
```

Only referenced images are copied. The command first checks a vault-root path, then a path relative to the selected note when the root path is absent. It does not search the vault by basename. Generated filenames use hashes rather than the original filename. The generated figure includes WebP sources, a fallback image, intrinsic dimensions, responsive sizes, and lazy loading. Images are orientation-corrected and stripped of source metadata. The command refuses missing or animated images, paths outside the vault, and symlink traversal.

This is a bounded exporter. Unsupported syntax fails with an error rather than disappearing from the published article. Note transclusion, block references, math, highlights, comments, remote image embeds, raw HTML, Markdown image syntax, and relative Markdown links need an explicit conversion first. Use the supported image embeds and approved wiki links for local references.

## Review the result

Generated posts live in `src/content/blog/`; generated assets live under `public/blog/`. `.obsidian-blog/manifest.json` records ownership and hashes. Keep this manifest with the generated files. It is not a public asset. Do not hand-edit owned files; edit the source note and regenerate instead.

Before changing owned output, the command prepares a temporary site tree and runs the normal build and certification checks with `GITHUB_TOKEN=""`. A failed check leaves the prior generated output untouched. It never clears the blog directory or overwrites a handwritten post. Regeneration reconciles stale owned assets and changed slugs.

Promotion uses atomic file renames and rolls back caught errors. It is not a single atomic filesystem operation across the post, assets, and manifest, and it does not guarantee recovery after power loss or a killed process. A retained transaction or lock makes the next run fail closed. Do not delete recovery data blindly; inspect it and restore the prior files before retrying.

Drafts stay out of public pages and feeds. As with other files in `public/`, generated image assets would still have direct URLs if deployed. Review those assets before deploying a branch that contains a draft.

Use Git to review the Markdown, assets, and ownership manifest together:

```sh
git status --short
git diff -- src/content/blog public/blog .obsidian-blog
```

New files appear in `git status` before they appear in an unstaged `git diff`. Review them before staging. To make a post public, set `draft: false` in the source note, regenerate, and follow the normal review and deployment process. The generator itself never deploys.

## Verify the generator

```sh
node --test test/obsidian-blog*.test.mjs test/obsidian-callouts.test.mjs
npm run blog:verify
GITHUB_TOKEN="" npm run certify
```

The slow verification command uses a synthetic note in a disposable vault and site copy. It exercises the actual CLI, staged validation, repeat output, rendered callouts and images, HTTP responses, a failed Astro schema check, and draft exclusion. It also checks native keyboard folding and 320px reflow with site JavaScript disabled. Like the existing browser certification, it requires Chrome or a `CHROME_BIN` executable. It does not use or publish a personal note.
