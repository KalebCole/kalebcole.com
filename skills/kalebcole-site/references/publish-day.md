# Publish day: share drafts after a Writing piece is live

Start only after `shipping.md` "Verify production" passes for a non-draft piece in `src/content/blog/`.

The subscriber email is a draft for the owner to send (`SKILL.md`, Decisions that belong to the site owner). Policy for the words: `PRODUCT.md` (Voice and Personality; Anti-references).

## Inputs

Use only the owner's words, from the merged source file:

- `title` and `description`, exact
- the canonical link `https://kalebcole.com/blog/<slug>/`, with no tracking parameters
- at most one short exact quote from the body; include it only if the owner asked for quotes

Label anything you add as **Suggestion (agent wording, please rewrite)**.

## 1. Link preview

Fetch the production page and confirm `og:title`, `og:description`, and `og:image` are present and that the image URL returns 200. Report problems before handing over drafts.

## 2. Subscriber email

No subscriber email service exists yet; picking one is the owner's decision.

## 3. Social drafts

Hand the live link and key points from the owner's words off for social drafts. Nothing is sent or posted without the owner's ok. Cross-posting lives in the separate skill `skills/post-blog-to-socials/SKILL.md`.
