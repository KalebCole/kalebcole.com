import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

import { findRecommendUrlViolations } from "../scripts/certify-recommend-urls.mjs";
import {
  disallowedQueryParametersIn,
  isDisallowedQueryParameter,
  normalizeRecommendUrl as normalize,
} from "../scripts/recommend-url-policy.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const fixtures = path.join(repositoryRoot, "test", "fixtures", "recommend-urls");

test("keeps YouTube v and t and strips si", () => {
  assert.equal(
    normalize("https://www.youtube.com/watch?v=IroPQ150F6c&si=abc123&t=90"),
    "https://www.youtube.com/watch?v=IroPQ150F6c&t=90",
  );
});

test("strips utm_* in any case", () => {
  assert.equal(normalize("https://example.com/a?utm_source=x&UTM_Medium=y&Utm_Campaign=z"), "https://example.com/a");
});

test("strips the Creating Muse share parameters", () => {
  assert.equal(
    normalize("https://open.spotify.com/episode/5hjExzCXyI72n9uCaC8fyD?si=oSsrvt5HS6qEaS294N-bXQ&utm_source=copy-link"),
    "https://open.spotify.com/episode/5hjExzCXyI72n9uCaC8fyD",
  );
});

test("mixed allowed and blocked parameters keep their original order", () => {
  assert.equal(
    normalize("https://example.com/a?b=2&fbclid=x&a=1&ref=y&c=3"),
    "https://example.com/a?b=2&a=1&c=3",
  );
});

test("already clean URLs are returned byte-for-byte", () => {
  for (const url of [
    "https://example.com/a/",
    "https://example.com/a",
    "https://EXAMPLE.com/Path/?Q=1",
    "https://www.youtube.com/watch?v=IroPQ150F6c",
    "https://example.com/a?x=%2F%20y&z=a+b",
    "https://example.com/a?flag&empty=&dup=1&dup=2",
  ]) {
    assert.equal(normalize(url), url);
  }
});

test("fragments and encoded characters are untouched", () => {
  assert.equal(normalize("https://example.com/a?q=%E2%9C%93&si=1#Section%20Two"), "https://example.com/a?q=%E2%9C%93#Section%20Two");
  assert.equal(normalize("https://example.com/a?si=1#frag?utm_source=x"), "https://example.com/a#frag?utm_source=x");
  assert.equal(normalize("https://example.com/a#frag?utm_source=x"), "https://example.com/a#frag?utm_source=x");
});

test("drops an empty query string", () => {
  assert.equal(normalize("https://example.com/a?"), "https://example.com/a");
  assert.equal(normalize("https://example.com/a?si=1"), "https://example.com/a");
  assert.equal(normalize("https://example.com/a?si=1#top"), "https://example.com/a#top");
});

test("matches decoded names exactly or by listed prefix, so look-alikes are kept", () => {
  // Kept: not an exact listed name and no listed prefix.
  for (const name of ["utmost", "utm", "sig2", "signal", "sis", "keys", "reference", "v", "t"]) {
    assert.equal(isDisallowedQueryParameter(name), false, name);
  }
  // Rejected: exact names, listed prefixes, any case, and percent-encoded spellings.
  for (const name of ["si", "SI", "sig", "ref", "utm_", "utm_anything", "_hsenc", "mc_cid", "utm%5Fsource", "%73i", "%75tm_x%ZZ"]) {
    assert.equal(isDisallowedQueryParameter(name), true, name);
  }
  assert.equal(normalize("https://example.com/a?utmost=1&sig2=2&utm%5Fsource=3"), "https://example.com/a?utmost=1&sig2=2");
});

test("is idempotent", () => {
  for (const url of [
    "https://example.com/a?si=1&&a=1&utm_source=2&",
    "https://example.com/a?&",
    "https://example.com/a?a=1&si=2#b?si=3",
    "https://example.com/a?",
    "https://www.youtube.com/watch?v=IroPQ150F6c&si=abc123&t=90",
    "not a url ?ref=1",
  ]) {
    const once = normalize(url);
    assert.equal(normalize(once), once, url);
  }
});

test("reports disallowed parameter names in order without duplicates", () => {
  assert.deepEqual(
    disallowedQueryParametersIn("https://example.com/a?si=1&a=2&utm_source=3&si=4#ref=5"),
    ["si", "utm_source"],
  );
});

test("certify guard passes a clean fixture directory", () => {
  assert.deepEqual(findRecommendUrlViolations(path.join(fixtures, "clean")), []);
});

test("certify guard names each dirty file, field, and parameter, including drafts and images", () => {
  assert.deepEqual(
    findRecommendUrlViolations(path.join(fixtures, "dirty")).map(({ file, field, parameters }) => ({ file, field, parameters })),
    [
      { file: "draft-image.md", field: "image", parameters: ["token"] },
      { file: "spotify-share.md", field: "url", parameters: ["si", "utm_source"] },
    ],
  );
});

test("certify guard CLI exits non-zero with a readable message", () => {
  assert.throws(
    () => execFileSync(process.execPath, ["scripts/certify-recommend-urls.mjs", path.join(fixtures, "dirty")], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
    (error) => error.status === 1 && /spotify-share\.md: url has tracking, share, or credential query parameters: si, utm_source/.test(error.stderr),
  );
});

test("clean-url CLI prints the normalized URL", () => {
  const output = execFileSync(
    process.execPath,
    ["scripts/clean-url.mjs", "https://www.youtube.com/watch?v=IroPQ150F6c&si=abc123"],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  assert.equal(output, "https://www.youtube.com/watch?v=IroPQ150F6c\n");
});
