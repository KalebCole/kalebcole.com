import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { generateBlog } from '../scripts/obsidian-blog.mjs';

const content = (body = 'Original words.\n', extra = '') => `---\npublish: true\ntitle: Fixture\ndate: 2020-02-29\ndescription: A fixture description.\ndraft: false\n${extra}---\n${body}`;
async function fixture(t, body = 'Original words.\n', extra = '') {
  const root = await mkdtemp(path.join(tmpdir(), 'obsidian-contract-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const vault = path.join(root, 'vault');
  const siteRoot = path.join(root, 'site');
  await mkdir(vault);
  await mkdir(path.join(siteRoot, 'src/content/blog'), { recursive: true });
  await writeFile(path.join(vault, 'Source.md'), content(body, extra));
  return { root, vault, siteRoot, note: 'Source.md', validate: async () => {} };
}
async function tree(root) {
  const entries = await readdir(root, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  const result = {};
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) for (const [key, value] of Object.entries(await tree(target))) result[`${entry.name}/${key}`] = value;
    else result[entry.name] = createHash('sha256').update(await readFile(target)).digest('hex');
  }
  return result;
}
async function publicTarget(options, file, slug, title) {
  await mkdir(path.dirname(path.join(options.vault, file)), { recursive: true });
  await writeFile(path.join(options.vault, file), content('Do not export the linked body.\n', `slug: ${slug}\n`).replace('title: Fixture', `title: ${title}`));
  await writeFile(path.join(options.siteRoot, 'src/content/blog', `${slug}.md`), content('Existing public content.\n').replace('title: Fixture', `title: ${title}`));
}

test('each missing required field fails without any generated files', async t => {
  for (const field of ['publish', 'title', 'date', 'description']) {
    const options = await fixture(t);
    await writeFile(path.join(options.vault, options.note), content().replace(new RegExp(`^${field}:.*\\n`, 'm'), ''));
    await assert.rejects(generateBlog(options), new RegExp(field));
    assert.deepEqual(await tree(options.siteRoot), {});
  }
});

test('invalid calendar fields produce a metadata error, not an unlabelled RangeError', async t => {
  const options = await fixture(t);
  await writeFile(path.join(options.vault, options.note), content().replace('2020-02-29', '2020-99-99'));
  await assert.rejects(generateBlog(options), /date.*YYYY-MM-DD/);
});

test('code containing block IDs and escaped embeds remains byte-identical', async t => {
  const body = '```md\n^block-id\n[[Private]]\n![[private.png]]\n```\n\n\\![[not-an-image.png]]\n';
  const options = await fixture(t, body);
  await generateBlog(options);
  assert.equal((await readFile(path.join(options.siteRoot, 'src/content/blog/source.md'), 'utf8')).endsWith(body), true);
});

test('a root-level basename does not bypass another approved basename', async t => {
  const options = await fixture(t, '[[Same]]\n');
  await publicTarget(options, 'Same.md', 'root-note', 'Root title');
  await publicTarget(options, 'other/Same.md', 'other-note', 'Other title');
  options.publicNotes = { 'Same.md': 'root-note', 'other/Same.md': 'other-note' };
  await assert.rejects(generateBlog(options), /ambiguous/);
  await writeFile(path.join(options.vault, options.note), content('[[other/Same|explicit path]]\n'));
  await generateBlog(options);
  assert.match(await readFile(path.join(options.siteRoot, 'src/content/blog/source.md'), 'utf8'), /\[explicit path\]\(\/blog\/other-note\/\)/);
});

test('ordinary relative Markdown links cannot bypass public-note resolution', async t => {
  const options = await fixture(t, '[Private source](Private.md)\n');
  await assert.rejects(generateBlog(options), /relative|approved|unsupported.*link/);
});

test('missing assets and unpublished approvals fail without generated output', async t => {
  const options = await fixture(t, '![[missing.png|An absent image]]\n');
  await assert.rejects(generateBlog(options), /image.*exist/);
  await writeFile(path.join(options.vault, options.note), content('[[Private]]\n'));
  await writeFile(path.join(options.vault, 'Private.md'), content().replace('draft: false', 'draft: true'));
  options.publicNotes = { 'Private.md': 'private' };
  await assert.rejects(generateBlog(options), /public|draft/);
  assert.deepEqual(await tree(options.siteRoot), {});
});

test('repeat output is stable and validator is never skipped', async t => {
  const options = await fixture(t);
  let calls = 0;
  options.validate = async () => { calls++; };
  await generateBlog(options);
  const first = await tree(options.siteRoot);
  await generateBlog(options);
  assert.deepEqual(await tree(options.siteRoot), first);
  assert.equal(calls, 2);
});

test('removing an image and changing a slug removes only owned stale files', async t => {
  const options = await fixture(t, '![[photo.png|A blue fixture]]\n', 'slug: old\n');
  await sharp({ create: { width: 100, height: 50, channels: 3, background: 'blue' } }).png().toFile(path.join(options.vault, 'photo.png'));
  await generateBlog(options);
  const before = await tree(options.siteRoot);
  const oldAssets = Object.keys(before).filter(name => name.startsWith('public/blog/old/'));
  assert.ok(oldAssets.length > 0);
  await writeFile(path.join(options.siteRoot, 'public/blog/old/handwritten.txt'), 'Preserve this.');
  await writeFile(path.join(options.vault, options.note), content('No image now.\n', 'slug: new\n'));
  let stale;
  options.validate = async ({ plans }) => { stale = plans.stale; };
  await generateBlog(options);
  assert.deepEqual([...stale].sort(), ['src/content/blog/old.md', ...oldAssets].sort());
  const after = await tree(options.siteRoot);
  for (const old of ['src/content/blog/old.md', ...oldAssets]) assert.equal(Object.hasOwn(after, old), false);
  assert.equal(await readFile(path.join(options.siteRoot, 'public/blog/old/handwritten.txt'), 'utf8'), 'Preserve this.');
});

test('stable slug follows a renamed source but cannot steal a still-existing source', async t => {
  const options = await fixture(t, 'First.\n', 'slug: stable\n');
  await generateBlog(options);
  await writeFile(path.join(options.vault, 'Other.md'), content('Other.\n', 'slug: stable\n'));
  await assert.rejects(generateBlog({ ...options, note: 'Other.md' }), /collision/);
  await rm(path.join(options.vault, 'Other.md'));
  await rename(path.join(options.vault, 'Source.md'), path.join(options.vault, 'Renamed.md'));
  await generateBlog({ ...options, note: 'Renamed.md' });
  const manifest = JSON.parse(await readFile(path.join(options.siteRoot, '.obsidian-blog/manifest.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.notes), ['Renamed.md']);
  assert.equal(manifest.notes['Renamed.md'].slug, 'stable');
});

test('oriented images declare actual normalized dimensions and strip source metadata', async t => {
  const options = await fixture(t, '![[rotated.jpg|An oriented fixture]]\n');
  await sharp({ create: { width: 40, height: 20, channels: 3, background: 'blue' } }).withMetadata({ orientation: 6 }).jpeg().toFile(path.join(options.vault, 'rotated.jpg'));
  await generateBlog(options);
  const output = await readFile(path.join(options.siteRoot, 'src/content/blog/source.md'), 'utf8');
  const image = output.match(/<img\b[^>]*src="([^"]+)"[^>]*width="(\d+)"[^>]*height="(\d+)"/);
  assert.ok(image);
  const actual = await sharp(path.join(options.siteRoot, 'public', image[1])).metadata();
  assert.equal(Number(image[2]), actual.width);
  assert.equal(Number(image[3]), actual.height);
  assert.equal(actual.exif, undefined);
});

test('the lock spans validation and blocks concurrent generation', async t => {
  const options = await fixture(t);
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const first = generateBlog({ ...options, validate: async () => { enter(); await gate; } });
  await entered;
  try { await assert.rejects(generateBlog(options), /another.*running/); }
  finally { release(); await first; }
});

test('each promotion rename fault restores all prior bytes and removes new files', async t => {
  for (const step of [1, 2, 3, 4]) {
    const options = await fixture(t, 'Old.\n', 'slug: old\n');
    await generateBlog(options);
    const before = await tree(options.siteRoot);
    await writeFile(path.join(options.vault, options.note), content('New.\n', 'slug: new\n'));
    await assert.rejects(generateBlog({ ...options, fsHooks: { beforeRename: async event => { if (event.step === step) throw new Error(`Fault ${step}`); } } }), /Fault/);
    assert.deepEqual(await tree(options.siteRoot), before);
  }
});

test('a control-directory swap during validation cannot write or clean up through an alias', async t => {
  const options = await fixture(t);
  const outside = path.join(options.root, 'outside');
  await mkdir(outside);
  await mkdir(path.join(outside, 'lock'));
  await writeFile(path.join(outside, 'lock/private.txt'), 'Do not delete.');
  options.validate = async () => {
    await rename(path.join(options.siteRoot, '.obsidian-blog'), path.join(options.siteRoot, 'moved-control'));
    await symlink(outside, path.join(options.siteRoot, '.obsidian-blog'));
  };
  await assert.rejects(generateBlog(options), /control|unsafe|symlink/);
  assert.deepEqual(await tree(outside), { 'lock/private.txt': createHash('sha256').update('Do not delete.').digest('hex') });
});

test('a selected note cannot duplicate an existing article title under another slug', async t => {
  const options = await fixture(t);
  await writeFile(path.join(options.siteRoot, 'src/content/blog/existing.md'), content('Existing article.\n'));
  const before = await tree(options.siteRoot);
  await assert.rejects(generateBlog(options), /duplicate.*title/);
  assert.deepEqual(await tree(options.siteRoot), before);
});
