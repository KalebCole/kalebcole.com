# Publish day: share drafts after a Writing piece is live

Start only after `shipping.md` "Verify production" passes for a non-draft piece in `src/content/blog/`.

Everything here is a draft for the owner to send. Do not send email, post to X or LinkedIn, or schedule anything, because each of those speaks publicly in the owner's name. Policy for the words: `PRODUCT.md` (Voice and Personality; Anti-references).

## Inputs

Use only the owner's words, from the merged source file:

- `title` and `description`, exact
- the canonical link `https://kalebcole.com/blog/<slug>/`, with no tracking parameters
- at most one short exact quote from the body, only if the owner wants quotes in share posts (ask)

Label anything you add as **Suggestion (agent wording, please rewrite)**.

## 1. Link preview

Fetch the production page and confirm `og:title`, `og:description`, and `og:image` are present and that the image URL returns 200. Report problems before handing over drafts.

## 2. Subscriber email

Only if the site has a subscriber email service: create a draft in it with the exact title, the exact description, the canonical link, and a marked spot for the owner's personal note. If there is none, skip this; choosing a service is the owner's decision.

## 3. X post

Build the text from the title, description, and link, and check it fits X's length limit with the link. Hand it over as an intent link the owner can edit and post, plus the plain text:

```
https://x.com/intent/post?text=<encodeURIComponent(text including the canonical link)>
```

## 4. LinkedIn blurb

A few lines from the title and description plus the canonical link, as plain text to copy. No hashtags, hooks, or "thoughts?" endings, which `PRODUCT.md` Anti-references rules out.

## 5. Hand-over

One message with the email draft location (if any), the X intent link and text, and the LinkedIn text, each noting which words came from the piece and which are labelled suggestions.
