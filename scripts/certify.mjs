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
  .map((path) => join(root, path));
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
assert.equal(packageJson.scripts.prebuild, 'npm run portrait', 'normal builds must regenerate every portrait derivative');

const writingIndex = text(routes.get('/blog/'));
assert.match(writingIndex, /<title>Writing \| Kaleb Cole<\/title>/i, 'Writing index document title');

const articlePreview = text(routes.get('/blog/hello-world/'));
assert.equal(metaContent(articlePreview, 'property', 'og:image'), homepageImageUrl, 'articles must share the homepage Open Graph image');
assert.equal(metaContent(articlePreview, 'name', 'twitter:image'), homepageImageUrl, 'article Twitter cards must share the homepage image');

assert.doesNotMatch(homepage, /This is where I write through the ideas that get stuck in my head\./i, 'retired hero copy must stay removed');
assert.match(homepage, /href="\/projects"[^>]*>\s*See my projects\s*<\/a>/i, 'homepage hero must link to Projects');
assert.match(homepage, /href="\/blog"[^>]*>\s*Read my writing\s*<\/a>/i, 'homepage hero must link to Writing');
assert.match(homepage, /<section\b[^>]*class="recent-projects"[\s\S]*?<h2[^>]*>Recent projects<\/h2>/i, 'homepage must include Recent projects');
assert.match(homepage, /class="all-projects-link"[^>]*href="\/projects"[^>]*>\s*All projects\s*<span[^>]*>→<\/span>\s*<\/a>/i, 'homepage project preview must end with a minimal All projects link');
const homepageProjectCards = matches(homepage, /<li\b[^>]*class="[^"]*project-index-row[^"]*"[^>]*>/gi);
assert.ok(homepageProjectCards.length > 0 && homepageProjectCards.length <= 2, 'homepage must show between one and two projects');
assert.match(homepage, /Build Your Personal Brand with Copilot/i, 'homepage must use the published series title');
assert.match(homepage, /A YouTube series for the Microsoft Developer channel that guides college students and beginners through turning an existing PDF resume into a portfolio website with GitHub Copilot\./i, 'homepage must explain the series audience and outcome');
assert.doesNotMatch(homepage, /Website \+ video/i, 'homepage must not show redundant project taxonomy');
assert.doesNotMatch(homepage, /Website \+ PowerShell/i, 'homepage must not show redundant project taxonomy');
assert.doesNotMatch(pinnedReposSource, /class="repo-lang"/, 'project cards must not render language metadata');
assert.match(pinnedReposSource, /url: 'https:\/\/kalebcole\.github\.io\/uprint-cli\/'/i, 'uprint override must target its website');
assert.match(pinnedReposSource, /name: 'uprint-cli'/, 'uprint override must use the repository name');
assert.match(pinnedReposSource, /description: 'Agentic CLI for Microsoft Employees to print hassle-free at the Redmond campus'/, 'uprint override must match the GitHub About description');
assert.match(pinnedReposSource, /const override = repoOverrides\[repo\.name as keyof typeof repoOverrides\]/, 'repository overrides must apply on every project surface');
assert.doesNotMatch(pinnedReposSource, /variant === ['"]home['"]\s*\?\s*repoOverrides/, 'repository overrides must not be homepage-only');
assert.match(projectsPage, /Build Your Personal Brand with Copilot/i, 'Projects index must include the published series title');
for (const [surface, html] of [['homepage', homepage], ['Projects index', projectsPage]]) {
  if (/uprint-cli/i.test(html)) {
    assert.match(html, /href="https:\/\/kalebcole\.github\.io\/uprint-cli\/"/i, `${surface} uprint card must target its website`);
    assert.match(html, /src="\/projects\/uprint-website\.webp"/i, `${surface} uprint card must use the website preview`);
    assert.match(html, /Agentic CLI for Microsoft Employees to print hassle-free at the Redmond campus/i, `${surface} uprint card must match the GitHub About description`);
  }
}
assert.ok(homepage.indexOf('class="home-actions"') < homepage.indexOf('class="portrait-mount"'), 'homepage source order must place the complete introduction and actions before the portrait');
assert.ok(existsSync(join(dist, 'projects', 'uprint-website.webp')), 'production build must emit the uprint website preview');
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

const recommends = text(routes.get('/recommends/'));
assert.match(recommends, /class="recommendations-filter-links"[\s\S]*\?medium=read/i, 'no-JS query filters must exist');
assert.match(recommends, /data-recommend-filter="all"[^>]*aria-pressed="true"/i, 'enhanced filters must use aria-pressed');
assert.match(recommends, /role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/i, 'filter count must be announced');
assert.match(recommends, /class="sr-only"> \(external site\)<\/span>/i, 'external recommendation links must name context');
assert.doesNotMatch(recommends, /class="rec-tags"/i, 'recommendation topic tags must stay off the page');

const homepageRecommendations = matches(homepage, /<article\b[^>]*data-home-recommendation[^>]*>[\s\S]*?<\/article>/gi)
  .map((match) => match[0]);
const publishedRecommendationUrls = matches(recommends, /class="rec-title"[\s\S]*?<a\b[^>]*href="([^"]+)"/gi)
  .map((match) => match[1]);
const homepageRecommendationUrls = homepageRecommendations
  .map((item) => item.match(/class="home-recommendation-title"[\s\S]*?<a\b[^>]*href="([^"]+)"/i)?.[1]);
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
if (homepageRecommendations.length > 0) {
  assert.match(homepage, /href="\/recommends"[^>]*>\s*All recommendations/i, 'homepage must link to all recommendations');
  for (const item of homepageRecommendations) {
    assert.match(item, /data-medium="(?:read|watch|listen)"/i, 'homepage recommendation must expose its medium');
    assert.match(item, /<time\b[^>]*datetime="[^"]+"[^>]*>/i, 'homepage recommendation must include a machine-readable date');
    assert.match(item, /class="sr-only"> \(external site\)<\/span>/i, 'homepage external links must name context');
    assert.doesNotMatch(item, /\b(?:rec-tags|priority)\b/i, 'homepage recommendations must not expose tags or priority');
  }
}

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
