import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { PRODUCTION_ORIGIN, resolveSocialImageOrigin } from '../src/lib/site-origin.mjs';
import { hasCanonicalResumeLinkInPrimaryNavigation } from './certify-primary-navigation.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = join(root, 'dist');
const site = PRODUCTION_ORIGIN;
const socialImageOrigin = resolveSocialImageOrigin(process.env);
const emDash = String.fromCodePoint(0x2014);
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
const budgets = {
  html: 50 * 1024,
  css: 50 * 1024,
  javascript: 50 * 1024,
  fonts: 220 * 1024,
  lcpImage: 300 * 1024,
  socialImage: 500 * 1024,
  route: 800 * 1024,
  requests: 25,
};

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function text(path) {
  return readFileSync(path, 'utf8');
}

function utf8Text(path) {
  const buffer = readFileSync(path);
  if (buffer.includes(0)) return null;
  try {
    return utf8Decoder.decode(buffer);
  } catch {
    return null;
  }
}

function gzipSize(path) {
  return gzipSync(readFileSync(path)).byteLength;
}

function matches(source, expression) {
  return [...source.matchAll(expression)];
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match ? (match[1] ?? match[2]) : undefined;
}

function metaContent(source, attributeName, attributeValue) {
  const tag = matches(source, /<meta\b[^>]*>/gi)
    .map((match) => match[0])
    .find((candidate) => attribute(candidate, attributeName) === attributeValue);
  return tag ? attribute(tag, 'content') : undefined;
}

function routeForHtml(path) {
  const name = relative(dist, path).replaceAll('\\', '/');
  if (name === 'index.html') return '/';
  if (name === '404.html') return '/404';
  return `/${name.replace(/\/index\.html$/, '/').replace(/\.html$/, '')}`;
}

function outputForPath(pathname) {
  if (pathname === '/') return join(dist, 'index.html');
  if (pathname === '/404') return join(dist, '404.html');
  const clean = pathname.replace(/^\/|\/$/g, '');
  return join(dist, clean, 'index.html');
}

function localAsset(url) {
  const pathname = url.split(/[?#]/)[0];
  return pathname.startsWith('/') ? join(dist, ...pathname.slice(1).split('/')) : null;
}

function pngDimensions(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.toString('ascii', 1, 4), 'PNG', `${path} must be PNG`);
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

function icoDimensions(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.readUInt16LE(0), 0, 'ICO reserved field');
  assert.equal(buffer.readUInt16LE(2), 1, 'ICO type');
  const count = buffer.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => {
    const offset = 6 + index * 16;
    return [buffer[offset] || 256, buffer[offset + 1] || 256];
  });
}

assert.ok(existsSync(dist), 'dist must exist; run the production build first');

const trackedFiles = execFileSync('git', ['ls-files', '-z'], { cwd: root })
  .toString()
  .split('\0')
  .filter(Boolean)
  .map((path) => join(root, path))
  .filter(existsSync);
for (const path of trackedFiles) {
  const source = utf8Text(path);
  if (source === null) continue;
  assert.equal(source.includes(emDash), false, `${relative(root, path)} must not contain em dashes`);
}

const htmlFiles = walk(dist).filter((path) => extname(path) === '.html');
const xmlFiles = walk(dist).filter((path) => extname(path) === '.xml');
const emittedFiles = walk(dist);
const routes = new Map(htmlFiles.map((path) => [routeForHtml(path), path]));
const expectedRoutes = ['/', '/blog/', '/blog/github-copilot-canvases/', '/blog/hello-world/', '/recommends/', '/projects/', '/404'];

for (const route of expectedRoutes) {
  assert.ok(routes.has(route), `production build must emit ${route}`);
}
for (const feed of ['/rss.xml', '/recommends/rss.xml']) {
  assert.ok(existsSync(localAsset(feed)), `production build must emit ${feed}`);
}
const resumePdf = localAsset('/resume.pdf');
assert.ok(existsSync(resumePdf), 'production build must emit /resume.pdf');
const resumeBytes = readFileSync(resumePdf);
assert.equal(resumeBytes.subarray(0, 5).toString('ascii'), '%PDF-', '/resume.pdf must be a valid PDF');
assert.ok(resumeBytes.byteLength > 10_000, '/resume.pdf must not be an empty placeholder');

for (const [route, path] of routes) {
  const html = text(path);
  const h1s = matches(html, /<h1\b/gi);
  const mains = matches(html, /<main\b[^>]*\bid="main-content"/gi);
  assert.equal(h1s.length, 1, `${route} must have one h1`);
  assert.equal(mains.length, 1, `${route} must have one named main landmark`);
  assert.match(html, /<html\b[^>]*\blang="en"/i, `${route} must declare language`);
  assert.match(html, /<a\b[^>]*class="skip-link"[^>]*href="#main-content"/i, `${route} must have a skip link`);
  assert.match(html, /<nav\b[^>]*aria-label="Primary navigation"/i, `${route} must name primary navigation`);
  assert.ok(
    hasCanonicalResumeLinkInPrimaryNavigation(html),
    `${route} primary navigation must link to the canonical résumé PDF`,
  );
  assert.match(html, /<footer\b/i, `${route} must include the shared footer`);
  assert.doesNotMatch(html, /\btabindex="[1-9]\d*"/i, `${route} must not use positive tabindex`);

  const canonical = attribute(html.match(/<link\b[^>]*rel="canonical"[^>]*>/i)?.[0] ?? '', 'href');
  const ogUrl = attribute(html.match(/<meta\b[^>]*property="og:url"[^>]*>/i)?.[0] ?? '', 'content');
  const twitterUrl = metaContent(html, 'name', 'twitter:url');
  assert.ok(canonical?.startsWith(`${site}/`), `${route} canonical must be absolute`);
  assert.equal(ogUrl, canonical, `${route} Open Graph URL must match canonical`);
  assert.equal(twitterUrl, canonical, `${route} Twitter URL must match canonical`);
  for (const property of ['og:title', 'og:description', 'og:type']) {
    assert.match(html, new RegExp(`<meta\\b[^>]*property="${property}"[^>]*content="[^"]+"`, 'i'), `${route} must include ${property}`);
  }
  for (const name of ['description', 'twitter:card', 'twitter:title', 'twitter:description']) {
    assert.match(html, new RegExp(`<meta\\b[^>]*name="${name}"[^>]*content="[^"]+"`, 'i'), `${route} must include ${name}`);
  }
  assert.equal(matches(html, /<meta\b[^>]*name="theme-color"/gi).length, 2, `${route} must include both theme colors`);
  assert.match(html, /<link\b[^>]*rel="alternate"[^>]*type="application\/rss\+xml"/i, `${route} must expose a feed`);
  assert.match(html, /<link\b[^>]*rel="apple-touch-icon"[^>]*sizes="180x180"/i, `${route} must expose the touch icon`);

  for (const match of matches(html, /<img\b[^>]*>/gi)) {
    const tag = match[0];
    assert.ok(attribute(tag, 'alt') !== undefined, `${route} image must have alt text`);
    assert.ok(attribute(tag, 'width') && attribute(tag, 'height'), `${route} image must declare dimensions`);
  }
  for (const match of matches(html, /<video\b[^>]*>/gi)) {
    const tag = match[0];
    assert.ok(
      (attribute(tag, 'width') && attribute(tag, 'height')) || attribute(tag, 'style')?.includes('aspect-ratio'),
      `${route} video must reserve intrinsic space`,
    );
  }

  for (const match of matches(html, /\b(?:href|src)="([^"]+)"/gi)) {
    const url = match[1];
    if (!url.startsWith('/') || url.startsWith('//')) continue;
    const pathname = url.split(/[?#]/)[0];
    if (!pathname || pathname === '/') continue;
    const asset = localAsset(pathname);
    const routeOutput = outputForPath(pathname);
    assert.ok(existsSync(asset) || existsSync(routeOutput), `${route} references missing ${pathname}`);
  }
}

const homepage = text(routes.get('/'));
const projectsPage = text(routes.get('/projects/'));
const pinnedReposSource = text(join(root, 'src', 'components', 'PinnedRepos.astro'));
const homepageDescription = 'I share what interests me here, along with things that might help someone else learn.';
const homepageImageUrl = metaContent(homepage, 'property', 'og:image');
const homepageImageAlt = 'Portrait of Kaleb Cole beside his name, homepage description, and open-tail KC mark.';
assert.equal(resolveSocialImageOrigin(), site, 'local builds must use the production social image origin');
assert.equal(
  resolveSocialImageOrigin({ VERCEL_ENV: 'preview', VERCEL_URL: 'example-preview.vercel.app' }),
  'https://example-preview.vercel.app',
  'preview builds must use the Vercel deployment origin',
);
assert.throws(
  () => resolveSocialImageOrigin({ VERCEL_ENV: 'preview', VERCEL_URL: 'https://example-preview.vercel.app/path' }),
  /bare deployment hostname/,
  'preview deployment origins must reject URLs and paths',
);
assert.equal(metaContent(homepage, 'name', 'description'), homepageDescription, 'homepage description must stay first-person');
assert.equal(metaContent(homepage, 'property', 'og:title'), 'Kaleb Cole', 'homepage Open Graph title');
assert.equal(metaContent(homepage, 'name', 'twitter:title'), 'Kaleb Cole', 'homepage Twitter title');
assert.equal(metaContent(homepage, 'property', 'og:description'), homepageDescription, 'homepage Open Graph description');
assert.equal(metaContent(homepage, 'name', 'twitter:description'), homepageDescription, 'homepage Twitter description');
assert.equal(new URL(homepageImageUrl).origin, socialImageOrigin, 'homepage Open Graph image origin');
assert.equal(metaContent(homepage, 'property', 'og:image:secure_url'), homepageImageUrl, 'homepage secure Open Graph image');
assert.equal(metaContent(homepage, 'name', 'twitter:image'), homepageImageUrl, 'homepage Twitter image');
assert.equal(metaContent(homepage, 'property', 'og:image:type'), 'image/png', 'homepage Open Graph image MIME type');
assert.equal(metaContent(homepage, 'property', 'og:image:width'), '1200', 'homepage Open Graph image width');
assert.equal(metaContent(homepage, 'property', 'og:image:height'), '630', 'homepage Open Graph image height');
assert.equal(metaContent(homepage, 'name', 'twitter:image:width'), '1200', 'homepage Twitter image width');
assert.equal(metaContent(homepage, 'name', 'twitter:image:height'), '630', 'homepage Twitter image height');
assert.equal(metaContent(homepage, 'property', 'og:image:alt'), homepageImageAlt, 'homepage Open Graph image alt text');
assert.equal(metaContent(homepage, 'name', 'twitter:image:alt'), homepageImageAlt, 'homepage Twitter image alt text');
assert.equal(metaContent(homepage, 'name', 'twitter:card'), 'summary_large_image', 'homepage must request a large Twitter card');
assert.match(homepageImageUrl, /homepage-[0-9a-f]{12}\.png$/, 'homepage social image URL must use a content hash');
assert.equal(new URL(metaContent(homepage, 'property', 'og:url')).origin, site, 'preview Open Graph URLs must remain canonical');
assert.equal(new URL(metaContent(homepage, 'name', 'twitter:url')).origin, site, 'preview Twitter URLs must remain canonical');

const homepageImage = localAsset(new URL(homepageImageUrl).pathname);
assert.ok(existsSync(homepageImage), 'homepage social image must exist in the production build');
assert.deepEqual(pngDimensions(homepageImage), [1200, 630], 'homepage social image dimensions');
assert.ok(statSync(homepageImage).size <= budgets.socialImage, 'homepage social image exceeds file-size budget');
const homepageImageHash = createHash('sha256').update(readFileSync(homepageImage)).digest('hex').slice(0, 12);
assert.equal(
  new URL(homepageImageUrl).pathname,
  `/social/homepage-${homepageImageHash}.png`,
  'homepage social image URL must use the final rendered PNG content hash',
);

const packageJson = JSON.parse(text(join(root, 'package.json')));
const globalCss = text(join(root, 'src', 'styles', 'global.css'));
const publicationMotionSource = text(join(root, 'src', 'scripts', 'publication-motion.mjs'));
const polaroidSource = text(join(root, 'src', 'components', 'Polaroid.astro'));
const homepageSource = text(join(root, 'src', 'pages', 'index.astro'));
const projectsSource = text(join(root, 'src', 'pages', 'projects.astro'));
const pinnedWritingSource = text(join(root, 'src', 'components', 'PinnedWriting.astro'));
const recommendCardSource = text(join(root, 'src', 'components', 'RecommendCard.astro'));
const breakpointMotionSource = text(join(root, 'src', 'scripts', 'home-breakpoint-motion.mjs'));
assert.equal(packageJson.scripts.prebuild, 'npm run portrait', 'normal builds must regenerate every portrait derivative');
assert.match(publicationMotionSource, /initProjectPointerMotion/, 'publication motion must provide project pointer tracking');
const finePointerEdgeTilt = globalCss.match(/@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\.project-index-row:hover \.project-visual \{[\s\S]*?\n  \}/)?.[0] ?? '';
assert.doesNotMatch(
  globalCss.match(/\.project-visual\s*\{([\s\S]*?)\n\}/)?.[1] ?? '',
  /(?:--motion-[xy]|perspective|rotate[XY])/,
  'resting project visuals must not apply pointer-position Edge Tilt outside fine-pointer hover',
);
assert.match(publicationMotionSource, /translate:/, 'project entrances must continue using translate');
assert.match(finePointerEdgeTilt, /perspective[\s\S]*?rotateX[\s\S]*?-4deg[\s\S]*?rotateY[\s\S]*?5deg[\s\S]*?translateY\(-6px\)[\s\S]*?box-shadow:/, 'fine-pointer hover must provide bounded tilt, lift, and coral shadow');
assert.match(globalCss, /@media \(hover: hover\) \{[\s\S]*?\.portrait-mount:hover \{[\s\S]*?box-shadow: 14px 18px 0 var\(--coral\);[\s\S]*?transform: translateY\(-6px\) rotate\(0\);/, 'portrait hover must remain available on hover-capable devices');
const projectImageBase = globalCss.match(/\.project-visual img\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
assert.doesNotMatch(projectImageBase, /\btransform\s*:/, 'resting project images must remain untransformed');
assert.match(globalCss, /@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\.project-index-row:hover \.project-visual img\s*\{[\s\S]*?scale\(1\.055\)[\s\S]*?translate3d\(/, 'only fine-pointer hover may apply project image scale and inverse pointer depth');
assert.match(globalCss, /\.project-index-row:focus-within \.project-visual\s*\{[\s\S]*?translateY\(-6px\)[\s\S]*?box-shadow: 0 6px 0 var\(--coral\)/, 'keyboard project depth must use a centered fallback');
assert.match(globalCss, /\.project-index-row:focus-within \.project-visual img\s*\{[\s\S]*?scale\(1\.055\) translate3d\(0, 0, 0\)/, 'keyboard project depth must reset image parallax while preserving scale');
assert.ok(
  globalCss.indexOf('.project-index-row:focus-within .project-visual') > globalCss.indexOf('.project-index-row:hover .project-visual'),
  'keyboard project depth must cascade after equal-specificity hover depth so focus wins during simultaneous hover',
);
assert.match(globalCss, /@media \(pointer: coarse\) \{[\s\S]*?\.project-index-row \.project-visual:active\s*\{[\s\S]*?scale\(\.985\)/, 'coarse pointers must have a pressed project state that can override project hover and focus transforms');
assert.ok(
  globalCss.indexOf('@media (pointer: coarse)') > globalCss.indexOf('.project-index-row:focus-within .project-visual')
    && globalCss.indexOf('@media (pointer: coarse)') > globalCss.indexOf('.project-index-row:hover .project-visual'),
  'coarse pressed state must cascade after keyboard and hover project states',
);
assert.match(globalCss, /\.writing-row:has\(a:hover\),[\s\S]*?\.home-page \.rec:has\(\.rec-title a:hover\)\s*\{[\s\S]*?translateX\(\.55rem\)[\s\S]*?\.writing-row:has\(a:hover\) h3 a,[\s\S]*?color: var\(--blue\);/, 'writing and homepage recommendations must retain their Reading Nudge');
assert.match(globalCss, /\.home-page \.writing-row:focus-within,[\s\S]*?\.home-page \.rec:focus-within\s*\{[\s\S]*?translateX\(\.55rem\)[\s\S]*?\.home-page \.writing-row:focus-within h3 a,[\s\S]*?color: var\(--blue\);/, 'homepage Reading Nudge must provide the same keyboard focus movement and cobalt title color');
assert.doesNotMatch(globalCss, /(?:^|\n)\s*\.writing-row:focus-within\s*\{/m, 'keyboard Reading Nudge must not affect writing indexes or article pages');
assert.match(globalCss, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.project-visual,[\s\S]*?\.project-visual img\s*\{[\s\S]*?transition: none;[\s\S]*?transform: none !important;[\s\S]*?\.project-visual\s*\{[\s\S]*?box-shadow: 6px 7px 0 var\(--coral\);/, 'reduced motion must provide the fixed project Static Mount');
assert.doesNotMatch(globalCss, /\.prose[^,{]*(?::hover|:active|:focus-within)/, 'article prose must not gain interaction motion');
assert.match(
  homepageSource,
  /import \{ initHomeBreakpointMotion \} from '\.\.\/scripts\/home-breakpoint-motion\.mjs';[\s\S]*?initHomeBreakpointMotion\(\);/,
  'homepage must initialize the breakpoint layout motion',
);
assert.equal(
  matches(homepageSource, /\binitPublicationMotion\(\)/g).length,
  1,
  'homepage must initialize publication motion exactly once',
);
assert.doesNotMatch(
  globalCss,
  /\.recent-(?:writing|recommendations)\s*\{\s*animation:/,
  'homepage sections must not retain superseded settle-up entrances outside Publication Story Beats',
);
assert.match(
  breakpointMotionSource,
  /translate:[\s\S]*?opacity: 1[\s\S]*?duration: HOME_LAYOUT_MOTION_DURATION/,
  'homepage breakpoint motion must use the approved layout settle',
);
assert.match(
  breakpointMotionSource,
  /prefers-reduced-motion: reduce[\s\S]*?reducedMotion: reducedMotion\.matches/,
  'homepage breakpoint motion must honor reduced motion',
);
const writingIndex = text(routes.get('/blog/'));
assert.match(writingIndex, /<title>Writing \| Kaleb Cole<\/title>/i, 'Writing index document title');

const articlePreview = text(routes.get('/blog/hello-world/'));
for (const [route, path] of routes) {
  if (route.startsWith('/blog/') && route !== '/blog/') {
    assert.doesNotMatch(text(path), /\bdata-motion-beat\b/i, `${route} article output must not contain publication motion hooks`);
  }
}
assert.equal(metaContent(articlePreview, 'property', 'og:image'), homepageImageUrl, 'articles must share the homepage Open Graph image');
assert.equal(metaContent(articlePreview, 'name', 'twitter:image'), homepageImageUrl, 'article Twitter cards must share the homepage image');

assert.doesNotMatch(homepage, /This is where I write through the ideas that get stuck in my head\./i, 'retired hero copy must stay removed');
assert.match(homepage, /href="\/projects"[^>]*>\s*See my projects\s*<\/a>/i, 'homepage hero must link to Projects');
assert.match(homepage, /href="\/blog"[^>]*>\s*Read my writing\s*<\/a>/i, 'homepage hero must link to Writing');
const homepageHero = homepage.match(/<section\b[^>]*class="home-hero"[^>]*>[\s\S]*?<\/section>/i)?.[0] ?? '';
assert.doesNotMatch(homepageHero, /\bdata-motion-beat\b/i, 'homepage hero and its children must not receive publication motion hooks');
assert.match(homepage, /<section\b[^>]*class="recent-writing"[\s\S]*?<div\b[^>]*class="recent-heading"[^>]*\bdata-motion-beat\b[^>]*>[\s\S]*?<h2[^>]*>Recent writing<\/h2>/i, 'Recent writing heading must be a publication motion beat');
const homepageWritingRows = matches(homepage, /<article\b[^>]*class="writing-row"[^>]*>[\s\S]*?<\/article>/gi)
  .map((match) => match[0]);
const homepageWritingMotionRows = matches(homepage, /<article\b[^>]*class="writing-row"[^>]*\bdata-motion-beat\b[^>]*>/gi);
assert.equal(homepageWritingMotionRows.length, homepageWritingRows.length, 'every homepage writing row must be a publication motion beat');
const writingIndexArchiveRows = matches(writingIndex, /<article\b[^>]*class="writing-row"[^>]*>[\s\S]*?<\/article>/gi)
  .map((match) => match[0]);
const writingDatePresentation = (row, surface) => {
  const href = row.match(/<h3[^>]*>\s*<a\b[^>]*href="([^"]+)"/i)?.[1];
  const date = row.match(/<time\b[^>]*>([\s\S]*?)<\/time>/i)?.[1]?.replace(/\s+/g, ' ').trim();
  assert.ok(href && date, `${surface} writing rows must expose a linked title and date`);
  return [href, date];
};
const writingIndexDates = new Map(writingIndexArchiveRows.map((row) => writingDatePresentation(row, 'Writing index')));
for (const row of homepageWritingRows) {
  const [href, date] = writingDatePresentation(row, 'homepage');
  assert.equal(writingIndexDates.get(href), date, `homepage Writing date presentation must match the corresponding Writing index row (${href})`);
}
const homepagePinnedWriting = homepage.match(/<article\b[^>]*class="pinned-writing"[^>]*>[\s\S]*?<\/article>/i)?.[0];
const writingIndexPinned = writingIndex.match(/<article\b[^>]*class="pinned-writing"[^>]*>[\s\S]*?<\/article>/i)?.[0];
const writingIndexUrls = matches(writingIndex, /<(?:h2|h3)[^>]*>\s*<a\b[^>]*href="([^"]+)"/gi).map((match) => match[1]);
const homepageWritingUrls = [
  homepagePinnedWriting?.match(/<h3[^>]*>\s*<a\b[^>]*href="([^"]+)"/i)?.[1],
  ...matches(homepage, /<article\b[^>]*class="writing-row"[^>]*>[\s\S]*?<h3[^>]*>\s*<a\b[^>]*href="([^"]+)"/gi).map((match) => match[1]),
].filter(Boolean);
assert.equal(Boolean(homepagePinnedWriting), Boolean(writingIndexPinned), 'homepage must use pinned writing whenever the Writing index does');
if (homepagePinnedWriting) {
  assert.match(homepagePinnedWriting, /class="note-mount"[^>]*aria-label="Why this now"/i, 'homepage pinned writing must include Why this now');
  assert.match(homepagePinnedWriting, /<h3[^>]*>\s*<a\b/i, 'homepage pinned writing title must follow its section heading at h3');
  assert.match(writingIndexPinned, /<h2[^>]*>\s*<a\b/i, 'Writing index pinned title must retain its default h2 level');
}
assert.equal(homepageWritingUrls.length, Math.min(3, writingIndexUrls.length), 'homepage writing must use the deliberate three-item cap');
assert.deepEqual(homepageWritingUrls, writingIndexUrls.slice(0, 3), 'homepage writing must match the Writing index newest-first chronology');
assert.doesNotMatch(homepage, /class="year-heading"/i, 'homepage writing preview must not render year headings');
assert.match(homepage, /class="all-writing-link"[^>]*\bdata-motion-beat\b[^>]*href="\/blog"[^>]*>\s*All writing/i, 'homepage writing preview must end with a motion-enabled All writing link');
assert.match(homepage, /<section\b[^>]*class="recent-projects"[\s\S]*?<div\b[^>]*class="recent-heading"[^>]*\bdata-motion-beat\b[^>]*>[\s\S]*?<h2[^>]*>Recent projects<\/h2>/i, 'Recent projects heading must be a publication motion beat');
assert.match(homepage, /class="all-projects-link"[^>]*\bdata-motion-beat\b[^>]*href="\/projects"[^>]*>\s*All projects\s*<span[^>]*>→<\/span>\s*<\/a>/i, 'homepage project preview must end with a motion-enabled All projects link');
const homepageProjectSection = homepage.match(/<section\b[^>]*class="recent-projects"[\s\S]*?<\/section>/i)?.[0] ?? '';
const homepageProjectCards = matches(homepageProjectSection, /<li\b[^>]*class="[^"]*project-index-row[^"]*"[^>]*>/gi);
const homepageProjectVisuals = matches(homepageProjectSection, /<a\b[^>]*class="project-visual"[^>]*\bdata-motion-beat\b[^>]*>/gi);
const homepageProjectCopies = matches(homepageProjectSection, /<div\b[^>]*class="project-index-copy"[^>]*\bdata-motion-beat\b[^>]*>/gi);
assert.ok(homepageProjectCards.length > 0 && homepageProjectCards.length <= 2, 'homepage must show between one and two projects');
assert.equal(homepageProjectVisuals.length, homepageProjectCards.length, 'every homepage project visual must be a publication motion beat');
assert.equal(homepageProjectCopies.length, homepageProjectCards.length, 'every homepage project copy block must be a publication motion beat');
assert.match(homepageProjectSection, /Build Your Personal Brand with Copilot/i, 'homepage must use the published series title');
assert.match(homepageProjectSection, /A YouTube series for the Microsoft Developer channel that guides college students and beginners through turning an existing PDF resume into a portfolio website with GitHub Copilot\./i, 'homepage must explain the series audience and outcome');
assert.doesNotMatch(homepageProjectSection, /Website \+ video/i, 'homepage must not show redundant project taxonomy');
assert.doesNotMatch(homepageProjectSection, /Website \+ PowerShell/i, 'homepage must not show redundant project taxonomy');
assert.doesNotMatch(pinnedReposSource, /class="repo-lang"/, 'project cards must not render language metadata');
assert.match(pinnedReposSource, /url: 'https:\/\/kalebcole\.github\.io\/uprint-cli\/'/i, 'uprint override must target its website');
assert.match(pinnedReposSource, /name: 'uprint-cli'/, 'uprint override must use the repository name');
assert.match(pinnedReposSource, /description: 'Agentic CLI for Microsoft Employees to print hassle-free at the Redmond campus'/, 'uprint override must match the GitHub About description');
assert.match(pinnedReposSource, /'partiful-cli':\s*\{/, 'Partiful must have a presentation override');
assert.match(
  pinnedReposSource,
  /url: 'https:\/\/kalebcole\.github\.io\/partiful-cli\/'/,
  'Partiful override must target its published website',
);
assert.match(
  pinnedReposSource,
  /description: 'Reverse-engineered Partiful’s API into an agentic CLI for managing events\. My favorite workflows match invitations against my calendar and help me find events around Seattle\.'/,
  'Partiful override must use the approved description',
);
assert.match(
  pinnedReposSource,
  /image: '\/projects\/partiful-cli-website\.webp'/,
  'Partiful override must use the local website preview',
);
assert.match(
  pinnedReposSource,
  /imageAlt: 'Partiful CLI homepage with the headline Your agent has the party covered'/,
  'Partiful override must use the approved image alt text',
);
assert.match(
  pinnedReposSource,
  /imageWidth: 1200[\s\S]*?imageHeight: 630/,
  'Partiful preview must declare its generated dimensions',
);
assert.match(pinnedReposSource, /const override = repoOverrides\[repo\.name as keyof typeof repoOverrides\]/, 'repository overrides must apply on every project surface');
assert.doesNotMatch(pinnedReposSource, /variant === ['"]home['"]\s*\?\s*repoOverrides/, 'repository overrides must not be homepage-only');
assert.match(projectsPage, /Build Your Personal Brand with Copilot/i, 'Projects index must include the published series title');
assert.match(projectsPage, /<header\b[^>]*class="page-heading"[^>]*\bdata-motion-beat\b[^>]*>/i, 'Projects heading must be a publication motion beat');
const projectsCards = matches(projectsPage, /<li\b[^>]*class="[^\"]*project-index-row[^\"]*"[^>]*>/gi);
const projectsVisuals = matches(projectsPage, /<a\b[^>]*class="project-visual"[^>]*\bdata-motion-beat\b[^>]*>/gi);
const projectsCopies = matches(projectsPage, /<div\b[^>]*class="project-index-copy"[^>]*\bdata-motion-beat\b[^>]*>/gi);
assert.ok(projectsCards.length > 0, 'Projects index must render projects');
assert.equal(projectsVisuals.length, projectsCards.length, 'every Projects visual must be a publication motion beat');
assert.equal(projectsCopies.length, projectsCards.length, 'every Projects copy block must be a publication motion beat');
assert.equal(matches(projectsSource, /\binitPublicationMotion\(\)/g).length, 1, 'Projects must initialize publication motion exactly once');
assert.doesNotMatch(projectsPage, /Still curious\?|I keep more experiments, tools, and unfinished threads on GitHub\.|Find me on GitHub/i, 'Projects index must not render the removed GitHub onward prompt');
assert.doesNotMatch(projectsPage, /\b(?:case study|case-study|metrics?|stars|forks|language)\b/i, 'Projects index must not add metrics, project-language metadata, or case-study framing');
for (const [surface, html] of [['homepage', homepage], ['Projects index', projectsPage]]) {
  if (/uprint-cli/i.test(html)) {
    assert.match(html, /href="https:\/\/kalebcole\.github\.io\/uprint-cli\/"/i, `${surface} uprint card must target its website`);
    assert.match(html, /src="\/projects\/uprint-website\.webp"/i, `${surface} uprint card must use the website preview`);
    assert.match(html, /Agentic CLI for Microsoft Employees to print hassle-free at the Redmond campus/i, `${surface} uprint card must match the GitHub About description`);
  }
}
assert.match(
  globalCss,
  /grid-template-areas:\s*"greeting"\s*"portrait"\s*"statement"\s*"subtitle"\s*"actions";/,
  'homepage mobile layout must place the portrait between the greeting and statement',
);
const homepageGreetingIndex = homepage.indexOf('class="home-greeting"');
const homepagePortraitIndex = homepage.indexOf('class="portrait-mount"');
const homepageStatementIndex = homepage.indexOf('class="home-statement"');
assert.ok(
  homepageGreetingIndex < homepagePortraitIndex && homepagePortraitIndex < homepageStatementIndex,
  'homepage source order must place the portrait between the greeting and statement',
);
assert.match(
  globalCss,
  /@media \(max-width: 849px\) \{[\s\S]*?\.home-hero \{[\s\S]*?justify-items: center;[\s\S]*?row-gap: 30px;[\s\S]*?padding-block: 44px 68px;[\s\S]*?text-align: center;[\s\S]*?\.portrait-mount \{[\s\S]*?width: min\(292px, calc\(100% - 12px\)\);/,
  'homepage mobile hero must use the approved centered 292px portrait and 30px rhythm',
);
assert.match(
  globalCss,
  /@media \(min-width: 850px\) \{[\s\S]*?\.home-hero \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto;/,
  'homepage desktop composition must wait for a stable text column',
);
assert.match(
  polaroidSource,
  /sizes="\(max-width: 343px\) calc\(100vw - 52px\), \(max-width: 849px\) 292px, 300px"/,
  'homepage portrait sizes hint must match the approved mobile width',
);
assert.ok(existsSync(join(dist, 'projects', 'uprint-website.webp')), 'production build must emit the uprint website preview');
assert.ok(
  existsSync(localAsset('/projects/partiful-cli-website.webp')),
  'production build must emit the Partiful website preview',
);
assert.doesNotMatch(homepage, /projects couldn’t load|find them on GitHub instead/i, 'homepage must not expose project-loading errors');
assert.doesNotMatch(text(routes.get('/projects/')), /projects couldn’t load|find them on GitHub instead/i, 'Projects page must not expose project-loading errors');

const navRoutes = new Map([
  ['/', ['/', 'Kaleb Cole']],
  ['/blog/', ['/blog', 'Writing']],
  ['/recommends/', ['/recommends', 'Recommends']],
  ['/projects/', ['/projects', 'Projects']],
]);
for (const [route, [href, label]] of navRoutes) {
  const html = text(routes.get(route));
  const currentLinks = matches(html, /<a\b[^>]*aria-current="page"[^>]*>[\s\S]*?<\/a>/gi);
  assert.equal(currentLinks.length, 1, `${route} must expose one current-page state`);
  assert.equal(attribute(currentLinks[0][0], 'href'), href, `${route} current-page link destination`);
  assert.match(currentLinks[0][0].replace(/<[^>]+>/g, ' '), new RegExp(`\\b${label}\\b`, 'i'), `${route} current-page label`);
}

assert.match(homepage, /class="nav-menu"[\s\S]*data-nav-toggle[^>]*aria-expanded="false"/i, 'navigation must render a button-controlled compact menu panel');
assert.match(homepage, /data-nav-toggle[^>]*aria-controls="primary-nav-menu"/i, 'navigation must expose a compact menu trigger');

const recommends = text(routes.get('/recommends/'));
assert.match(homepage, /<section\b[^>]*class="recent-recommendations"[\s\S]*?<div\b[^>]*class="recent-heading"[^>]*\bdata-motion-beat\b[^>]*>[\s\S]*?<h2[^>]*>Recent recommendations<\/h2>/i, 'Recent recommendations heading must be a publication motion beat');
assert.match(recommends, /class="recommendations-filter-links"[\s\S]*\?medium=read/i, 'no-JS query filters must exist');
assert.match(recommends, /data-recommend-filter="all"[^>]*aria-pressed="true"/i, 'enhanced filters must use aria-pressed');
assert.match(recommends, /role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/i, 'filter count must be announced');
assert.match(recommends, /class="sr-only"> \(external site\)<\/span>/i, 'external recommendation links must name context');
assert.doesNotMatch(recommends, /class="rec-tags"/i, 'recommendation topic tags must stay off the page');

const homepageRecommendations = matches(homepage, /<article\b[^>]*class="[^"]*\brec\b[^"]*"[^>]*\bdata-recommendation\b[^>]*>[\s\S]*?<\/article>/gi)
  .map((match) => match[0]);
const recommendationCards = matches(recommends, /<article\b[^>]*class="[^"]*\brec\b[^"]*"[^>]*\bdata-recommendation\b[^>]*>[\s\S]*?<\/article>/gi)
  .map((match) => match[0]);
const publishedRecommendationUrls = matches(recommends, /class="rec-title"[\s\S]*?<a\b[^>]*href="([^"]+)"/gi)
  .map((match) => match[1]);
const homepageRecommendationUrls = homepageRecommendations
  .map((item) => item.match(/class="rec-title"[\s\S]*?<a\b[^>]*href="([^"]+)"/i)?.[1]);
assert.equal(
  homepageRecommendations.length,
  Math.min(3, publishedRecommendationUrls.length),
  'homepage recommendations must use the deliberate three-item cap',
);
assert.deepEqual(
  homepageRecommendationUrls,
  publishedRecommendationUrls.slice(0, 3),
  'homepage recommendations must match the published newest-first chronology',
);
assert.doesNotMatch(homepage, /home-recommendation-row|data-home-recommendation|home-recommendation-title/i, 'homepage must not use legacy recommendation markup');
if (homepageRecommendations.length > 0) {
  const homepageRecommendationMotionRows = matches(homepage, /<article\b[^>]*class="[^"]*\brec\b[^"]*"[^>]*\bdata-motion-beat\b[^>]*>/gi);
  assert.equal(homepageRecommendationMotionRows.length, homepageRecommendations.length, 'every homepage recommendation must be a publication motion beat');
  assert.match(homepage, /class="all-recommendations-link"[^>]*\bdata-motion-beat\b[^>]*href="\/recommends"[^>]*>\s*All recommendations/i, 'homepage must end recommendations with a motion-enabled All recommendations link');
  assert.match(homepage, /href="\/recommends"[^>]*>\s*All recommendations/i, 'homepage must link to all recommendations');
  for (const item of homepageRecommendations) {
    assert.match(item, /class="rec-visual"/i, 'homepage recommendation must preserve RecommendCard artwork or medium-mark markup');
    assert.match(item, /class="rec-meta"/i, 'homepage recommendation must preserve RecommendCard metadata');
    assert.match(item, /class="rec-title"/i, 'homepage recommendation must preserve RecommendCard titles');
    assert.match(item, /<h3\b[^>]*class="rec-title"[^>]*>/i, 'homepage recommendation titles must follow their section heading at h3');
    assert.match(item, /data-medium="(?:read|watch|listen)"/i, 'homepage recommendation must expose its medium');
    assert.match(item, /<time\b[^>]*datetime="[^"]+"[^>]*>/i, 'homepage recommendation must include a machine-readable date');
    assert.match(item, /class="sr-only"> \(external site\)<\/span>/i, 'homepage external links must name context');
    assert.doesNotMatch(item, /\b(?:rec-tags|priority)\b/i, 'homepage recommendations must not expose tags or priority');
  }
}
for (const item of recommendationCards) {
  assert.match(item, /<h2\b[^>]*class="rec-title"[^>]*>/i, 'Recommends index titles must retain their default h2 level');
}
assert.match(pinnedWritingSource, /headingLevel\?: 2 \| 3/, 'PinnedWriting must expose an explicit heading-level prop');
assert.match(recommendCardSource, /headingLevel\?: 2 \| 3/, 'RecommendCard must expose an explicit heading-level prop');
assert.match(homepageSource, /<PinnedWriting\b[^>]*\bheadingLevel=\{3\}/, 'homepage pinned writing must request h3 titles');
assert.match(homepageSource, /<RecommendCard\b[^>]*\bheadingLevel=\{3\}/, 'homepage recommendations must request h3 titles');

const cssFiles = walk(dist).filter((path) => extname(path) === '.css');
assert.ok(cssFiles.length > 0, 'production build must emit CSS');
for (const path of cssFiles) {
  assert.ok(gzipSize(path) <= budgets.css, `${relative(dist, path)} exceeds compressed CSS budget`);
  const css = text(path);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/i, 'CSS must include reduced-motion handling');
  assert.match(css, /@media\s*\(forced-colors:\s*active\)/i, 'CSS must include forced-colors handling');
  assert.match(css, /@media\s*\(hover:\s*hover\)/i, 'CSS must gate hover-only effects');
  assert.match(css, /env\(safe-area-inset-bottom\)/i, 'CSS must honor safe areas');
  assert.match(css, /:focus-visible/i, 'CSS must provide visible keyboard focus');
}

const fontFiles = walk(join(dist, 'fonts')).filter((path) => extname(path) === '.woff2');
const compressedFonts = fontFiles.reduce((total, path) => total + gzipSize(path), 0);
assert.ok(compressedFonts <= budgets.fonts, 'compressed font payload exceeds budget');
assert.ok(statSync(join(dist, 'me-600.webp')).size <= budgets.lcpImage, 'largest portrait candidate exceeds LCP image budget');

for (const [route, path] of routes) {
  const html = text(path);
  assert.ok(gzipSize(path) <= budgets.html, `${route} exceeds compressed HTML budget`);
  const resourceUrls = new Set();
  const videoMetadata = new Set();
  const stylesheetUrls = matches(html, /<link\b[^>]*rel="stylesheet"[^>]*href=(?:"([^"]+)"|'([^']+)')[^>]*>/gi)
    .map((match) => match[1] ?? match[2]);
  const preloadUrls = matches(html, /<link\b[^>]*rel="preload"[^>]*href=(?:"([^"]+)"|'([^']+)')[^>]*>/gi)
    .map((match) => match[1] ?? match[2]);
  for (const url of [...stylesheetUrls, ...preloadUrls]) resourceUrls.add(url.split(/[?#]/)[0]);

  const pictureBlocks = matches(html, /<picture\b[^>]*>([\s\S]*?)<\/picture>/gi).map((match) => match[0]);
  for (const picture of pictureBlocks) {
    const candidates = matches(picture, /\b(?:src|srcset)=(?:"([^"]+)"|'([^']+)')/gi)
      .flatMap((match) => (match[1] ?? match[2]).split(','))
      .map((candidate) => candidate.trim().split(/\s+/)[0])
      .map(localAsset)
      .filter((candidate) => candidate && existsSync(candidate));
    const largest = candidates.sort((a, b) => statSync(b).size - statSync(a).size)[0];
    if (largest) resourceUrls.add(`/${relative(dist, largest).replaceAll('\\', '/')}`);
  }
  const htmlWithoutPictures = pictureBlocks.reduce((source, picture) => source.replace(picture, ''), html);
  for (const match of matches(htmlWithoutPictures, /<img\b[^>]*src=(?:"([^"]+)"|'([^']+)')[^>]*>/gi)) {
    const tag = match[0];
    if (!/\bloading="lazy"/i.test(tag)) resourceUrls.add((match[1] ?? match[2]).split(/[?#]/)[0]);
  }
  for (const match of matches(html, /<video\b[^>]*src=(?:"([^"]+)"|'([^']+)')[^>]*>/gi)) {
    const url = (match[1] ?? match[2]).split(/[?#]/)[0];
    if (/\bpreload="metadata"/i.test(match[0])) videoMetadata.add(url);
    else if (!/\bpreload="none"/i.test(match[0])) resourceUrls.add(url);
  }
  const scriptSources = matches(html, /<script\b[^>]*src=(?:"([^"]+)"|'([^']+)')[^>]*>/gi)
    .map((match) => match[1] ?? match[2]);
  const thirdPartyScripts = scriptSources.filter((source) => new URL(source, site).origin !== new URL(site).origin);
  for (const source of scriptSources.filter((source) => !thirdPartyScripts.includes(source))) {
    const url = new URL(source, site);
    resourceUrls.add(url.pathname);
  }

  const stylesheets = stylesheetUrls.map(localAsset).filter((resource) => resource && existsSync(resource));
  const stylesheetSize = stylesheets.reduce((total, resource) => total + gzipSize(resource), 0);
  assert.ok(stylesheetSize <= budgets.css, `${route} exceeds compressed CSS budget`);
  for (const stylesheet of stylesheets) {
    for (const match of matches(text(stylesheet), /url\((?:"([^"]+)"|'([^']+)'|([^)'"]+))\)/gi)) {
      const url = match.slice(1).find(Boolean)?.trim();
      if (url?.startsWith('/')) resourceUrls.add(url.split(/[?#]/)[0]);
    }
  }

  const resources = [...resourceUrls].map(localAsset).filter((path) => path && existsSync(path));
  const scripts = resources.filter((path) => ['.js', '.mjs'].includes(extname(path)));
  const scriptSize = scripts.reduce((total, path) => total + gzipSize(path), 0);
  const metadataResources = [...videoMetadata].map(localAsset).filter((resource) => resource && existsSync(resource));
  const routeSize = gzipSize(path)
    + resources.reduce((total, resource) => total + gzipSize(resource), 0)
    + metadataResources.reduce((total, resource) => total + Math.min(statSync(resource).size, 64 * 1024), 0);
  assert.ok(scriptSize <= budgets.javascript, `${route} exceeds first-party JavaScript budget`);
  assert.ok(routeSize <= budgets.route, `${route} exceeds complete route budget`);
  assert.ok(resources.length + metadataResources.length + 1 <= budgets.requests, `${route} exceeds request budget`);
  assert.equal(thirdPartyScripts.length, 0, `${route} must not load third-party JavaScript`);
}

assert.deepEqual(pngDimensions(join(dist, 'favicon-16x16.png')), [16, 16], '16px favicon dimensions');
assert.deepEqual(pngDimensions(join(dist, 'favicon-32x32.png')), [32, 32], '32px favicon dimensions');
assert.deepEqual(pngDimensions(join(dist, 'apple-touch-icon.png')), [180, 180], 'touch icon dimensions');
const icoSizes = icoDimensions(join(dist, 'favicon.ico'));
assert.ok(icoSizes.some(([width, height]) => width === 16 && height === 16), 'ICO must contain 16px image');
assert.ok(icoSizes.some(([width, height]) => width === 32 && height === 32), 'ICO must contain 32px image');
assert.match(text(join(dist, 'favicon.svg')), /viewBox=/i, 'adaptive SVG must declare a viewBox');

for (const path of xmlFiles) {
  const xml = text(path);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/i, `${relative(dist, path)} XML declaration`);
  assert.match(xml, /<rss\b[^>]*version="2\.0"/i, `${relative(dist, path)} must be RSS 2.0`);
  const items = matches(xml, /<item>([\s\S]*?)<\/item>/gi).map((match) => match[1]);
  assert.ok(items.length > 0, `${relative(dist, path)} must include items`);
  const dates = items.map((item) => Date.parse(item.match(/<pubDate>(.*?)<\/pubDate>/i)?.[1] ?? ''));
  assert.ok(dates.every(Number.isFinite), `${relative(dist, path)} items must have valid dates`);
  assert.deepEqual(dates, [...dates].sort((a, b) => b - a), `${relative(dist, path)} must be newest first`);
  for (const item of items) {
    assert.match(item, /<title>.+<\/title>/i, 'feed item title');
    assert.match(item, /<description>.+<\/description>/i, 'feed item description');
    const link = item.match(/<link>(.*?)<\/link>/i)?.[1];
    assert.ok(link?.startsWith('https://'), 'feed item links must be absolute HTTPS URLs');
  }
}

for (const path of emittedFiles) {
  const source = utf8Text(path);
  if (source === null) continue;
  assert.equal(source.includes(emDash), false, `${relative(dist, path)} must not emit em dashes`);
}

const recommendsFeed = text(join(dist, 'recommends', 'rss.xml'));
const writingFeed = text(join(dist, 'rss.xml'));
assert.match(writingFeed, /<link>https:\/\/kalebcole\.com\/blog\//i, 'Writing feed links must use the production origin');
assert.doesNotMatch(writingFeed, /kalebcole\.dev/i, 'Writing feed must not retain the former origin');
assert.doesNotMatch(recommendsFeed, /kalebcole\.dev/i, 'Recommends feed must not retain the former origin');
assert.match(recommendsFeed, /<category>read<\/category>/i, 'Recommends feed must retain medium categories');
assert.match(recommendsFeed, /<category>curation<\/category>/i, 'Recommends feed may retain hidden topic categories');

const productionNames = walk(dist).map((path) => relative(dist, path).replaceAll('\\', '/'));
assert.equal(
  productionNames.filter((name) => /(?:prototype|comparison|compare|variant)/i.test(name)).length,
  0,
  'production output must not contain prototype or comparison routes',
);

console.log(`Certified ${routes.size} HTML routes, ${xmlFiles.length} feeds, and ${productionNames.length} emitted files.`);
