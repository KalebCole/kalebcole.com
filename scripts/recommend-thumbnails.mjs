/**
 * Keeps small local WebP copies of every published recommend's artwork.
 *
 *   npm run recommend-thumbnails            (also runs on every build, via prebuild)
 *   npm run recommend-thumbnails -- --force (regenerate everything)
 *
 * It reads the `image` URL from each non-draft file in `src/content/recommends/`.
 * A recommend whose thumbnails are already listed in `src/data/recommend-thumbnails.json`
 * for the same URL, with every WebP file present, is left alone, so a normal build
 * needs no network. A new or changed image is downloaded, resized to the widths in
 * `src/lib/recommend-thumbnails.mjs` (never upscaling), and written to
 * `public/recommends/thumbs/<slug>-<fingerprint>-<width>.webp`. Thumbnails nothing
 * uses are deleted. If a download fails, the build stops and names the recommend.
 *
 * Commit the generated WebP files and JSON with the recommend. The committed copies
 * are a cache: they keep builds offline and keep working if the source host later
 * moves or deletes the image. Use --force after changing widths or encoder settings.
 * Alt text, crop, and layout are unchanged: the card still uses object-fit: cover.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const DOWNLOAD_ATTEMPTS = 3;
const DOWNLOAD_TIMEOUT_MS = 20_000;

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

/**
 * True when a manifest entry already holds valid thumbnails for this exact image URL.
 * @param {{ slug: string, image: string }} recommend
 * @param {any} entry the manifest entry for the slug, if any
 * @param {(publicPath: string) => boolean} fileExists
 */
export function isCachedThumbnail({ slug, image }, entry, fileExists) {
  if (!entry || entry.source !== image || entry.fingerprint !== sourceFingerprint(image)) return false;
  if (!Array.isArray(entry.candidates) || entry.candidates.length === 0) return false;
  return entry.candidates.every(
    (candidate) => candidate.src === thumbnailPath(slug, image, candidate.width) && fileExists(candidate.src),
  );
}

/**
 * Splits published recommends into those served from the committed cache and those
 * that need a download. Pure, so it can be tested without the network.
 */
export function planThumbnails(recommends, manifest, fileExists, { force = false } = {}) {
  const reuse = [];
  const generate = [];
  for (const recommend of recommends) {
    if (!force && isCachedThumbnail(recommend, manifest[recommend.slug], fileExists)) reuse.push(recommend);
    else generate.push(recommend);
  }
  return { reuse, generate };
}

async function download(url) {
  let lastError;
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        headers: { 'user-agent': 'kalebcole.com recommend thumbnails (+https://kalebcole.com/recommends/)' },
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        // A 4xx other than rate limiting will not fix itself; only retry network errors, 429, and 5xx.
        error.permanent = response.status < 500 && response.status !== 429;
        throw error;
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (error.permanent) throw new Error(`${error.message} (not retried)`);
      if (attempt < DOWNLOAD_ATTEMPTS) await new Promise((done) => setTimeout(done, 1000 * attempt));
    }
  }
  throw new Error(`${lastError?.message ?? lastError} after ${DOWNLOAD_ATTEMPTS} attempts`);
}

async function readManifest() {
  if (!existsSync(manifestPath)) return {};
  return JSON.parse(await readFile(manifestPath, 'utf8'));
}

const publicFile = (publicPath) => join(root, 'public', ...publicPath.split('/').filter(Boolean));

async function main() {
  const force = process.argv.includes('--force');
  await mkdir(outputDirectory, { recursive: true });
  const previous = await readManifest();
  const recommends = await publishedRecommendImages();
  const { reuse, generate } = planThumbnails(recommends, previous, (path) => existsSync(publicFile(path)), { force });

  const manifest = {};
  const keep = new Set();
  for (const { slug } of reuse) {
    manifest[slug] = previous[slug];
    for (const candidate of previous[slug].candidates) keep.add(publicFile(candidate.src));
  }

  const failures = [];
  // Imported lazily so a fully cached build never loads the image library.
  const sharp = generate.length > 0 ? (await import('sharp')).default : undefined;
  for (const { slug, image } of generate) {
    try {
      const source = await download(image);
      const { width, height } = await sharp(source).metadata();
      const widths = THUMBNAIL_WIDTHS.filter((candidate) => candidate <= width);
      if (widths.length === 0) widths.push(width);
      const candidates = [];
      for (const candidate of widths) {
        const path = thumbnailPath(slug, image, candidate);
        const output = publicFile(path);
        await writeFile(output, await sharp(source).resize({ width: candidate }).webp({ quality: 74, effort: 6 }).toBuffer());
        keep.add(output);
        candidates.push({ src: path, width: candidate, height: Math.round((height * candidate) / width) });
      }
      manifest[slug] = { source: image, fingerprint: sourceFingerprint(image), candidates };
      console.log(`recommend thumbnails: generated ${slug} (${width}x${height} -> ${widths.join(', ')}w)`);
    } catch (error) {
      failures.push(`  - ${slug}: ${image}\n    ${error.message}`);
    }
  }

  if (failures.length > 0) {
    // Leave the cache untouched so a later run can retry.
    throw new Error(
      [
        `recommend thumbnails: could not make thumbnails for ${failures.length} published recommend(s):`,
        ...failures,
        'Fix or remove the `image` URL in src/content/recommends/<slug>.md, or run',
        '`npm run recommend-thumbnails` where the image is reachable and commit',
        'public/recommends/thumbs/ and src/data/recommend-thumbnails.json.',
      ].join('\n'),
    );
  }

  for (const file of await readdir(outputDirectory)) {
    const path = join(outputDirectory, file);
    if (!keep.has(path)) {
      await unlink(path);
      console.log(`recommend thumbnails: removed unused ${file}`);
    }
  }
  const sorted = Object.fromEntries(Object.keys(manifest).sort().map((slug) => [slug, manifest[slug]]));
  const next = `${JSON.stringify(sorted, null, 2)}\n`;
  if (!existsSync(manifestPath) || (await readFile(manifestPath, 'utf8')) !== next) await writeFile(manifestPath, next);

  if (generate.length > 0) {
    console.log('recommend thumbnails: commit public/recommends/thumbs/ and src/data/recommend-thumbnails.json with the recommend so later builds stay offline.');
  } else {
    console.log(`recommend thumbnails: ${reuse.length} up to date, nothing to download.`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
