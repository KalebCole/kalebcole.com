# Recommends: adding or fixing a recommend

Policy: `PRODUCT.md` (Recommendation eligibility), `CONTEXT.md` (Language: Recommend), `DESIGN.md` (Recommends). Fields: the `recommends` collection in `src/content.config.ts`. Thumbnails: `AGENTS.md` (Recommend thumbnails). The capture-only skill `skills/recommends-capture/SKILL.md` covers proposing a candidate; this file covers putting one on the site.

## Procedure

1. Get the required details from the owner (`PRODUCT.md`, Recommendation eligibility). If one is missing, ask or keep `draft: true` rather than guess. The `take` field (shown as **My thoughts**) is the owner's exact words or absent.
2. Verify title, creator, source, and artwork against the real page, since link previews are often stale or wrong.
3. Clean the destination and image URLs and use the printed form; the build rejects tracking parameters and names them:
   ```bash
   node scripts/clean-url.mjs '<url>'
   ```
4. Write `src/content/recommends/<kebab-slug>.md`, copying the shape of `src/content/recommends/you-said-no-mcp.md`. Set `medium` explicitly even though it defaults to `read`, so a watch or listen item is not filed under read. Leave `_example-watch.md` alone; it is a placeholder.
5. Show the owner the full entry, take included, and set `draft: false` only on their yes.
6. Run the checks in `shipping.md`, and commit the new `public/recommends/thumbs/*.webp` and `src/data/recommend-thumbnails.json` the build writes.
7. In the preview, check `/recommends/`: the entry is newest-first, under the right medium filter, with the take verbatim, and `/recommends/rss.xml` includes it.
8. Ship with `shipping.md`.

For an automation that proposes recommends, read `automations/recommends-capture/README.md` and validate requests with `node scripts/validate-recommends-capture.mjs <request.json>` instead of writing content.
