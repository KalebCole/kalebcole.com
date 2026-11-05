# SEO, indexing, structured data, and AI answers

Policy: `PRODUCT.md` (Purpose and Success; Anti-references), `DESIGN.md` (Browser, performance, and validation matrix; Accessibility and responsive release gates). Titles, descriptions, and copy are the owner's words, so do not rewrite them to chase ranking or AI answers.

## Gotchas

- Person JSON-LD (`src/lib/person-schema.mjs`) is emitted only on the homepage, where `src/pages/index.astro` sets `personSchema`.
- Keep `public/google*.html`. Deleting it breaks Search Console verification.

## Request indexing for a new page

After `shipping.md` "Verify production" passes, use URL Inspection in Google Search Console on the production URL and choose Request indexing. It needs the owner's signed-in Search Console; without access, give the owner the exact URL and steps. Do not claim a page is indexed without the Search Console result.

## Evidence audit

One report, four sections, each with a score, an evidence link, and the change since the previous report (the first says "baseline"):

1. **Search.** Search Console average position for the owner's name (`name` in `src/lib/person-schema.mjs`) and whether the top result is this site or another person of the same name; clicks and impressions for the period with the Search Console link; indexing and sitemap status.
2. **Speed.** PageSpeed Insights mobile and desktop for the representative routes in `DESIGN.md` (Browser, performance, and validation matrix), each run linked. Report field data only if PageSpeed shows it; otherwise say there is not enough traffic.
3. **Accessibility.** Lighthouse accessibility and axe results for the same routes. State that automated tools cover only part of WCAG 2.2 AA, and list the manual checks from `DESIGN.md` (Accessibility and responsive release gates) as done or not done.
4. **Structured data.** Schema Markup Validator and Rich Results Test links for the homepage and one article, with errors, warnings, and pages with none.

End with one suggestion, linked to its evidence.

Every number links to its source or attaches raw tool output, because an estimated or carried-forward number makes the trend meaningless. If something is unavailable, write "not available" and why.

## AI answer checks

Ask a fixed set of AI search tools "who is <owner's name>" (the `name` in `src/lib/person-schema.mjs`) plus one or two similar prompts. Record date, tool, prompt, full answer, cited sources, and a call of this site's owner, another person, or mixed. Compare claims against `src/lib/person-schema.mjs`. Report only recorded answers, with the source each error came from.
