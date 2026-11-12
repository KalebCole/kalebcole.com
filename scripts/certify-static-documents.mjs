// Static verification responses and sitemaps are documents, not article pages or RSS feeds.
export function staticDocumentKind(name, source) {
  if (name.endsWith('.html')) {
    return /^google[0-9a-f]+\.html$/.test(name)
      && source.trim() === `google-site-verification: ${name}` ? 'verification' : 'page';
  }
  const root = source.replace(/^<\?xml[^>]*>\s*/, '');
  if ((name === 'sitemap-index.xml' && /^<sitemapindex\b/.test(root))
    || (/^sitemap-\d+\.xml$/.test(name) && /^<urlset\b/.test(root))) return 'sitemap';
  return 'rss';
}
