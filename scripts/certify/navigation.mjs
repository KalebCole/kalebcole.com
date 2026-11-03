import assert from 'node:assert/strict';
import { attribute, collect, matches, text } from './helpers.mjs';

// The résumé link must be in primary navigation and open in the same tab.
export function hasCanonicalResumeLinkInPrimaryNavigation(html) {
  const navigation = html.match(/<nav\b[^>]*aria-label="Primary navigation"[^>]*>([\s\S]*?)<\/nav>/i)?.[1];
  if (navigation === undefined) return false;

  return [...navigation.matchAll(/<a\b[^>]*>Résumé<\/a>/gi)].some((match) => {
    const anchor = match[0];
    if (!/\bhref="\/resume\.pdf"/i.test(anchor)) return false;

    const target = anchor.match(/\btarget(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/i);
    if (!target) return true;

    return (target[1] ?? target[2] ?? target[3] ?? '').toLowerCase() === '_self';
  });
}

// Primary navigation: the résumé link, aria-current on the current page, and the compact menu.
export const check = collect('navigation', async ({ routes, homepage }) => {
  for (const [route, path] of routes) {
    const html = text(path);
    assert.ok(
      hasCanonicalResumeLinkInPrimaryNavigation(html),
      `${route} primary navigation must link to the canonical résumé PDF`,
    );
  }

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
});
