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
