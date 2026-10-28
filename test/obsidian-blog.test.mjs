import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

const { generateBlog } = await import("../scripts/obsidian-blog.mjs");
const cleanups = [];
test.after(async () => {
  await Promise.all(
    cleanups.map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture(files = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "obsidian-blog-"));
  cleanups.push(root);
  const vault = path.join(root, "vault");
  const site = path.join(root, "site");
  await mkdir(path.join(site, "src/content/blog"), { recursive: true });
  await mkdir(vault, { recursive: true });
  for (const [name, value] of Object.entries(files)) {
    const target = path.join(vault, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, value);
  }
  return { root, vault, site };
}
const note = (body, extra = "") =>
  `---\npublish: true\ntitle: Test post\ndate: 2026-10-16\ndescription: A real description\n${extra}---\n${body}`;
const noop = async () => {};

// Regression: omitted draft is intentionally private, not rejected or rewritten public.
test("preserves omitted and explicit draft metadata", async () => {
  const { vault, site } = await fixture({ "Post.md": note("body") });
  await generateBlog({
    vault,
    note: "Post.md",
    siteRoot: site,
    validate: noop,
  });
  assert.match(
    await readFile(path.join(site, "src/content/blog/post.md"), "utf8"),
    /draft: true/,
  );
  await writeFile(path.join(vault, "Post.md"), note("body", "draft: false\n"));
  await generateBlog({
    vault,
    note: "Post.md",
    siteRoot: site,
    validate: noop,
  });
  assert.match(
    await readFile(path.join(site, "src/content/blog/post.md"), "utf8"),
    /draft: false/,
  );
});

test("rejects impossible dates and non-boolean draft before writing", async () => {
  const { vault, site } = await fixture({
    "Post.md":
      "---\npublish: true\ntitle: Test post\ndate: 2026-02-30\ndescription: A real description\ndraft: nope\n---\nbody",
  });
  await assert.rejects(
    () =>
      generateBlog({ vault, note: "Post.md", siteRoot: site, validate: noop }),
    /date|draft/i,
  );
  await assert.rejects(
    readFile(path.join(site, ".obsidian-blog/manifest.json")),
    { code: "ENOENT" },
  );
});

test("converts real images and public links while preserving code exactly", async () => {
  const { vault, site } = await fixture({
    "posts/Post.md": note(
      "[[Public Note|<literal & alias>]]\n\n![[Attachments/p.png|A meaningful image]]\n\n`[[Private]]`\n\n    ![[also-code.png]]\n\n```md\n[[Private]]\n![[also-code.png]]\n```\n",
      "draft: false\n",
    ),
    "Public Note.md": note("private body", "draft: false\n"),
  });
  await mkdir(path.join(vault, "posts/Attachments"), { recursive: true });
  await sharp({
    create: { width: 20, height: 10, channels: 3, background: "red" },
  })
    .png()
    .toFile(path.join(vault, "posts/Attachments/p.png"));
  await writeFile(
    path.join(site, "src/content/blog/public-note.md"),
    note("published", "draft: false\n").replace('title: Test post', 'title: Public note'),
  );
  await generateBlog({
    vault,
    note: "posts/Post.md",
    siteRoot: site,
    publicNotes: { "Public Note.md": "public-note" },
    validate: noop,
  });
  const output = await readFile(
    path.join(site, "src/content/blog/post.md"),
    "utf8",
  );
  assert.match(output, /\[&lt;literal & alias&gt;\]\(\/blog\/public-note\/\)/);
  assert.match(output, /<picture>/);
  assert.match(output, /`\[\[Private\]\]`/);
  assert.match(output, /```md\n\[\[Private\]\]\n!\[\[also-code.png\]\]/);
});

test("rejects malformed embeds, raw HTML, unsafe reference links, and unsupported constructs", async () => {
  for (const body of [
    "![[broken]",
    '<img src="x">',
    "[bad][x]\n\n[x]: javascript:alert(1)",
    "==highlight==",
    "[[Note#heading]]",
  ]) {
    const { vault, site } = await fixture({ "Post.md": note(body) });
    await assert.rejects(
      () =>
        generateBlog({
          vault,
          note: "Post.md",
          siteRoot: site,
          validate: noop,
        }),
      /unsupported|unsafe|malformed|HTML/i,
    );
  }
});

test("rejects duplicate map slugs, titles, and ambiguous basenames", async () => {
  const { vault, site } = await fixture({
    "Post.md": note("[[Same]]"),
    "a/Same.md":
      "---\npublish: true\ntitle: Shared\ndate: 2026-10-16\ndescription: a\ndraft: false\nslug: one\n---\na",
    "b/Same.md":
      "---\npublish: true\ntitle: Shared\ndate: 2026-10-16\ndescription: b\ndraft: false\nslug: two\n---\nb",
  });
  await assert.rejects(
    () =>
      generateBlog({
        vault,
        note: "Post.md",
        siteRoot: site,
        publicNotes: { "a/Same.md": "one", "b/Same.md": "two" },
        validate: noop,
      }),
    /duplicate.*title|ambiguous/i,
  );
  await assert.rejects(
    () =>
      generateBlog({
        vault,
        note: "Post.md",
        siteRoot: site,
        publicNotes: { "a/Same.md": "one", "b/Same.md": "one" },
        validate: noop,
      }),
    /duplicate.*slug/i,
  );
});

test("resolves an approved wiki link by its exact Obsidian title", async () => {
  const { vault, site } = await fixture({
    "Post.md": note("[[Human title]]", "draft: false\n"),
    "reference.md":
      "---\npublish: true\ntitle: Human title\ndate: 2026-10-16\ndescription: reference\ndraft: false\nslug: reference\n---\nreference",
  });
  await writeFile(
    path.join(site, "src/content/blog/reference.md"),
    note("published reference", "draft: false\n").replace('title: Test post', 'title: Human title'),
  );
  await generateBlog({
    vault,
    note: "Post.md",
    siteRoot: site,
    publicNotes: { "reference.md": "reference" },
    validate: noop,
  });
  assert.match(
    await readFile(path.join(site, "src/content/blog/post.md"), "utf8"),
    /\[Human title\]\(\/blog\/reference\/\)/,
  );
});

test("refuses corrupted manifests and symlinked artifact paths without touching user data", async () => {
  const { root, vault, site } = await fixture({ "Post.md": note("body") });
  await mkdir(path.join(site, ".obsidian-blog"), { recursive: true });
  await writeFile(
    path.join(site, ".obsidian-blog/manifest.json"),
    JSON.stringify({
      version: 1,
      notes: { bad: { slug: "post", files: ["../outside"], hashes: {} } },
    }),
  );
  await assert.rejects(
    () =>
      generateBlog({ vault, note: "Post.md", siteRoot: site, validate: noop }),
    /manifest|path/i,
  );
  await rm(path.join(site, ".obsidian-blog/manifest.json"));
  await mkdir(path.join(root, "outside"), { recursive: true });
  await symlink(
    path.join(root, "outside"),
    path.join(site, "src/content/blog/post.md"),
  );
  await assert.rejects(
    () =>
      generateBlog({ vault, note: "Post.md", siteRoot: site, validate: noop }),
    /unsafe|symlink|collision/i,
  );
  assert.deepEqual(await readdir(path.join(root, "outside")), []);
});

test("rolls back created and stale files when promotion fails after first rename", async () => {
  const { vault, site } = await fixture({
    "Post.md": note("first", "slug: old\n"),
  });
  const options = { vault, note: "Post.md", siteRoot: site, validate: noop };
  await generateBlog(options);
  const old = await readFile(
    path.join(site, "src/content/blog/old.md"),
    "utf8",
  );
  await writeFile(path.join(vault, "Post.md"), note("second", "slug: new\n"));
  let calls = 0;
  await assert.rejects(
    () =>
      generateBlog({
        ...options,
        fsHooks: {
          beforeRename: async () => {
            calls += 1;
            if (calls === 3) throw new Error("injected promotion fault");
          },
        },
      }),
    /injected/,
  );
  assert.equal(
    await readFile(path.join(site, "src/content/blog/old.md"), "utf8"),
    old,
  );
  await assert.rejects(readFile(path.join(site, "src/content/blog/new.md")), {
    code: "ENOENT",
  });
});

test("validation failure and concurrent destination creation leave owned bytes untouched", async () => {
  const { vault, site } = await fixture({ "Post.md": note("first") });
  const options = { vault, note: "Post.md", siteRoot: site, validate: noop };
  await generateBlog(options);
  const before = await readFile(
    path.join(site, "src/content/blog/post.md"),
    "utf8",
  );
  await writeFile(path.join(vault, "Post.md"), note("second"));
  await assert.rejects(
    () =>
      generateBlog({
        ...options,
        validate: async () => {
          throw new Error("validation fails");
        },
      }),
    /validation fails/,
  );
  assert.equal(
    await readFile(path.join(site, "src/content/blog/post.md"), "utf8"),
    before,
  );
});

test("refuses an unowned planned asset even when its bytes match", async () => {
  const { vault, site } = await fixture({
    "Post.md": note("![[p.png|alt text]]"),
  });
  const image = await sharp({
    create: { width: 20, height: 10, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  await writeFile(path.join(vault, "p.png"), image);
  const hash = (await import("node:crypto"))
    .createHash("sha256")
    .update(image)
    .digest("hex")
    .slice(0, 16);
  const destination = path.join(site, "public/blog/post/assets", `${hash}.png`);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, image);
  await assert.rejects(
    () =>
      generateBlog({ vault, note: "Post.md", siteRoot: site, validate: noop }),
    /unowned|collision|destination/i,
  );
  assert.deepEqual(await readFile(destination), image);
});

test("refuses a destination created while validation runs", async () => {
  const { vault, site } = await fixture({ "Post.md": note("new body") });
  await assert.rejects(
    () =>
      generateBlog({
        vault,
        note: "Post.md",
        siteRoot: site,
        validate: async () =>
          writeFile(
            path.join(site, "src/content/blog/post.md"),
            "someone else",
          ),
      }),
    /unowned|collision|destination/i,
  );
  assert.equal(
    await readFile(path.join(site, "src/content/blog/post.md"), "utf8"),
    "someone else",
  );
});

test("refuses a manifest changed while validation runs", async () => {
  const { vault, site } = await fixture({ "Post.md": note("body") });
  await assert.rejects(
    () =>
      generateBlog({
        vault,
        note: "Post.md",
        siteRoot: site,
        validate: async () => {
          await mkdir(path.join(site, ".obsidian-blog"), { recursive: true });
          await writeFile(
            path.join(site, ".obsidian-blog/manifest.json"),
            '{"version":1,"notes":{}}\n',
          );
        },
      }),
    /manifest.*changed|concurrent/i,
  );
});

test("rejects a symlinked control directory before creating a lock", async () => {
  const { root, vault, site } = await fixture({ "Post.md": note("body") });
  const outside = path.join(root, "outside");
  await mkdir(outside);
  await symlink(outside, path.join(site, ".obsidian-blog"));
  await assert.rejects(
    () =>
      generateBlog({ vault, note: "Post.md", siteRoot: site, validate: noop }),
    /control|symlink|directory/i,
  );
  assert.deepEqual(await readdir(outside), []);
});

test("allows a mapped published blog entry with omitted draft", async () => {
  const { vault, site } = await fixture({
    "Post.md": note("[[Public]]", "draft: false\n"),
    "Public.md": note("private source", "draft: false\n"),
  });
  await writeFile(
    path.join(site, "src/content/blog/public.md"),
    "---\ntitle: Public\ndate: 2026-10-16\ndescription: published\n---\nbody",
  );
  await generateBlog({
    vault,
    note: "Post.md",
    siteRoot: site,
    publicNotes: { "Public.md": "public" },
    validate: noop,
  });
  assert.match(
    await readFile(path.join(site, "src/content/blog/post.md"), "utf8"),
    /\/blog\/public\//,
  );
});

test("preserves escaped wiki syntax and rejects markdown image references", async () => {
  const { vault, site } = await fixture({ "Post.md": note("\\[[Private]]") });
  await generateBlog({
    vault,
    note: "Post.md",
    siteRoot: site,
    validate: noop,
  });
  assert.match(
    await readFile(path.join(site, "src/content/blog/post.md"), "utf8"),
    /\\\[\[Private\]\]/,
  );
  const second = await fixture({
    "Post.md": note("![alt][photo]\n\n[photo]: image.png"),
  });
  await assert.rejects(
    () =>
      generateBlog({
        vault: second.vault,
        note: "Post.md",
        siteRoot: second.site,
        validate: noop,
      }),
    /Markdown image syntax/i,
  );
});
