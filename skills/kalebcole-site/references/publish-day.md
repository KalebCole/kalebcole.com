# Publish day: share drafts after a Writing piece is live

Start only after `shipping.md` "Verify production" passes for a non-draft piece in `src/content/blog/`.

Everything here is a draft for the owner to send (`SKILL.md`, Decisions that belong to the site owner). Policy for the words: `PRODUCT.md` (Voice and Personality; Anti-references).

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

## 3. X post

Build the text from the title, description, and link, and check it fits X's length limit with the link. Hand it over as an intent link the owner can edit and post, plus the plain text:

```
https://x.com/intent/post?text=<encodeURIComponent(text including the canonical link)>
```

## 4. LinkedIn blurb

A few lines from the title and description plus the canonical link, as plain text to copy.
