# Publish day: share drafts after a Writing piece is live

Start only after `shipping.md` "Verify production" passes for a non-draft piece in `src/content/blog/`.

The subscriber email is a draft for the owner to send (`SKILL.md`, Decisions that belong to the site owner). X and LinkedIn drafts are written by those bots from the link and key points you send them. Policy for the words: `PRODUCT.md` (Voice and Personality; Anti-references).

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

Send the canonical link plus key points from the owner's words to X (20bec847-01a1-4c8b-84d9-c7cc93d4f0a3) with SendToAgent. X drafts the post in the owner's X voice and gives the owner the intent link. Do not draft the X post yourself.

## 4. LinkedIn blurb

Send the same canonical link and key points to LinkedIn (5e98d123-44e1-4309-92c7-eecfdf59b3aa) with SendToAgent. LinkedIn drafts the blurb in the owner's voice and saves it as a LinkedIn draft. Do not draft the LinkedIn blurb yourself.
