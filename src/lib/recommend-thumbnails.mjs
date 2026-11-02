/**
 * Shared rules for the local copies of recommend artwork (#158).
 *
 * Recommend frontmatter keeps the original `image` URL as the source of truth.
 * `npm run recommend-thumbnails` downloads each published image once, writes
 * small WebP copies to `public/recommends/thumbs/`, and records them in
 * `src/data/recommend-thumbnails.json`. Pages serve the local copies so
 * thumbnails never depend on a third-party host's size or cache lifetime.
 */
import { createHash } from 'node:crypto';

/** WebP widths to emit, capped at the source width so nothing is upscaled. */
export const THUMBNAIL_WIDTHS = [320, 640, 960];

/**
 * The widest a thumbnail renders is the stacked phone layout just under 540px:
 * the shell is 94vw and `.rec-visual` is 8px narrower, so about 499 CSS px.
 * DESIGN.md allows candidates up to twice the largest rendered width.
 */
export const THUMBNAIL_MAX_RENDERED_WIDTH = 500;

/** Matches the `.rec` grid in global.css: 9rem at 760px and up, about 26vw from 540px, full shell width below. */
export const THUMBNAIL_SIZES = '(min-width: 760px) 9rem, (min-width: 540px) 26vw, calc(94vw - 8px)';

export const THUMBNAIL_PUBLIC_DIRECTORY = '/recommends/thumbs';

/** A short, stable fingerprint of the source URL, so a new image gets a new file name. */
export function sourceFingerprint(sourceUrl) {
  return createHash('sha256').update(sourceUrl).digest('hex').slice(0, 10);
}

/** @param {string} slug @param {string} sourceUrl @param {number} width */
export function thumbnailPath(slug, sourceUrl, width) {
  return `${THUMBNAIL_PUBLIC_DIRECTORY}/${slug}-${sourceFingerprint(sourceUrl)}-${width}.webp`;
}
