#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { visit } from "unist-util-visit";
import sharp from "sharp";

const VERSION = 1;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const sha = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message) => {
  throw new Error(`Obsidian blog: ${message}`);
};
const slash = (value) => value.split(path.sep).join("/");
const canonicalSlug = (value) =>
  value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
function contained(root, target) {
  const relative = path.relative(root, target);
  return (
    relative &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}
function safeRelative(value, label) {
  if (
    typeof value !== "string" ||
    !value ||
    path.isAbsolute(value) ||
    value.includes("\\")
  )
    fail(`${label} has unsafe path`);
  const normalized = path.posix.normalize(value);
  if (
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  )
    fail(`${label} has unsafe path`);
  return normalized;
}
async function realDirectory(value, label) {
  const resolved = await realpath(value).catch(() => null);
  if (!resolved) fail(`${label} must be a real directory`);
  const info = await lstat(resolved).catch(() => null);
  if (!info?.isDirectory() || info.isSymbolicLink())
    fail(`${label} must be a real directory`);
  return resolved;
}
async function regular(root, relative, label) {
  relative = safeRelative(relative, label);
  const target = path.resolve(root, relative);
  if (!contained(root, target)) fail(`${label} is outside root`);
  let current = root;
  for (const part of path.relative(root, target).split(path.sep)) {
    current = path.join(current, part);
    const info = await lstat(current).catch(() => null);
    if (!info) fail(`${label} does not exist: ${relative}`);
    if (info.isSymbolicLink()) fail(`${label} uses a symlink: ${relative}`);
  }
  if (!(await lstat(target)).isFile())
    fail(`${label} is not a regular file: ${relative}`);
  return target;
}
function date(value, label) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) ||
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value
  )
    fail(`${label} must be a real YYYY-MM-DD date`);
}
function parseFrontmatter(source, label) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) fail(`${label} needs YAML frontmatter`);
  let data;
  try {
    data = parseYaml(match[1], { uniqueKeys: true });
  } catch {
    fail(`${label} has invalid YAML frontmatter`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    fail(`${label} needs YAML object frontmatter`);
  return { data, body: source.slice(match[0].length) };
}
function meta(data, label, defaultSlug) {
  const allowed = new Set([
    "publish",
    "title",
    "description",
    "date",
    "updated",
    "tags",
    "draft",
    "slug",
  ]);
  for (const key of Object.keys(data))
    if (!allowed.has(key))
      fail(`${label} has unsupported frontmatter field: ${key}`);
  if (data.publish !== true) fail(`${label} requires publish: true`);
  if (typeof data.title !== "string" || !data.title.trim())
    fail(`${label} requires title`);
  if (typeof data.description !== "string" || !data.description.trim())
    fail(`${label} requires description`);
  date(data.date, `${label} date`);
  if (data.updated !== undefined) date(data.updated, `${label} updated`);
  if (
    data.tags !== undefined &&
    (!Array.isArray(data.tags) ||
      data.tags.some((tag) => typeof tag !== "string"))
  )
    fail(`${label} tags must be a string array`);
  if (data.draft !== undefined && typeof data.draft !== "boolean")
    fail(`${label} draft must be boolean`);
  const slug = data.slug ?? defaultSlug;
  if (typeof slug !== "string" || !slugPattern.test(slug))
    fail(`${label} has invalid slug`);
  return {
    title: data.title,
    description: data.description,
    date: data.date,
    ...(data.updated ? { updated: data.updated } : {}),
    tags: data.tags ?? [],
    draft: data.draft ?? true,
    slug,
  };
}
function markdownInfo(markdown) {
  const tree = unified().use(remarkParse).parse(markdown);
  const protectedRanges = [],
    images = [];
  visit(tree, (node) => {
    if (
      (node.type === "code" || node.type === "inlineCode") &&
      node.position?.start.offset !== undefined
    )
      protectedRanges.push([
        node.position.start.offset,
        node.position.end.offset,
      ]);
    if (node.type === "html") fail("raw HTML is not supported");
    if (node.type === "image" || node.type === "imageReference")
      fail('Markdown image syntax is not supported; use ![[path|meaningful alt]]');
    if (
      (node.type === "link" || node.type === "definition") &&
      /^(javascript|data|vbscript):/i.test(node.url.trim())
    )
      fail(`unsafe URL: ${node.url}`);
    if ((node.type === "link" || node.type === "definition")
      && !/^(?:https?:|mailto:|tel:|\/|#)/i.test(node.url.trim()))
      fail(`relative Markdown links are unsupported; use an approved wiki link: ${node.url}`);
  });
  const protectedAt = (offset) =>
    protectedRanges.some(([start, end]) => offset >= start && offset < end);
  for (const pattern of [
    /%%[\s\S]*?%%/g,
    /==[\s\S]*?==/g,
    /\$\$[\s\S]*?\$\$/g,
    /\[\[[^\]]*(?:#|\^)[^\]]*\]\]/g,
  ])
    for (const match of markdown.matchAll(pattern))
      if (!protectedAt(match.index))
        fail(`unsupported Obsidian construct: ${match[0].slice(0, 40)}`);
  for (const match of markdown.matchAll(/!\[\[/g))
    if (
      !protectedAt(match.index) &&
      !/^!\[\[[^\]|]+(?:\|[^\]]+)?\]\]/.test(markdown.slice(match.index))
    )
      fail("malformed Obsidian image embed");
  for (const match of markdown.matchAll(/\[\[/g))
    if (
      !protectedAt(match.index) &&
      markdown[match.index - 1] !== "\\" &&
      !/^\[\[[^\]|]+(?:\|[^\]]+)?\]\]/.test(markdown.slice(match.index))
    )
      fail("malformed Obsidian link");
  for (const match of markdown.matchAll(/\$([^$\n]+)\$/g))
    if (!protectedAt(match.index) && !/^\$\d+(?:[,.]\d+)?\$$/.test(match[0]))
      fail(`unsupported math construct: ${match[0].slice(0, 40)}`);
  for (const match of markdown.matchAll(/(?:^|\n)\^[A-Za-z0-9-]+(?:\s|$)/g)) {
    const offset = match.index + (match[0].startsWith('\n') ? 1 : 0);
    if (!protectedAt(offset)) fail("unsupported Obsidian block ID");
  }
  return { protectedAt, images };
}
function escapedText(text) {
  return text
    .replaceAll("\\", "\\\\")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
function replaceAll(text, replacements) {
  return replacements
    .sort((a, b) => b.start - a.start)
    .reduce(
      (out, r) => out.slice(0, r.start) + r.value + out.slice(r.end),
      text,
    );
}
async function publicMap(vault, mapping) {
  if (mapping === undefined || mapping === null) mapping = {};
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping))
    fail("public notes map must be an object");
  const byPath = new Map(),
    names = new Map(),
    byTitle = new Map(),
    slugs = new Set(),
    titles = new Set();
  for (const [input, slug] of Object.entries(mapping)) {
    const source = safeRelative(input, "public note mapping");
    if (!source.endsWith(".md"))
      fail(`public note mapping source must be .md: ${input}`);
    if (typeof slug !== "string" || !slugPattern.test(slug))
      fail(`public note mapping has invalid slug: ${input}`);
    if (slugs.has(slug)) fail(`duplicate public note slug: ${slug}`);
    slugs.add(slug);
    const parsed = parseFrontmatter(
      await readFile(
        await regular(vault, source, "public note mapping"),
        "utf8",
      ),
      source,
    );
    const info = meta(
      parsed.data,
      source,
      canonicalSlug(path.basename(source, ".md")),
    );
    if (info.draft || info.slug !== slug)
      fail(
        `public note mapping target must be public and use mapped slug: ${source}`,
      );
    if (titles.has(info.title))
      fail(`duplicate public note title: ${info.title}`);
    titles.add(info.title);
    byPath.set(source, { slug, title: info.title });
    byTitle.set(info.title, source);
    const base = path.posix.basename(source, ".md").toLowerCase();
    names.set(base, [...(names.get(base) ?? []), source]);
  }
  return { byPath, names, byTitle };
}
async function imagePlans(body, vault, noteDir, slug, info) {
  const replacements = [],
    assets = new Map();
  for (const match of body.matchAll(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)) {
    if (info.protectedAt(match.index) || body[match.index - 1] === '\\') continue;
    const ref = match[1].trim(),
      alt = match[2]?.trim();
    if (!alt || /^\d+(?:x\d+)?$/i.test(alt))
      fail(`image needs meaningful alt text: ${ref}`);
    if (!/\.(png|jpe?g|webp)$/i.test(ref))
      fail(`unsupported image type: ${ref}`);
    if (/^[a-z][a-z0-9+.-]*:/i.test(ref))
      fail(`external image is not supported: ${ref}`);
    const vaultRelative = safeRelative(ref, "image");
    const candidates = [];
    try {
      candidates.push(await regular(vault, vaultRelative, "image"));
    } catch (caught) {
      if (!String(caught.message).includes("does not exist")) throw caught;
    }
    if (!candidates.length)
      candidates.push(
        await regular(
          vault,
          slash(path.posix.normalize(path.posix.join(noteDir, ref))),
          "image",
        ),
      );
    const bytes = await readFile(candidates[0]);
    let image;
    try {
      image = sharp(bytes, { animated: false });
    } catch {
      fail(`unsupported image: ${ref}`);
    }
    const dimensions = await image.metadata();
    if (!['png', 'jpeg', 'webp'].includes(dimensions.format))
      fail(`unsupported image format: ${ref}`);
    if (!dimensions.width || !dimensions.height)
      fail(`image has no intrinsic dimensions: ${ref}`);
    if (dimensions.pages && dimensions.pages > 1)
      fail(`animated images are not supported: ${ref}`);
    const key = sha(bytes).slice(0, 16),
      ext = path.extname(ref).toLowerCase().replace(".jpeg", ".jpg"),
      base = `blog/${slug}/assets/${key}`;
    if (!assets.has(key)) {
      const fallbackBytes = await image
        .rotate()
        .resize({
          width: 1792,
          withoutEnlargement: true,
        })
        .toFormat(ext === ".jpg" ? "jpeg" : ext.slice(1))
        .toBuffer();
      const normalized = await sharp(fallbackBytes).metadata();
      assets.set(key, {
        bytes,
        fallbackBytes,
        ext,
        fallback: `${base}${ext}`,
        width: normalized.width,
        height: normalized.height,
        sources: [ref],
        widths: [
          ...new Set(
            [640, 960, 1280, 1792, normalized.width].filter(
              (w) => w <= normalized.width && w <= 1792,
            ),
          ),
        ].sort((a, b) => a - b),
      });
    } else if (!assets.get(key).sources.includes(ref))
      assets.get(key).sources.push(ref);
    const asset = assets.get(key),
      htmlAlt = alt
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll('"', "&quot;");
    const set = asset.widths.map((w) => `/${base}-${w}.webp ${w}w`).join(", ");
    replacements.push({
      start: match.index,
      end: match.index + match[0].length,
      value: `<figure><picture><source srcset="${set}" sizes="(max-width: 56rem) 100cqw, 56rem" type="image/webp"><img src="/${asset.fallback}" alt="${htmlAlt}" width="${asset.width}" height="${asset.height}" loading="lazy" decoding="async"></picture></figure>`,
    });
  }
  // Markdown images, including reference images resolved by remark, are rejected rather than silently passed through.
  for (const image of info.images)
    fail(
      `Markdown image syntax is not supported; use ![[path|meaningful alt]]: ${image.url}`,
    );
  return { replacements, assets };
}
function artifactPath(relative, label = "artifact") {
  relative = safeRelative(relative, label);
  if (!(
    relative === ".obsidian-blog/manifest.json" ||
    relative.startsWith("src/content/blog/") ||
    relative.startsWith("public/blog/")
  ))
    fail(`${label} is outside generator ownership`);
  return relative;
}
async function artifactTarget(root, relative) {
  relative = artifactPath(relative);
  let current = root;
  const parts = relative.split("/");
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    const info = await lstat(current).catch(() => null);
    if (info?.isSymbolicLink())
      fail(`artifact parent uses a symlink: ${relative}`);
    if (info && !info.isDirectory())
      fail(`artifact parent is not a directory: ${relative}`);
  }
  return path.join(root, relative);
}
function parseManifest(bytes) {
  let manifest;
  try {
    manifest = JSON.parse(bytes);
  } catch {
    fail("manifest is invalid JSON");
  }
  if (
    !manifest ||
    manifest.version !== VERSION ||
    !manifest.notes ||
    typeof manifest.notes !== "object" ||
    Array.isArray(manifest.notes)
  )
    fail("manifest has invalid shape");
  const files = new Set(),
    slugs = new Set();
  for (const [source, record] of Object.entries(manifest.notes)) {
    safeRelative(source, "manifest source");
    if (
      !source.endsWith(".md") ||
      !record ||
      typeof record !== "object" ||
      record.source !== source ||
      !slugPattern.test(record.slug) ||
      slugs.has(record.slug) ||
      !Array.isArray(record.files) ||
      !record.hashes ||
      typeof record.hashes !== "object" ||
      !record.links ||
      typeof record.links !== "object" ||
      !record.assets ||
      typeof record.assets !== "object"
    )
      fail("manifest has invalid record");
    slugs.add(record.slug);
    const post = `src/content/blog/${record.slug}.md`;
    if (
      !record.files.includes(post) ||
      new Set(record.files).size !== record.files.length ||
      [...record.files].join("\n") !== [...record.files].sort().join("\n")
    )
      fail("manifest files must be sorted and include its post");
    for (const file of record.files) {
      artifactPath(file, "manifest artifact");
      if (
        file !== post &&
        !new RegExp(
          `^public/blog/${record.slug}/assets/[a-f0-9]{16}(?:-[0-9]+\\.webp|\\.(?:png|jpg|webp))$`,
        ).test(file)
      )
        fail("manifest artifact is outside exact note ownership");
      if (files.has(file)) fail(`manifest duplicates artifact: ${file}`);
      files.add(file);
      if (
        typeof record.hashes[file] !== "string" ||
        !/^[a-f0-9]{64}$/.test(record.hashes[file])
      )
        fail("manifest has invalid hash");
    }
  }
  return manifest;
}
async function readManifest(root) {
  try {
    const target = await artifactTarget(root, ".obsidian-blog/manifest.json");
    const info = await lstat(target).catch(() => null);
    if (!info) return { version: VERSION, notes: {} };
    if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1)
      fail("manifest is unsafe");
    return parseManifest(await readFile(target));
  } catch (caught) {
    if (caught.code === "ENOENT") return { version: VERSION, notes: {} };
    throw caught;
  }
}
async function checkLive(root, relative, expected, required = true) {
  relative = artifactPath(relative);
  const target = await artifactTarget(root, relative);
  const info = await lstat(target).catch(() => null);
  if (!info) {
    if (required) fail(`owned output is missing: ${relative}`);
    return false;
  }
  if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1)
    fail(`owned output is unsafe: ${relative}`);
  if (expected && sha(await readFile(target)) !== expected)
    fail(`edited owned output: ${relative}`);
  return true;
}
async function snapshot(root, manifest) {
  const state = new Map();
  const manifestPath = path.join(root, ".obsidian-blog/manifest.json");
  const manifestInfo = await lstat(manifestPath).catch(() => null);
  if (manifestInfo) {
    if (
      !manifestInfo.isFile() ||
      manifestInfo.isSymbolicLink() ||
      manifestInfo.nlink > 1
    )
      fail("manifest is unsafe");
    state.set(
      ".obsidian-blog/manifest.json",
      sha(await readFile(manifestPath)),
    );
  } else state.set(".obsidian-blog/manifest.json", null);
  for (const record of Object.values(manifest.notes))
    for (const file of record.files)
      state.set(file, sha(await readFile(await artifactTarget(root, file))));
  return state;
}
async function assertSnapshot(root, state) {
  for (const [relative, expected] of state) {
    const target =
      relative === ".obsidian-blog/manifest.json"
        ? path.join(root, relative)
        : await artifactTarget(root, relative);
    const info = await lstat(target).catch(() => null);
    if (expected === null) {
      if (info) fail(`concurrent manifest change detected: ${relative}`);
      continue;
    }
    if (
      !info ||
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.nlink > 1 ||
      sha(await readFile(target)) !== expected
    )
      fail(`concurrent change detected: ${relative}`);
  }
}
async function assertPlanOwnership(root, files, priorFiles) {
  for (const relative of files.keys()) {
    if (relative === ".obsidian-blog/manifest.json") continue;
    const target = await artifactTarget(root, relative);
    const info = await lstat(target).catch(() => null);
    if (!info) continue;
    if (!priorFiles.has(relative))
      fail(`unowned destination collision: ${relative}`);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1)
      fail(`artifact destination is unsafe: ${relative}`);
  }
}
async function allBlog(root) {
  const dir = path.join(root, "src/content/blog");
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".md")) files.push(entry.name);
    if (entry.isDirectory())
      fail("nested blog collection directories are unsupported");
  }
  return files;
}
async function stageValidate(root, plans, stale = []) {
  // A same-volume sibling is required because Node refuses cp(root, child-of-root).
  const stage = path.join(
    path.dirname(root),
    `.${path.basename(root)}-obsidian-stage-${randomUUID()}`,
  );
  await mkdir(stage, { recursive: true });
  try {
    await cp(root, stage, {
      recursive: true,
      filter: (source) => {
        const base = path.basename(source);
        return (
          ![
            "node_modules",
            ".git",
            ".astro",
            "dist",
            ".vercel",
            ".hermes",
            ".obsidian-blog",
          ].includes(base) && !base.startsWith(".env")
        );
      },
    });
    await cp(
      path.join(root, "node_modules"),
      path.join(stage, "node_modules"),
      {
        recursive: true,
        filter: (source) =>
          ![".cache", ".astro"].includes(path.basename(source)),
      },
    );
    for (const file of stale) await rm(path.join(stage, file), { force: true });
    for (const [file, bytes] of plans) {
      const target = path.join(stage, file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
    }
    const git = spawnSync("git", ["rev-parse", "--absolute-git-dir"], {
      cwd: root,
      encoding: "utf8",
    });
    if (git.status !== 0)
      fail(`cannot find git directory: ${git.stderr.trim()}`);
    for (const args of [
      ["run", "build"],
      ["run", "certify"],
    ])
      await new Promise((resolve, reject) => {
        const child = spawn("npm", args, {
          cwd: stage,
          env: {
            ...process.env,
            GITHUB_TOKEN: "",
            GIT_DIR: git.stdout.trim(),
            GIT_WORK_TREE: stage,
          },
          stdio: "inherit",
        });
        child.on("error", reject);
        child.on("exit", (code) =>
          code === 0
            ? resolve()
            : reject(new Error(`npm ${args.join(" ")} failed with ${code}`)),
        );
      });
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
async function promote(root, files, stale, hooks = {}) {
  const tx = path.join(root, ".obsidian-blog", `transaction-${randomUUID()}`);
  await mkdir(tx, { recursive: true });
  const backups = [],
    created = [];
  let preserveTransaction = false;
  try {
    let step = 0;
    const move = async (from, to) => {
      step += 1;
      await hooks.beforeRename?.({ step, from, to });
      await rename(from, to);
    };
    for (const relative of [...stale, ...files.keys()]) {
      const target = await artifactTarget(root, relative),
        info = await lstat(target).catch(() => null);
      if (info && (!info.isFile() || info.isSymbolicLink() || info.nlink > 1))
        fail(`artifact destination is unsafe: ${relative}`);
    }
    for (const relative of stale) {
      const target = await artifactTarget(root, relative);
      if (await lstat(target).catch(() => null)) {
        const backup = path.join(tx, "backup", relative);
        await mkdir(path.dirname(backup), { recursive: true });
        await move(target, backup);
        backups.push([target, backup]);
      }
    }
    for (const [relative, bytes] of files) {
      const target = await artifactTarget(root, relative),
        staged = path.join(tx, "new", relative);
      await mkdir(path.dirname(staged), { recursive: true });
      await writeFile(staged, bytes);
      const exists = await lstat(target).catch(() => null);
      if (exists) {
        const backup = path.join(tx, "backup", relative);
        await mkdir(path.dirname(backup), { recursive: true });
        await move(target, backup);
        backups.push([target, backup]);
      } else created.push(target);
      await mkdir(path.dirname(target), { recursive: true });
      await move(staged, target);
    }
  } catch (caught) {
    let rollback;
    for (const target of created.reverse())
      await rm(target, { force: true }).catch((error) => {
        rollback ??= error;
      });
    for (const [target, backup] of backups.reverse()) {
      await rm(target, { force: true }).catch((error) => {
        rollback ??= error;
      });
      await rename(backup, target).catch((error) => {
        rollback ??= error;
      });
    }
    if (rollback) {
      preserveTransaction = true;
      throw new AggregateError(
        [caught, rollback],
        "promotion and rollback failed; recovery transaction retained",
      );
    }
    throw caught;
  } finally {
    if (!preserveTransaction) await rm(tx, { recursive: true, force: true });
  }
}
export async function generateBlog({
  vault,
  note,
  publicNotes = {},
  siteRoot = process.cwd(),
  validate,
  fsHooks,
} = {}) {
  if (!vault || !note)
    fail(
      "use --vault <root> --note <vault-relative.md> [--public-notes /path/to/map.json]",
    );
  const vaultRoot = await realDirectory(vault, "vault"),
    root = await realDirectory(siteRoot, "site root");
  const control = path.join(root, ".obsidian-blog");
  const controlInfo = await lstat(control).catch(() => null);
  if (
    controlInfo &&
    (!controlInfo.isDirectory() || controlInfo.isSymbolicLink())
  )
    fail("generator control directory must be a real directory");
  if (!controlInfo) await mkdir(control);
  const acquiredControl = await lstat(control);
  const sameControl = async () => {
    const current = await lstat(control).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    return current?.isDirectory() && !current.isSymbolicLink()
      && current.ino === acquiredControl.ino && current.dev === acquiredControl.dev;
  };
  if (
    (await readdir(control)).some((entry) => entry.startsWith("transaction-"))
  )
    fail("pending failed transaction requires manual recovery");
  const lock = path.join(control, "lock");
  try {
    await mkdir(lock);
  } catch {
    fail("another blog generation is running");
  }
  try {
    const sourceRelative = safeRelative(note, "note");
    if (!sourceRelative.endsWith(".md")) fail("note must be a .md file");
    const parsed = parseFrontmatter(
      await readFile(await regular(vaultRoot, sourceRelative, "note"), "utf8"),
      sourceRelative,
    );
    const source = meta(
      parsed.data,
      sourceRelative,
      canonicalSlug(path.basename(sourceRelative, ".md")),
    );
    const map = await publicMap(vaultRoot, publicNotes);
    const info = markdownInfo(parsed.body);
    const { replacements, assets } = await imagePlans(
      parsed.body,
      vaultRoot,
      path.posix.dirname(sourceRelative) === "."
        ? ""
        : path.posix.dirname(sourceRelative),
      source.slug,
      info,
    );
    const usedLinks = {};
    for (const match of parsed.body.matchAll(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    )) {
      if (
        info.protectedAt(match.index) ||
        (match.index > 0 &&
          (parsed.body[match.index - 1] === "!" ||
            parsed.body[match.index - 1] === "\\"))
      )
        continue;
      const ref = match[1].trim(),
        alias = match[2]?.trim() ?? ref;
      let target;
      if (ref.includes('/') || ref.endsWith('.md')) {
        target = map.byPath.get(ref.endsWith('.md')
          ? safeRelative(ref, 'wiki link') : safeRelative(`${ref}.md`, 'wiki link'));
      } else {
        const titleSource = map.byTitle.get(ref);
        const candidates = [
          ...new Set([
            ...(titleSource ? [titleSource] : []),
            ...(map.names.get(ref.toLowerCase()) ?? []),
          ]),
        ];
        if (candidates.length > 1) fail(`ambiguous public note link: ${ref}`);
        if (candidates.length === 1) target = map.byPath.get(candidates[0]);
      }
      if (!target)
        fail(`linked note is not approved for public publishing: ${ref}`);
      if (target.slug === source.slug && source.draft)
        fail("draft source cannot link to itself");
      usedLinks[ref] = `/blog/${target.slug}/`;
      replacements.push({
        start: match.index,
        end: match.index + match[0].length,
        value: `[${escapedText(alias)}](/blog/${target.slug}/)`,
      });
    }
    const body = replaceAll(parsed.body, replacements);
    const out = `---\n${stringifyYaml({ title: source.title, date: source.date, description: source.description, draft: source.draft, tags: source.tags, ...(source.updated ? { updated: source.updated } : {}) }).trim()}\n---\n${body}`;
    const output = `src/content/blog/${source.slug}.md`;
    const old = await readManifest(root);
    const owned = new Set(
      Object.values(old.notes).flatMap((record) => record.files),
    );
    const sameSlug = Object.entries(old.notes).filter(
      ([identity, record]) =>
        identity !== sourceRelative && record.slug === source.slug,
    );
    if (sameSlug.length > 1)
      fail(
        `slug collision with generated source: ${sameSlug.map(([id]) => id).join(", ")}`,
      );
    if (sameSlug.length === 1) {
      const renamedPath = path.join(vaultRoot, sameSlug[0][0]);
      const renamedInfo = await lstat(renamedPath).catch((error) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (renamedInfo)
        fail(`slug collision with generated source: ${sameSlug[0][0]}`);
    }
    const priorKey = old.notes[sourceRelative]
        ? sourceRelative
        : sameSlug[0]?.[0],
      prior = priorKey ? old.notes[priorKey] : undefined;
    for (const record of Object.values(old.notes))
      for (const file of record.files)
        await checkLive(root, file, record.hashes[file]);
    const collection = await allBlog(root);
    if (
      collection.some(
        (file) =>
          canonicalSlug(path.basename(file, ".md")) === source.slug &&
          !owned.has(`src/content/blog/${file}`),
      )
    )
      fail(`slug collision with existing collection output: ${source.slug}`);
    for (const file of collection) {
      if (prior?.files.includes(`src/content/blog/${file}`)) continue;
      const existing = parseFrontmatter(
        await readFile(await regular(root, `src/content/blog/${file}`, 'existing blog entry'), 'utf8'),
        file,
      );
      if (typeof existing.data.title === 'string'
        && existing.data.title.trim().toLowerCase() === source.title.trim().toLowerCase())
        fail(`duplicate article title: ${source.title} (${file})`);
    }
    for (const [mapped, target] of map.byPath)
      if (mapped !== sourceRelative) {
        const file = path.join(root, "src/content/blog", `${target.slug}.md`);
        const publicPost = parseFrontmatter(
          await readFile(file, "utf8").catch(() =>
            fail(`public note mapping has no published blog entry: ${mapped}`),
          ),
          `published mapping ${target.slug}`,
        );
        const published = publicPost.data;
        if (
          typeof published.title !== "string" ||
          !published.title.trim() ||
          typeof published.description !== "string" ||
          !published.description.trim()
        )
          fail(
            `public note mapping points to schema-invalid blog entry: ${mapped}`,
          );
        date(published.date, `published mapping ${target.slug} date`);
        if (published.updated !== undefined)
          date(published.updated, `published mapping ${target.slug} updated`);
        if (published.draft === true)
          fail(`public note mapping points to draft blog entry: ${mapped}`);
      }
    const files = new Map([[output, Buffer.from(out)]]);
    for (const asset of assets.values()) {
      files.set(`public/${asset.fallback}`, asset.fallbackBytes);
      for (const width of asset.widths)
        files.set(
          `public/blog/${source.slug}/assets/${sha(asset.bytes).slice(0, 16)}-${width}.webp`,
          await sharp(asset.bytes)
            .rotate()
            .resize({ width, withoutEnlargement: true })
            .webp()
            .toBuffer(),
        );
    }
    const next = { version: VERSION, notes: { ...old.notes } };
    if (priorKey && priorKey !== sourceRelative) delete next.notes[priorKey];
    const stale = (prior?.files ?? []).filter((file) => !files.has(file));
    const listedFiles = [...files.keys()].sort();
    next.notes[sourceRelative] = {
      source: sourceRelative,
      slug: source.slug,
      links: Object.fromEntries(
        Object.entries(usedLinks).sort(([a], [b]) => a.localeCompare(b)),
      ),
      assets: Object.fromEntries(
        [...assets.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([hash, asset]) => [
            asset.sources.sort().join("|"),
            {
              hash,
              outputs: [
                `public/${asset.fallback}`,
                ...asset.widths.map(
                  (width) =>
                    `public/blog/${source.slug}/assets/${hash}-${width}.webp`,
                ),
              ].sort(),
            },
          ]),
      ),
      files: listedFiles,
      hashes: Object.fromEntries(
        listedFiles.map((file) => [file, sha(files.get(file))]),
      ),
    };
    files.set(
      ".obsidian-blog/manifest.json",
      Buffer.from(`${JSON.stringify(next, null, 2)}\n`),
    );
    const priorFiles = new Set(prior?.files ?? []);
    await assertPlanOwnership(root, files, priorFiles);
    const beforeValidate = await snapshot(root, old);
    if (validate)
      await validate({
        siteRoot: root,
        vault: vaultRoot,
        note: sourceRelative,
        plans: { files, stale },
      });
    else await stageValidate(root, files, stale);
    // The lock spans validation and this second ownership check catches concurrent editors.
    if (!await sameControl()) fail('generator control directory changed during validation');
    await assertSnapshot(root, beforeValidate);
    await assertPlanOwnership(root, files, priorFiles);
    for (const record of Object.values(old.notes))
      for (const file of record.files)
        await checkLive(root, file, record.hashes[file]);
    await promote(root, files, stale, fsHooks);
    return { slug: source.slug, output };
  } finally {
    // Never follow a replaced parent during cleanup. Leave recovery evidence in place.
    if (await sameControl()) {
      await rm(lock, { recursive: true, force: true });
      const entries = await readdir(control);
      if (!entries.length) await rm(control, { recursive: true, force: true });
    }
  }
}
async function cli(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i],
      value = argv[i + 1];
    if (arg === "--vault" || arg === "--note" || arg === "--public-notes") {
      if (!value || value.startsWith("--")) fail(`${arg} requires a value`);
      i += 1;
      if (arg === "--vault") result.vault = value;
      else if (arg === "--note") result.note = value;
      else {
        try {
          result.publicNotes = JSON.parse(await readFile(value, "utf8"));
        } catch {
          fail(`cannot read public notes map: ${value}`);
        }
      }
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: npm run blog:generate -- --vault <root> --note <vault-relative.md> [--public-notes /path/to/map.json]",
      );
      return null;
    } else fail(`unknown argument: ${arg}`);
  }
  return result;
}
if (import.meta.url === `file://${process.argv[1]}`)
  cli(process.argv.slice(2))
    .then((options) => options && generateBlog(options))
    .then((result) => {
      if (result) console.log(`Generated ${result.output}`);
    })
    .catch((caught) => {
      console.error(caught.message);
      process.exitCode = 1;
    });
