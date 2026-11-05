# SEO, indexing, structured data, and AI answers

Policy: `PRODUCT.md` (Purpose and Success; Anti-references), `DESIGN.md` (Browser, performance, and validation matrix; Accessibility and responsive release gates). Titles, descriptions, and copy are the owner's words, so do not rewrite them to chase ranking or AI answers.

## Where things are

| Thing | Location |
| --- | --- |
| Canonical origin | `src/lib/site-origin.mjs`, used as `site` in `astro.config.mjs` |
| Canonical, description, Open Graph, Twitter, noindex | `src/layouts/Layout.astro` (holds the default site description) |
| Per-article metadata and `BlogPosting` JSON-LD | `src/layouts/Post.astro` and `src/lib/json-ld.mjs`, fed by blog frontmatter |
| Person JSON-LD | `src/lib/person-schema.mjs`, emitted only where a page sets `personSchema` (the homepage) |
| Profile links and `rel="me"` | `src/lib/elsewhere.mjs`, rendered by `src/components/SiteFooter.astro` |
| robots.txt, sitemap | `public/robots.txt`; `@astrojs/sitemap` in `astro.config.mjs` serves `/sitemap-index.xml` |
| llms.txt | `src/pages/llms.txt.ts`, built by `src/lib/llms-txt.mjs` |
| Search Console verification | `public/google*.html`. Keep it; deleting it drops site verification. |

Each has a site check in `tests/site/checks/` (meta, json-ld, crawlers, llms-txt, feeds). Extend the check when you change the behavior.

## Request indexing for a new page

After `shipping.md` "Verify production" passes, use URL Inspection in Google Search Console on the production URL and choose Request indexing. It needs the owner's signed-in Search Console; without access, give the owner the exact URL and steps. Do not claim a page is indexed without the Search Console result.

## Titles and descriptions

Propose any new or changed title or description as a diff with the reason, and apply it only on the owner's ok.

## Evidence audit

One report, four sections, each with a score, an evidence link, and the change since the previous report (the first says "baseline"):

1. **Search.** Search Console average position for "kaleb cole" and whether the top result is this site or another person of the same name; clicks and impressions for the period with the Search Console link; indexing and sitemap status.
2. **Speed.** PageSpeed Insights mobile and desktop for the representative routes in `DESIGN.md` (Browser, performance, and validation matrix), each run linked. Report field data only if PageSpeed shows it; otherwise say there is not enough traffic.
3. **Accessibility.** Lighthouse accessibility and axe results for the same routes. State that automated tools cover only part of WCAG 2.2 AA, and list the manual checks from `DESIGN.md` (Accessibility and responsive release gates) as done or not done.
4. **Structured data.** Schema Markup Validator and Rich Results Test links for the homepage and one article, with errors, warnings, and pages with none.

End with one suggestion, linked to its evidence.

Every number links to its source or attaches raw tool output, because an estimated or carried-forward number makes the trend meaningless. If something is unavailable, write "not available" and why. Fixes go in their own PRs, not in the report, and the audit adds nothing to the site's runtime.

## AI answer checks

Ask a fixed set of AI search tools "who is kaleb cole" plus one or two similar prompts. Record date, tool, prompt, full answer, cited sources, and a call of this site's owner, another person, or mixed. Compare claims against `src/lib/person-schema.mjs`. Report only recorded answers, with the source each error came from. Do not contact AI companies or edit the owner's profiles; pointing each profile's website field to `https://kalebcole.com` is the owner's manual step.
