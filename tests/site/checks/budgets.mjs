import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { budgets, collect, dist, gzipSize, localAsset, matches, site, text } from './helpers.mjs';

// Per-route cold-cache budgets (DESIGN.md Browser, performance), the portrait LCP image, and no third-party or X widget JavaScript.
export const check = collect('budgets', async ({ routes }) => {
  assert.ok(existsSync(join(dist, 'me-1600.webp')), 'highest-density portrait candidate must be emitted');
  assert.ok(statSync(join(dist, 'me-1600.webp')).size <= budgets.lcpImage, 'highest-density portrait candidate exceeds LCP image budget');

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
    // X post embeds stay static quotes (src/lib/x-post.mjs): no widget loader, even inline, and do-not-track on every embed.
    assert.doesNotMatch(html, /platform\.(?:x|twitter)\.com|widgets\.js/i, `${route} must not load the X widget script`);
    for (const match of matches(html, /<blockquote\b[^>]*class="[^"]*\btwitter-tweet\b[^"]*"[^>]*>/gi)) {
      assert.match(match[0], /\bdata-dnt="true"/, `${route} X post embeds must set data-dnt="true"`);
    }
  }
});
