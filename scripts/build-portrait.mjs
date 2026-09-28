/**
 * Regenerates every published portrait asset from the master photograph.
 *
 * `assets/portrait.jpg` is the single source of truth. Running `npm run portrait`
 * rebuilds the homepage polaroid candidates and the link-preview card from it, so a new
 * photo only ever has to be dropped in one place.
 *
 * The link-preview card is drawn as SVG using the same palette, fonts, and KC mark the
 * site ships, then rasterised with resvg. The site's WOFF2 faces are decompressed to
 * TrueType in a temporary directory because resvg cannot read WOFF2 directly.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { decompress } from 'wawoff2';
import { PORTRAIT_MASTER } from '../src/lib/portrait-source.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const master = join(root, PORTRAIT_MASTER);
const publicDir = join(root, 'public');
const generatedSocialImageModule = join(root, 'src', 'lib', 'portrait-social-image.generated.mjs');

/** Palette tokens mirrored from `src/styles/global.css`. */
const GROUND = '#f5f7f9';
const INK = '#101116';
const BLUE = '#2c4ed5';
const CORAL = '#f1453b';

/** Homepage copy, mirrored from `src/pages/index.astro` and wrapped for the card. */
const HEADING = 'Kaleb Cole';
const DESCRIPTION_LINES = [
  'I share what interests me here,',
  'along with things that might',
  'help someone else learn.',
];
const DOMAIN = 'kalebcole.com';

/** Faces shipped in `public/fonts`, paired with the family name recorded inside each file. */
const FACES = [
  { file: 'bricolage-grotesque-latin.woff2', family: 'Bricolage Grotesque 96pt' },
  { file: 'recursive-casual-latin.woff2', family: 'Recursive Sans Linear Light Casual Cursive' },
  { file: 'azeret-mono-latin.woff2', family: 'Azeret Mono Thin' },
];

/** Card geometry, measured from the approved link-preview design. */
const CARD = { width: 1200, height: 630 };
const POLAROID = { centerX: 301.5, centerY: 314.5, width: 520, height: 562, border: 13.5, angle: -1.1458 };
const PHOTO = { width: POLAROID.width - POLAROID.border * 2, height: POLAROID.height - POLAROID.border * 2 };

/**
 * Ink widths the approved design produces, used to prove the real faces were applied.
 * A family that fails to resolve silently falls back to another face, which shifts these
 * measurements by tens of pixels.
 */
const EXPECTED_WIDTHS = [
  { label: 'accent rule', width: 145 },
  { label: 'heading', width: 384 },
  { label: 'description line 1', width: 477 },
  { label: 'description line 2', width: 435 },
  { label: 'description line 3', width: 373 },
  { label: 'KC mark', width: 78 },
  { label: 'domain', width: 168 },
];
const WIDTH_TOLERANCE = 8;

/** Raster variants served from `public`, matching the polaroid's srcset candidates. */
const VARIANTS = [
  { file: 'me.jpg', size: 1600, encode: (pipeline) => pipeline.jpeg({ quality: 90, mozjpeg: true }) },
  { file: 'me-1600.webp', size: 1600, encode: (pipeline) => pipeline.webp({ quality: 85 }) },
  { file: 'me-1200.webp', size: 1200, encode: (pipeline) => pipeline.webp({ quality: 85 }) },
  { file: 'me-600.webp', size: 600, encode: (pipeline) => pipeline.webp({ quality: 82 }) },
  { file: 'me-300.webp', size: 300, encode: (pipeline) => pipeline.webp({ quality: 80 }) },
];

function escapeText(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function loadFontFiles(directory) {
  const paths = [];
  // Written one at a time: resvg resolves families unreliably when the faces land concurrently.
  for (const { file } of FACES) {
    const truetype = await decompress(await readFile(join(publicDir, 'fonts', file)));
    const path = join(directory, file.replace(/\.woff2$/, '.ttf'));
    await writeFile(path, truetype);
    paths.push(path);
  }
  return paths;
}

function buildCardSvg(photoDataUri) {
  const [bricolage, recursive, azeret] = FACES.map((face) => face.family);
  const frameX = POLAROID.centerX - POLAROID.width / 2;
  const frameY = POLAROID.centerY - POLAROID.height / 2;
  const description = DESCRIPTION_LINES.map(
    (line, index) =>
      `  <text x="600" y="${291 + index * 41.5}" font-family="${recursive}" font-size="30.4" fill="${INK}">${escapeText(line)}</text>`,
  ).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}">
  <defs>
    <filter id="polaroid-shadow" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="10" stdDeviation="22" flood-color="#1b2740" flood-opacity="0.15"/>
    </filter>
  </defs>
  <rect width="${CARD.width}" height="${CARD.height}" fill="${GROUND}"/>
  <g transform="rotate(${POLAROID.angle} ${POLAROID.centerX} ${POLAROID.centerY})" filter="url(#polaroid-shadow)">
    <rect x="${frameX}" y="${frameY}" width="${POLAROID.width}" height="${POLAROID.height}" fill="#ffffff"/>
    <image x="${frameX + POLAROID.border}" y="${frameY + POLAROID.border}" width="${PHOTO.width}" height="${PHOTO.height}" preserveAspectRatio="xMidYMid slice" href="${photoDataUri}"/>
  </g>
  <rect x="600" y="85" width="116" height="10" rx="5" fill="${BLUE}"/>
  <circle cx="737.5" cy="90" r="7.5" fill="${CORAL}"/>
  <text x="600" y="220" font-family="${bricolage}" font-weight="800" font-size="83" fill="${INK}">${escapeText(HEADING)}</text>
${description}
  <g transform="translate(1001.7 443.7) scale(2.78)">
    <path d="M5 28V5m0 14L15 9M8 16l9 10c3 3 9 2 11-2" fill="none" stroke="${BLUE}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="27.5" cy="24" r="3.5" fill="${CORAL}"/>
  </g>
  <text x="1091" y="574" text-anchor="end" font-family="${azeret}" font-size="20.2" fill="${INK}">${escapeText(DOMAIN)}</text>
</svg>`;
}

/** Groups the card's right-hand column into vertical runs of ink, top to bottom. */
function measureInkRuns(pixels, width, height) {
  const ground = [0xf5, 0xf7, 0xf9];
  const isGround = (offset) =>
    Math.abs(pixels[offset] - ground[0]) < 6 &&
    Math.abs(pixels[offset + 1] - ground[1]) < 6 &&
    Math.abs(pixels[offset + 2] - ground[2]) < 6;

  const runs = [];
  let current = null;
  for (let y = 0; y < height; y += 1) {
    let minX = width;
    let maxX = -1;
    // Start right of the polaroid so its drop shadow never counts as ink.
    for (let x = 598; x < width; x += 1) {
      if (!isGround((y * width + x) * 4)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    if (maxX < 0) {
      current = null;
      continue;
    }
    if (current) {
      current.minX = Math.min(current.minX, minX);
      current.maxX = Math.max(current.maxX, maxX);
    } else {
      current = { minX, maxX };
      runs.push(current);
    }
  }
  return runs;
}

function verifyCard(pixels, width, height) {
  const runs = measureInkRuns(pixels, width, height);
  assert.equal(
    runs.length,
    EXPECTED_WIDTHS.length,
    `card should render ${EXPECTED_WIDTHS.length} bands of content, found ${runs.length}`,
  );
  EXPECTED_WIDTHS.forEach(({ label, width: expected }, index) => {
    const actual = runs[index].maxX - runs[index].minX + 1;
    assert.ok(
      Math.abs(actual - expected) <= WIDTH_TOLERANCE,
      `${label} is ${actual}px wide, expected about ${expected}px: the intended font was probably not applied`,
    );
  });
}

async function writeVariants() {
  for (const { file, size, encode } of VARIANTS) {
    const buffer = await encode(sharp(master).resize(size, size, { fit: 'cover', position: 'centre' })).toBuffer();
    await writeFile(join(publicDir, file), buffer);
    console.log(`${file.padEnd(24)} ${size}x${size}  ${(buffer.length / 1024).toFixed(1)} KB`);
  }
}

async function writeSocialCard(fontFiles) {
  // Embedded at twice the photo window so the rotation stays crisp after downscaling.
  const photo = await sharp(master)
    .resize(Math.round(PHOTO.width * 2), Math.round(PHOTO.height * 2), { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();

  const rendered = new Resvg(buildCardSvg(`data:image/jpeg;base64,${photo.toString('base64')}`), {
    font: { fontFiles, loadSystemFonts: false },
    fitTo: { mode: 'width', value: CARD.width },
  }).render();

  verifyCard(rendered.pixels, rendered.width, rendered.height);

  const buffer = await sharp(rendered.pixels, {
    raw: { width: rendered.width, height: rendered.height, channels: 4 },
  })
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer();

  const socialVersion = createHash('sha256').update(buffer).digest('hex').slice(0, 12);
  const socialFilename = `homepage-${socialVersion}.png`;
  const socialCard = `social/${socialFilename}`;
  await writeFile(join(publicDir, socialCard), buffer);
  await writeFile(
    generatedSocialImageModule,
    `// Generated by scripts/build-portrait.mjs. Do not edit.\nexport const PORTRAIT_SOCIAL_IMAGE = '/${socialCard}';\n`,
  );
  console.log(`${socialCard.padEnd(24)} ${rendered.width}x${rendered.height}  ${(buffer.length / 1024).toFixed(1)} KB`);

  const socialDirectory = join(publicDir, 'social');
  for (const file of await readdir(socialDirectory)) {
    if (/^homepage-(?:v\d+|[0-9a-f]{12})\.png$/.test(file) && file !== socialFilename) {
      await unlink(join(socialDirectory, file));
    }
  }
}

const fontDirectory = await mkdtemp(join(tmpdir(), 'kalebcole-fonts-'));
try {
  const fontFiles = await loadFontFiles(fontDirectory);
  await writeVariants();
  await writeSocialCard(fontFiles);
} finally {
  await rm(fontDirectory, { recursive: true, force: true });
}
