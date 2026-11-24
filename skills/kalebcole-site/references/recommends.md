# Recommends: adding or fixing a recommend

Policy: `PRODUCT.md` (Recommendation eligibility), `CONTEXT.md` (Language: Recommend), `DESIGN.md` (Recommends). Fields: the `recommends` collection in `src/content.config.ts`. Thumbnails: `AGENTS.md` (Recommend thumbnails). The capture-only skill `skills/recommends-capture/SKILL.md` covers proposing a candidate; this file covers putting one on the site.

## Procedure

1. Verify title, creator, source, and artwork against the real page, since link previews are often stale or wrong.
2. Clean the destination and image URLs and use the printed form; the build rejects tracking parameters and names them:
   ```bash
   node scripts/clean-url.mjs '<url>'
   ```
3. Write `src/content/recommends/<kebab-slug>.md`, copying the shape of `src/content/recommends/you-said-no-mcp.md`. Set `medium` explicitly, since it defaults to `read` and a watch or listen item would be filed under read.
4. Show the owner the full entry, take included.
5. Run the checks in `shipping.md`. Check in the preview that `/recommends/` lists the entry newest-first under the right medium filter with the take verbatim, and that `/recommends/rss.xml` includes it.
