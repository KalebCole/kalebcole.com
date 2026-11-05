// Shared helpers and constants for the site check modules (tests/site/checks/*.mjs).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { PRODUCTION_ORIGIN, resolveSocialImageOrigin } from '../../../src/lib/site-origin.mjs';
import { dist, root } from '../../support/root.mjs';

export { dist, root };
export const blogSource = join(root, 'src', 'content', 'blog');
export const site = PRODUCTION_ORIGIN;
export const socialImageOrigin = resolveSocialImageOrigin(process.env);
export const emDash = String.fromCodePoint(0x2014);
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
export const budgets = {
  html: 50 * 1024,
  css: 50 * 1024,
  javascript: 50 * 1024,
  fonts: 220 * 1024,
  lcpImage: 300 * 1024,
  socialImage: 500 * 1024,
  route: 800 * 1024,
  requests: 25,
};

export function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

export function text(path) {
  return readFileSync(path, 'utf8');
}

export function utf8Text(path) {
  const buffer = readFileSync(path);
  if (buffer.includes(0)) return null;
  try {
    return utf8Decoder.decode(buffer);
  } catch {
    return null;
  }
}

export function gzipSize(path) {
  return gzipSync(readFileSync(path)).byteLength;
}

export function matches(source, expression) {
  return [...source.matchAll(expression)];
}

export function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match ? (match[1] ?? match[2]) : undefined;
}

export function metaContent(source, attributeName, attributeValue) {
  const tag = matches(source, /<meta\b[^>]*>/gi)
    .map((match) => match[0])
    .find((candidate) => attribute(candidate, attributeName) === attributeValue);
  return tag ? attribute(tag, 'content') : undefined;
}

export function routeForHtml(path) {
  const name = relative(dist, path).replaceAll('\\', '/');
  if (name === 'index.html') return '/';
  if (name === '404.html') return '/404';
  return `/${name.replace(/\/index\.html$/, '/').replace(/\.html$/, '')}`;
}

export function outputForPath(pathname) {
  if (pathname === '/') return join(dist, 'index.html');
  if (pathname === '/404') return join(dist, '404.html');
  const clean = pathname.replace(/^\/|\/$/g, '');
  return join(dist, clean, 'index.html');
}

export function localAsset(url) {
  const pathname = url.split(/[?#]/)[0];
  return pathname.startsWith('/') ? join(dist, ...pathname.slice(1).split('/')) : null;
}

export function pngDimensions(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.toString('ascii', 1, 4), 'PNG', `${path} must be PNG`);
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

export function icoDimensions(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.readUInt16LE(0), 0, 'ICO reserved field');
  assert.equal(buffer.readUInt16LE(2), 1, 'ICO type');
  const count = buffer.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => {
    const offset = 6 + index * 16;
    return [buffer[offset] || 256, buffer[offset + 1] || 256];
  });
}

// Wraps a module's assertions so its check returns failures instead of throwing.
// Assertions inside one module still stop at that module's first failure.
export function collect(name, run) {
  return async (context) => {
    try {
      await run(context);
      return [];
    } catch (error) {
      return [{ module: name, message: error?.message ?? String(error) }];
    }
  };
}
