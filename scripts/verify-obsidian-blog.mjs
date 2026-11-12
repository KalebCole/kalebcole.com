import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { verifyCalloutBrowser } from './verify-obsidian-browser.mjs';

// Explicit slow check, outside *.test.mjs so staged certification cannot recurse.
const root = fileURLToPath(new URL('..', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'obsidian-site-verification-'));
const site = join(temporary, 'site');
const vault = join(temporary, 'vault');
const git = spawnSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: root, encoding: 'utf8' });
assert.equal(git.status, 0, git.stderr);
const env = { ...process.env, GITHUB_TOKEN: '', GIT_DIR: git.stdout.trim(), GIT_WORK_TREE: site };
function run(command, args, expected = 0) {
  const result = spawnSync(command, args, { cwd: site, env, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (expected === 0) assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  else assert.notEqual(result.status, 0, 'generation must fail');
  return result;
}
async function snapshot(directory) {
  const result = {};
  async function walk(path, prefix = '') {
    for (const entry of await readdir(path, { withFileTypes: true }).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    })) {
      const name = `${prefix}${entry.name}`;
      if (entry.isDirectory()) await walk(join(path, entry.name), `${name}/`);
      else result[name] = createHash('sha256').update(await readFile(join(path, entry.name))).digest('hex');
    }
  }
  await walk(directory);
  return result;
}
const metadata = (draft) => `---\npublish: true\ntitle: Obsidian verification fixture\ndate: 2020-01-02\ndescription: A synthetic fixture for the one-note generator.\nslug: obsidian-verification-fixture\ndraft: ${draft}\ntags: [fixture]\n---\n`;
const body = `\n> [!quote] Visible quote\n> Visible wording.\n\n> [!quote]- Closed quote\n> Closed wording.\n\n> [!note]+ Open quote\n> Open wording.\n>\n> > [!quote]- Nested quote\n> > Nested wording.\n\n[[Published reference|the public reference]]\n\n![[sample.png|Two-color verification fixture]]\n\n\`[[Private note]]\`\n\n\`\`\`text\n[[Private note]]\n> [!quote]- Code, not a callout\n\`\`\`\n`;
let server;
try {
  await cp(root, site, { recursive: true, filter: (path) => !['node_modules', '.git', 'dist', '.astro', '.vercel', '.obsidian-blog', '.hermes'].includes(basename(path)) && !basename(path).startsWith('.env') });
  // A private dependency tree prevents staged Astro caches from touching the checkout.
  await cp(join(root, 'node_modules'), join(site, 'node_modules'), { recursive: true });
  await mkdir(vault);
  await writeFile(join(vault, 'Source.md'), metadata(false) + body);
  await writeFile(join(vault, 'Published reference.md'), '---\npublish: true\ntitle: Public reference\ndate: 2020-01-01\ndescription: An approved public-link fixture.\ndraft: false\nslug: hello-world\n---\nNot selected for export.\n');
  await writeFile(join(vault, 'Private note.md'), 'Private content must never be copied.\n');
  await writeFile(join(vault, 'approved.json'), JSON.stringify({ 'Published reference.md': 'hello-world' }));
  await sharp({ create: { width: 640, height: 480, channels: 3, background: '#336699' } }).png().toFile(join(vault, 'sample.png'));
  const args = ['run', 'blog:generate', '--', '--vault', vault, '--note', 'Source.md', '--public-notes', join(vault, 'approved.json')];
  run('npm', args);
  const first = { content: await snapshot(join(site, 'src/content/blog')), assets: await snapshot(join(site, 'public/blog')), ownership: await snapshot(join(site, '.obsidian-blog')) };
  run('npm', args);
  assert.deepEqual({ content: await snapshot(join(site, 'src/content/blog')), assets: await snapshot(join(site, 'public/blog')), ownership: await snapshot(join(site, '.obsidian-blog')) }, first, 'identical input must produce identical owned bytes');
  run('npm', ['run', 'build']);
  run('npm', ['run', 'certify']);
  const route = '/blog/obsidian-verification-fixture/';
  const html = await readFile(join(site, 'dist', route, 'index.html'), 'utf8');
  assert.match(html, /<details\b(?![^>]*\bopen)[^>]*>[\s\S]*?Closed quote/);
  assert.match(html, /<details\b[^>]*\bopen[^>]*>[\s\S]*?Open quote[\s\S]*?<details\b[\s\S]*?Nested quote/);
  assert.match(html, /href="\/blog\/hello-world\/?"/);
  assert.match(html, /<picture\b[\s\S]*?<source\b[^>]*type="image\/webp"[\s\S]*?<img\b[^>]*width="\d+"[^>]*height="\d+"/);
  assert.match(html, /\[\[Private note\]\]/);
  assert.doesNotMatch(html, /Private content must never be copied/);
  const assets = [...html.matchAll(/\b(?:src|srcset)="(\/blog\/[^\"]+)"/g)].flatMap((match) => match[1].split(',').map((value) => value.trim().split(' ')[0]));
  assert.ok(assets.length > 0);
  for (const asset of assets) assert.ok((await readFile(join(site, 'dist', asset))).length > 0);
  assert.match(await readFile(join(site, 'dist/rss.xml'), 'utf8'), /obsidian-verification-fixture/);

  // Exercise the real HTTP surface, not only generated files.
  const reservation = createServer();
  await new Promise((ok) => reservation.listen(0, '127.0.0.1', ok));
  const port = reservation.address().port;
  await new Promise((ok) => reservation.close(ok));
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [join(site, 'node_modules/astro/astro.js'), 'preview', '--host', '127.0.0.1', '--port', String(port)], { cwd: site, env, stdio: 'pipe' });
  await new Promise((ok, fail) => {
    const timeout = setTimeout(() => fail(new Error('preview did not become ready')), 15000);
    server.once('exit', (code) => { clearTimeout(timeout); fail(new Error(`preview exited ${code}`)); });
    server.once('error', (error) => { clearTimeout(timeout); fail(error); });
    server.stdout.on('data', (chunk) => { if (chunk.toString().includes(`127.0.0.1:${port}`)) { clearTimeout(timeout); ok(); } });
  });
  assert.equal((await fetch(`${origin}${route}`)).status, 200);
  for (const asset of new Set(assets)) assert.equal((await fetch(`${origin}${asset}`)).status, 200);
  await verifyCalloutBrowser(`${origin}${route}`);
  server.kill();
  await new Promise((ok) => server.once('exit', ok));
  server = undefined;

  // Force a genuine staged Astro schema failure, then compare all owned output.
  await writeFile(join(site, 'src/content/recommends/invalid-fixture.md'), '---\ntitle: Invalid fixture\n---\nNo required URL or date.\n');
  await writeFile(join(vault, 'Source.md'), metadata(false) + body + '\nChanged candidate.\n');
  const failed = run('npm', args, 1);
  assert.match(failed.stdout + failed.stderr, /(?:schema|date|url|validation|build|certif)/i);
  assert.deepEqual({ content: await snapshot(join(site, 'src/content/blog')), assets: await snapshot(join(site, 'public/blog')), ownership: await snapshot(join(site, '.obsidian-blog')) }, first, 'failed staged validation must leave owned output untouched');
  await rm(join(site, 'src/content/recommends/invalid-fixture.md'));

  await writeFile(join(vault, 'Source.md'), metadata(true) + body);
  run('npm', args);
  run('npm', ['run', 'certify']);
  const draftHtml = await readFile(join(site, 'dist/blog/index.html'), 'utf8');
  const feed = await readFile(join(site, 'dist/rss.xml'), 'utf8');
  const home = await readFile(join(site, 'dist/index.html'), 'utf8');
  const sitemap = await readFile(join(site, 'dist/sitemap-0.xml'), 'utf8');
  for (const surface of [draftHtml, feed, home, sitemap]) assert.doesNotMatch(surface, /obsidian-verification-fixture/);
  await assert.rejects(readFile(join(site, 'dist', route, 'index.html')), { code: 'ENOENT' });
  console.log('Verified real CLI generation, byte-stable rerun, build, certification, native callouts, local responsive assets, HTTP routes, staged-schema failure rollback, and draft exclusion.');
} finally {
  server?.kill();
  if (process.env.KEEP_OBSIDIAN_VERIFICATION === '1') console.log(`Verification files retained at ${resolve(temporary)}`);
  else await rm(temporary, { recursive: true, force: true });
}
