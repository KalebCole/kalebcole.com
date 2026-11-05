---
name: kalebcole-site
description: >-
  Work on kalebcole.com, the Astro site in this repo: add or edit a Writing
  post, recommend, or project; publish a draft someone sends; ship a change to
  production and confirm it is live; write share posts for a new post; or
  improve SEO and AI-answer visibility. Use for any request to post, publish,
  fix, or check something on the site.
---
# kalebcole.com site work

If this skill conflicts with `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, or `CONTEXT.md`, follow the doc.

## Start every task

1. Branch from the latest `origin/master` in a fresh clone or a new worktree, because an old checkout can carry stale generated assets into the diff.
2. Follow `AGENTS.md`'s reading order.
3. Run `gh pr list --state open` and reuse an open PR that covers the same scope instead of opening a second one.

## Which reference to read

| Task | Read |
| --- | --- |
| The owner sends a Writing piece, or asks for a review or edit of one | `references/writing.md` |
| Adding or fixing a recommend | `references/recommends.md` |
| Projects page or homepage project rows | `references/projects.md` |
| Any change that needs a PR, preview, merge, or production check | `references/shipping.md` |
| A Writing piece just went live and needs share drafts | `references/publish-day.md` |
| Search, indexing, metadata, structured data, llms.txt, AI answers, evidence audit | `references/seo.md` |

## Decisions that belong to the site owner

Ask, and wait for an explicit yes, before any of these. Each is publishing or speaking in the owner's name, so an agent cannot infer it from a related request:

- Merging a PR. Merging publishes to production. "Open a PR", "show me", or "looks good" on a preview is not a merge.
- Any wording change beyond a mechanical fix (defined in `references/writing.md`), since the site exists to carry the owner's own words.
- Closing PRs or issues, or deleting branches, since they may hold work in progress.
- Anything that sends or posts: email, X, LinkedIn, messages, issue comments nobody asked for. Draft it and hand it over.

Leave these alone even when a task seems to call for them, because each lives outside the repository's review loop:

- `public/resume.pdf`, which is generated from another repository (`README.md`, Résumé publication).
- DNS, the domain registrar, and Vercel project settings, domains, or environment variables.

## Handing work back

- Say "shipped" or "live" only after `references/shipping.md` "Verify production" passes; a green check is build evidence, not proof the page is right.
- List anything undecided as a question with the options.
