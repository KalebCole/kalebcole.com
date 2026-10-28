import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// Astro's own frontmatter parser, the one its glob loader uses for content collections.
import { parseFrontmatter } from "@astrojs/markdown-remark";

import { recommendUrl, recommendUrlProblems } from "../src/lib/recommend-url.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const fixtures = path.join(repositoryRoot, "test", "fixtures", "recommend-urls");
const astroBin = path.join(repositoryRoot, "node_modules", "astro", "astro.js");

// Where each dirty fixture is placed under src/content/recommends, and what the build must report.
const dirtyCases = {
  "subfolder-published.md": { place: "nested/deeper/subfolder-published.md", expect: /utm_campaign/ },
  "block-scalar.md": { place: "block-scalar.md", expect: /utm_source/ },
  "spaced-key.md": { place: "spaced-key.md", expect: /fbclid/ },
  "quoted-key.md": { place: "quoted-key.md", expect: /parameters: srsltid\b/ },
  "next-line-value.md": { place: "next-line-value.md", expect: /gclid/ },
  "yaml-escape.md": { place: "yaml-escape.md", expect: /parameters: si\b/ },
  "bom.md": { place: "bom.md", expect: /parameters: si\b/ },
  "userinfo.md": { place: "userinfo.md", expect: /userinfo/ },
  "draft-dirty-image.md": { place: "draft-dirty-image.md", expect: /image: .*token/ },
};

function frontmatterOf(directory, file) {
  return parseFrontmatter(readFileSync(path.join(fixtures, directory, file), "utf8"), {
    frontmatter: "empty-with-spaces",
  }).frontmatter;
}

function issuesFor(data) {
  return ["url", "image"]
    .filter((field) => data[field] !== undefined)
    .flatMap((field) => {
      const result = recommendUrl.safeParse(data[field]);
      return result.success ? [] : result.error.issues.map((issue) => `${field}: ${issue.message}`);
    });
}

test("fixture coverage matches the dirty fixture directory", () => {
  assert.deepEqual(readdirSync(path.join(fixtures, "dirty")).sort(), Object.keys(dirtyCases).sort());
});

test("schema refine accepts clean fixtures, including a trailing YAML comment", () => {
  for (const file of readdirSync(path.join(fixtures, "clean"))) {
    assert.deepEqual(issuesFor(frontmatterOf("clean", file)), [], file);
  }
});

test("schema refine rejects every dirty fixture as Astro parses it", () => {
  for (const [file, { expect }] of Object.entries(dirtyCases)) {
    const issues = issuesFor(frontmatterOf("dirty", file));
    assert.ok(issues.some((issue) => expect.test(issue)), `${file}: ${issues.join(" | ")}`);
  }
});

test("schema refine names the cleaned URL and the offending parameters", () => {
  const result = recommendUrl.safeParse("https://open.spotify.com/episode/x?si=abc&utm_source=copy-link");
  assert.equal(result.success, false);
  assert.match(
    result.error.issues[0].message,
    /tracking, share, or credential query parameters: si, utm_source\. Use https:\/\/open\.spotify\.com\/episode\/x /,
  );
  assert.deepEqual(recommendUrlProblems("https://example.com/a?"), [
    "must not end with an empty query string. Use https://example.com/a",
  ]);
  assert.deepEqual(recommendUrlProblems("https://example.com/a#section"), []);
});

function buildWith(entries) {
  const root = mkdtempSync(path.join(os.tmpdir(), "recommend-url-build-"));
  try {
    for (const name of ["astro.config.mjs", "package.json", "tsconfig.json", "src", "public", "scripts", "automations"]) {
      cpSync(path.join(repositoryRoot, name), path.join(root, name), { recursive: true });
    }
    symlinkSync(path.join(repositoryRoot, "node_modules"), path.join(root, "node_modules"), "dir");
    for (const [source, place] of entries) {
      const destination = path.join(root, "src", "content", "recommends", place);
      mkdirSync(path.dirname(destination), { recursive: true });
      cpSync(source, destination);
    }
    const result = spawnSync(process.execPath, [astroBin, "build"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, GITHUB_TOKEN: "" },
    });
    return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("astro build passes with the clean fixtures added", () => {
  const clean = readdirSync(path.join(fixtures, "clean")).map((file) => [path.join(fixtures, "clean", file), `clean/${file}`]);
  const { status, output } = buildWith(clean);
  assert.equal(status, 0, output);
});

for (const [file, { place, expect }] of Object.entries(dirtyCases)) {
  test(`astro build fails on dirty fixture ${file}`, () => {
    const { status, output } = buildWith([[path.join(fixtures, "dirty", file), place]]);
    assert.notEqual(status, 0, output);
    assert.match(output, /InvalidContentEntryDataError/);
    assert.match(output, expect);
  });
}
