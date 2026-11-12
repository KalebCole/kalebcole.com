---
title: Generator manual QA exportable
date: 2026-10-16
description: A positive control for the one-note blog exporter.
draft: false
tags:
  - qa
---

## About this control

This is the passing control for the separate QA generator gallery. It uses ordinary Markdown, native callouts, and an explicit local raster image. It does not include private note links, note transclusion, comments, highlights, raw HTML, math, or plugin widgets.

## Formatting

Plain text, **bold**, *italic*, ***bold and italic***, ~~strikethrough~~, and `inline code`.

[Obsidian](https://obsidian.md) is an ordinary external link.

### Lists

- First item
- Second item
  - Nested item

1. First ordered item
2. Second ordered item

- [ ] Unchecked task
- [x] Checked task

### Table

| Feature | Expected |
| --- | --- |
| Formatting | Preserved |
| Callouts | Native folding |
| Image | Local responsive asset |

## Callouts

> [!quote] Always visible
> These words should always be visible.

> [!quote]- Starts closed
> These words should be hidden until opened.

> [!note]+ Starts open
> These words should be visible on load.
>
> > [!quote]- Nested disclosure
> > This should fold independently.

> [!tip] A tip
> Callout colors come from the site's theme.

> [!warning]- A warning
> This is synthetic QA content, not a real warning.

## Image

<figure><picture><source srcset="/blog/generator-manual-qa-exportable/assets/cd1fb1de39b65ea3-640.webp 640w, /blog/generator-manual-qa-exportable/assets/cd1fb1de39b65ea3-960.webp 960w" sizes="(max-width: 56rem) 100cqw, 56rem" type="image/webp"><img src="/blog/generator-manual-qa-exportable/assets/cd1fb1de39b65ea3.png" alt="Blue rectangle on the left and coral rectangle on the right" width="960" height="540" loading="lazy" decoding="async"></picture></figure>

## Literal code

`[[Private note]]`

```md
[[Private note]]
![[not-a-real-image.png]]
> [!quote]- This is code, not a disclosure.
```

## Manual checks

- Regenerate unchanged and compare output hashes.
- Change one sentence in this source and regenerate.
- Set draft to true, regenerate, rebuild, and check article and feed exclusion.
- Restore the valid source after testing a missing required field.
- Do not commit this QA article as real site content.
