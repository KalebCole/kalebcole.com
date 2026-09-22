---
name: recommends-capture
description: Capture a potential public recommendation without exposing private history or inventing Kaleb's words.
---

# Recommends capture

Use this skill to turn a user-supplied link and editorial details into a reviewable recommendation candidate for `src/content/recommends/`.

## Public boundary

- Capture only the link and metadata deliberately supplied for this candidate.
- Do not read, copy, summarize, or publish browser history, media history, account data, device paths, IDs, credentials, or runtime state.
- A candidate is not publication. Publish only through the repository's normal reviewed content workflow.

## Editorial eligibility

A recommendation is eligible only when Kaleb has deliberately selected it for the public site and supplied the title, destination URL, medium, and date. `author`, `source`, image, and tags may be added when known. `take` is optional.

The system must never generate, expand, polish, summarize, infer, or replace a public take. If Kaleb supplies a take, preserve it verbatim. If he does not supply one, omit `take`. If any required publishing detail is missing, keep the candidate in draft rather than guessing.

## Content shape

Use the existing `recommends` collection fields:

```yaml
title: "Exact public title"
url: "https://example.com/item"
date: 2026-01-01
medium: read # read | watch | listen
author: "Optional creator"
source: "Optional publisher or domain"
image: "https://example.com/image.jpg"
tags: ["optional-topic"]
take: "Only Kaleb's exact supplied wording"
draft: true
```

The automation contract in `automations/recommends-capture/` is a public-safe dry-run interface. It contains no collector, account integration, or persistent runtime.

## Verification

Before changing a recommendation file, confirm that the candidate satisfies the eligibility rule, uses an absolute `http` or `https` URL, has one supported medium, and stays `draft: true` until the normal editorial review publishes it.
