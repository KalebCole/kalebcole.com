import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Public ownership proof, not a credential.
export const KEY = 'b149467ffdf96a32d383a2fe6d4ef012';
export const ORIGIN = 'https://kalebcole.com';
const ENDPOINT = 'https://api.indexnow.org/indexnow';

export function validateUrl(value) {
  const url = new URL(value);
  if (url.origin !== ORIGIN || url.username || url.password || url.hash || /[\s\\]/.test(value)) {
    throw new Error(`Only canonical HTTPS kalebcole.com URLs without credentials or fragments are allowed: ${value}`);
  }
  return url.href;
}

export function createPayload(urls) {
  const urlList = [...new Set(urls.map(validateUrl))];
  if (!urlList.length || urlList.length > 10_000) throw new Error('Provide between 1 and 10,000 URLs');
  return { host: 'kalebcole.com', key: KEY, keyLocation: `${ORIGIN}/${KEY}.txt`, urlList };
}

function decodeXml(value) {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (entity) => {
    const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
    if (named[entity]) return named[entity];
    return String.fromCodePoint(entity[2].toLowerCase() === 'x' ? parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1)));
  });
}

export async function sitemapUrls(fetcher = fetch) {
  const visited = new Set();
  async function visit(location) {
    const url = validateUrl(location);
    if (visited.has(url)) return [];
    if (visited.size >= 100) throw new Error('Too many sitemap files');
    visited.add(url);
    const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Sitemap HTTP ${response.status}: ${url}`);
    const xml = await response.text();
    const locations = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((match) => validateUrl(decodeXml(match[1])));
    if (!locations.length) throw new Error(`Empty sitemap: ${url}`);
    if (/<sitemapindex\b/.test(xml)) {
      const urls = [];
      for (const child of locations) urls.push(...await visit(child));
      return urls;
    }
    if (!/<urlset\b/.test(xml)) throw new Error(`Invalid sitemap: ${url}`);
    return locations;
  }
  return visit(`${ORIGIN}/sitemap-index.xml`);
}

export async function main(args, fetcher = fetch, log = console.log) {
  const flags = args.filter((arg) => arg.startsWith('--'));
  if (flags.some((arg) => !['--from-sitemap', '--dry-run'].includes(arg))) throw new Error('Unknown option');
  const urls = args.filter((arg) => !arg.startsWith('--'));
  if (flags.includes('--from-sitemap') && urls.length) throw new Error('Use URLs or --from-sitemap, not both');
  const payload = createPayload(flags.includes('--from-sitemap') ? await sitemapUrls(fetcher) : urls);
  if (flags.includes('--dry-run')) {
    log(JSON.stringify(payload, null, 2));
    return;
  }
  if (readFileSync(new URL(`../public/${KEY}.txt`, import.meta.url), 'utf8') !== KEY) throw new Error('IndexNow key file mismatch');
  const response = await fetcher(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  log(`IndexNow HTTP ${response.status} (${payload.urlList.length} URLs)`);
  if (![200, 202].includes(response.status)) throw new Error(`IndexNow submission failed: HTTP ${response.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
