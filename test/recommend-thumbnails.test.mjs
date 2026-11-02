import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { THUMBNAIL_MAX_RENDERED_WIDTH, THUMBNAIL_WIDTHS, thumbnailPath } from '../src/lib/recommend-thumbnails.mjs';
import { frontmatterValue, publishedRecommendImages } from '../scripts/recommend-thumbnails.mjs';

test('thumbnail widths never exceed twice the largest rendered width', () => {
  for (const width of THUMBNAIL_WIDTHS) assert.ok(width <= THUMBNAIL_MAX_RENDERED_WIDTH * 2);
});

test('a different source image gets a different thumbnail file name', () => {
  const first = thumbnailPath('a-recommend', 'https://example.com/one.png', 320);
  assert.match(first, /^\/recommends\/thumbs\/a-recommend-[0-9a-f]{10}-320\.webp$/);
  assert.equal(first, thumbnailPath('a-recommend', 'https://example.com/one.png', 320));
  assert.notEqual(first, thumbnailPath('a-recommend', 'https://example.com/two.png', 320));
});

test('frontmatter values are read quoted or bare', () => {
  const source = '---\ntitle: "A: title"\nimage: "https://example.com/a.png"\ndraft: true\n---\nBody image: no\n';
  assert.equal(frontmatterValue(source, 'image'), 'https://example.com/a.png');
  assert.equal(frontmatterValue(source, 'title'), 'A: title');
  assert.equal(frontmatterValue(source, 'draft'), 'true');
  assert.equal(frontmatterValue(source, 'author'), undefined);
});

test('only published recommends with artwork get thumbnails', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'recommends-'));
  await writeFile(join(directory, 'with-image.md'), '---\ntitle: "A"\nimage: "https://example.com/a.png"\n---\n');
  await writeFile(join(directory, 'draft.md'), '---\ntitle: "B"\nimage: "https://example.com/b.png"\ndraft: true\n---\n');
  await writeFile(join(directory, 'no-image.md'), '---\ntitle: "C"\n---\n');
  assert.deepEqual(await publishedRecommendImages(directory), [{ slug: 'with-image', image: 'https://example.com/a.png' }]);
});

test('cached thumbnails are reused and new or changed images are generated', async () => {
  const { planThumbnails } = await import('../scripts/recommend-thumbnails.mjs');
  const cached = { slug: 'cached', image: 'https://example.com/cached.png' };
  const changed = { slug: 'changed', image: 'https://example.com/new.png' };
  const missingFile = { slug: 'missing-file', image: 'https://example.com/missing.png' };
  const fresh = { slug: 'fresh', image: 'https://example.com/fresh.png' };
  const entry = ({ slug, image }) => ({
    source: image,
    fingerprint: thumbnailPath(slug, image, 320).match(/-([0-9a-f]{10})-320\.webp$/)[1],
    candidates: [{ src: thumbnailPath(slug, image, 320), width: 320, height: 320 }],
  });
  const manifest = {
    cached: entry(cached),
    changed: entry({ slug: 'changed', image: 'https://example.com/old.png' }),
    'missing-file': entry(missingFile),
  };
  const present = new Set([thumbnailPath('cached', cached.image, 320), thumbnailPath('changed', 'https://example.com/old.png', 320)]);
  const plan = planThumbnails([cached, changed, missingFile, fresh], manifest, (path) => present.has(path));
  assert.deepEqual(plan.reuse.map(({ slug }) => slug), ['cached']);
  assert.deepEqual(plan.generate.map(({ slug }) => slug), ['changed', 'missing-file', 'fresh']);
  assert.deepEqual(planThumbnails([cached], manifest, (path) => present.has(path), { force: true }).generate, [cached]);
});

test('every build runs the thumbnail step', async () => {
  const { readFile } = await import('node:fs/promises');
  const { scripts } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(scripts.prebuild, /\bnpm run recommend-thumbnails\b/);
});
