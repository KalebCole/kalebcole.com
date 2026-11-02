/**
 * Writes small local WebP copies of every published recommend's artwork.
 *
 *   npm run recommend-thumbnails
 *
 * Run it after adding a recommend with an `image`, or changing one. It reads the
 * `image` URL from each non-draft file in `src/content/recommends/`, downloads it,
 * resizes it to the widths in `src/lib/recommend-thumbnails.mjs` (never upscaling),
 * writes `public/recommends/thumbs/<slug>-<fingerprint>-<width>.webp`, records them
 * in `src/data/recommend-thumbnails.json`, and deletes thumbnails nothing uses.
 * Commit the WebP files and the JSON. Certify fails when they are missing or stale.
 * Alt text, crop, and layout are unchanged: the card still uses object-fit: cover.
 */
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  THUMBNAIL_PUBLIC_DIRECTORY,
  THUMBNAIL_WIDTHS,
  sourceFingerprint,
  thumbnailPath,
} from '../src/lib/recommend-thumbnails.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const contentDirectory = join(root, 'src', 'content', 'recommends');
const outputDirectory = join(root, 'public', ...THUMBNAIL_PUBLIC_DIRECTORY.split('/').filter(Boolean));
const manifestPath = join(root, 'src', 'data', 'recommend-thumbnails.json');

/** Reads one top-level scalar from YAML frontmatter, quoted or not. */
export function frontmatterValue(source, key) {
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  const line = frontmatter.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))?.[1]?.trim();
  if (!line) return undefined;
  const quoted = line.match(/^"((?:[^"\\]|\\.)*)"$|^'([^']*)'$/);
  return quoted ? (quoted[1] ?? quoted[2]) : line;
}

/** Published recommends that carry artwork, as { slug, image }. */
export async function publishedRecommendImages(directory = contentDirectory) {
  const files = (await readdir(directory)).filter((file) => file.endsWith('.md')).sort();
  const entries = [];
  for (const file of files) {
    const source = await readFile(join(directory, file), 'utf8');
    if (frontmatterValue(source, 'draft') === 'true') continue;
    const image = frontmatterValue(source, 'image');
    if (image) entries.push({ slug: file.replace(/\.md$/, ''), image });
  }
  return entries;
}

async function download(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Could not download ${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  const manifest = {};
  const keep = new Set();
  for (const { slug, image } of await publishedRecommendImages()) {
    const source = await download(image);
    const { width, height } = await sharp(source).metadata();
    const widths = THUMBNAIL_WIDTHS.filter((candidate) => candidate <= width);
    if (widths.length === 0) widths.push(width);
    const candidates = [];
    for (const candidate of widths) {
      const path = thumbnailPath(slug, image, candidate);
      const output = join(root, 'public', ...path.split('/').filter(Boolean));
      await writeFile(output, await sharp(source).resize({ width: candidate }).webp({ quality: 74, effort: 6 }).toBuffer());
      keep.add(output);
      candidates.push({ src: path, width: candidate, height: Math.round((height * candidate) / width) });
    }
    manifest[slug] = { source: image, fingerprint: sourceFingerprint(image), candidates };
    console.log(`${slug}: ${width}x${height} -> ${widths.join(', ')}w`);
  }
  for (const file of await readdir(outputDirectory)) {
    const path = join(outputDirectory, file);
    if (!keep.has(path)) {
      await unlink(path);
      console.log(`removed unused ${file}`);
    }
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
