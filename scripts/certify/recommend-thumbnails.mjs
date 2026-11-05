import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { THUMBNAIL_MAX_RENDERED_WIDTH, THUMBNAIL_PUBLIC_DIRECTORY, thumbnailPath } from '../../src/lib/recommend-thumbnails.mjs';
import { publishedRecommendImages } from '../recommend-thumbnails.mjs';
import { attribute, collect, localAsset, matches, root, text } from './helpers.mjs';

// Recommend thumbnails (#158): local WebP copies, manifest, and LCP loading.
export const check = collect('recommend-thumbnails', async ({ routes, homepage, recommends, packageJson }) => {
  assert.equal(
    packageJson.scripts.prebuild,
    'npm run portrait && npm run recommend-thumbnails',
    'normal builds must regenerate every portrait derivative and any missing or stale recommend thumbnail',
  );

  const homepageRecommendations = matches(homepage, /<article\b[^>]*class="[^"]*\brec\b[^"]*"[^>]*\bdata-recommendation\b[^>]*>[\s\S]*?<\/article>/gi)
    .map((match) => match[0]);
  const recommendationCards = matches(recommends, /<article\b[^>]*class="[^"]*\brec\b[^"]*"[^>]*\bdata-recommendation\b[^>]*>[\s\S]*?<\/article>/gi)
    .map((match) => match[0]);

  // Recommend thumbnails (#158): local WebP copies, and the first card's image is the LCP image.
  const thumbnailManifest = JSON.parse(text(join(root, 'src', 'data', 'recommend-thumbnails.json')));
  const rerunThumbnails = 'the prebuild step (npm run recommend-thumbnails) should have generated it; rerun the build and read its output';
  const expectedThumbnailFiles = new Set();
  for (const { slug, image } of await publishedRecommendImages(join(root, 'src', 'content', 'recommends'))) {
    const entry = thumbnailManifest[slug];
    assert.ok(entry, `recommend ${slug} has an image but no local thumbnail; ${rerunThumbnails}`);
    assert.equal(entry.source, image, `recommend ${slug} thumbnail was made from a different image URL; ${rerunThumbnails}`);
    assert.ok(entry.candidates.length > 0, `recommend ${slug} must have at least one thumbnail candidate`);
    for (const candidate of entry.candidates) {
      assert.equal(candidate.src, thumbnailPath(slug, image, candidate.width), `recommend ${slug} thumbnail path must be ${thumbnailPath(slug, image, candidate.width)}`);
      assert.ok(existsSync(join(root, 'public', ...candidate.src.split('/').filter(Boolean))), `recommend ${slug} thumbnail ${candidate.src} must exist; ${rerunThumbnails}`);
      assert.ok(candidate.width <= THUMBNAIL_MAX_RENDERED_WIDTH * 2, `${candidate.src} must be at most twice the largest rendered thumbnail width`);
      expectedThumbnailFiles.add(candidate.src.split('/').pop());
    }
  }
  const publishedThumbnailSlugs = new Set((await publishedRecommendImages(join(root, 'src', 'content', 'recommends'))).map(({ slug }) => slug));
  for (const slug of Object.keys(thumbnailManifest)) {
    assert.ok(publishedThumbnailSlugs.has(slug), `src/data/recommend-thumbnails.json lists ${slug}, which is not a published recommend with an image; ${rerunThumbnails}`);
  }
  const thumbnailDirectory = join(root, 'public', ...THUMBNAIL_PUBLIC_DIRECTORY.split('/').filter(Boolean));
  // The committed copies are the cache that keeps builds offline. Generated but uncommitted
  // thumbnails are not an error (the recommend itself may not be committed yet), so remind.
  const uncommittedThumbnails = spawnSync('git', ['status', '--porcelain', '--', `public${THUMBNAIL_PUBLIC_DIRECTORY}`, 'src/data/recommend-thumbnails.json'], { cwd: root, encoding: 'utf8' });
  if (uncommittedThumbnails.status === 0 && uncommittedThumbnails.stdout.trim()) {
    console.warn(`Recommend thumbnails changed; commit them with the recommend:\n${uncommittedThumbnails.stdout.trimEnd()}`);
  }
  for (const file of existsSync(thumbnailDirectory) ? readdirSync(thumbnailDirectory) : []) {
    assert.ok(expectedThumbnailFiles.has(file), `public${THUMBNAIL_PUBLIC_DIRECTORY}/${file} is not used by a published recommend; ${rerunThumbnails}`);
  }
  for (const [route, path] of routes) {
    for (const tag of matches(text(path), /<img\b[^>]*class="rec-thumb"[^>]*>/gi).map((match) => match[0])) {
      assert.ok(attribute(tag, 'src').startsWith(`${THUMBNAIL_PUBLIC_DIRECTORY}/`), `${route} recommendation thumbnail must be a local copy, not ${attribute(tag, 'src')}`);
      const srcset = attribute(tag, 'srcset') ?? '';
      assert.ok(srcset, `${route} recommendation thumbnail must offer a srcset`);
      for (const candidate of srcset.split(',').map((value) => value.trim().split(/\s+/)[0])) {
        assert.ok(candidate.startsWith(`${THUMBNAIL_PUBLIC_DIRECTORY}/`) && existsSync(localAsset(candidate)), `${route} thumbnail candidate ${candidate} must be emitted`);
      }
      assert.ok(attribute(tag, 'sizes'), `${route} recommendation thumbnail must declare sizes`);
      assert.equal(attribute(tag, 'alt'), '', `${route} recommendation thumbnail alt text must stay empty (the title names the item)`);
    }
  }
  const recommendsThumbs = recommendationCards.map((card) => card.match(/<img\b[^>]*class="rec-thumb"[^>]*>/i)?.[0]);
  if (recommendsThumbs[0]) {
    assert.doesNotMatch(recommendsThumbs[0], /\bloading="lazy"/i, 'the first Recommends thumbnail is the LCP image and must not be lazy');
    assert.match(recommendsThumbs[0], /\bfetchpriority="high"/i, 'the first Recommends thumbnail is the LCP image and must have fetchpriority="high"');
  }
  for (const tag of recommendsThumbs.slice(1).filter(Boolean)) {
    assert.match(tag, /\bloading="lazy"/i, 'Recommends thumbnails after the first must stay lazy');
    assert.doesNotMatch(tag, /\bfetchpriority=/i, 'only the first Recommends thumbnail may have a priority hint');
  }
  for (const tag of homepageRecommendations.map((card) => card.match(/<img\b[^>]*class="rec-thumb"[^>]*>/i)?.[0]).filter(Boolean)) {
    assert.match(tag, /\bloading="lazy"/i, 'homepage recommendation thumbnails are below the fold and must stay lazy');
    assert.doesNotMatch(tag, /\bfetchpriority=/i, 'homepage recommendation thumbnails must not take priority from the portrait');
  }
});
