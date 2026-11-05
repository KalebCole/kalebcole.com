import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { blogSource, collect, localAsset, matches, outputForPath, root, site, text } from './helpers.mjs';

// /llms.txt: header fields, sections, links, and no drafts.
export const check = collect('llms-txt', async ({ routes }) => {
  const llmsTxtPath = localAsset('/llms.txt');
  assert.ok(existsSync(llmsTxtPath), 'production build must emit /llms.txt');
  const llmsTxt = text(llmsTxtPath);
  assert.equal(llmsTxt.split('\n')[0], '# Kaleb Cole', '/llms.txt must open with # Kaleb Cole');
  const llmsPerson = JSON.parse(text(routes.get('/')).match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(new Set(llmsPerson.sameAs).size, llmsPerson.sameAs.length, 'Person JSON-LD sameAs must not repeat a profile');
  assert.deepEqual([...llmsPerson.sameAs].sort(), ['https://github.com/KalebCole', 'https://www.linkedin.com/in/kaleb-cole', 'https://x.com/Kalebicole'].sort(), 'Person JSON-LD sameAs must list GitHub, LinkedIn, and X');
  const llmsFields = {
    name: llmsPerson.name,
    job_title: llmsPerson.jobTitle,
    works_for: llmsPerson.worksFor.name,
    location: llmsPerson.homeLocation.name,
    website: site,
    github: 'https://github.com/KalebCole',
    linkedin: 'https://www.linkedin.com/in/kaleb-cole',
    x: 'https://x.com/Kalebicole',
    resume: `${site}/resume.pdf`,
  };
  for (const [key, value] of Object.entries(llmsFields)) {
    assert.ok(llmsTxt.includes(`\n${key}: ${value}\n`), `/llms.txt must include header field ${key}: ${value}`);
  }
  for (const field of ['description:', 'primary_topics:', '## Posts', '## Projects']) {
    assert.match(llmsTxt, new RegExp(`^${field}$`, 'm'), `/llms.txt must include ${field}`);
  }
  assert.doesNotMatch(llmsTxt, /[\u2013\u2014]/, '/llms.txt must not contain em or en dashes');

  for (const name of readdirSync(blogSource).filter((file) => file.endsWith('.md'))) {
    if (/^draft:\s*true\s*$/m.test(text(join(blogSource, name)))) {
      assert.ok(!llmsTxt.includes(`/blog/${name.replace(/\.md$/, '')}`), `/llms.txt must not include draft writing ${name}`);
    }
  }
  const llmsProfileUrls = ['https://github.com/KalebCole', 'https://www.linkedin.com/in/kaleb-cole', 'https://x.com/Kalebicole'];
  const llmsUrls = matches(llmsTxt, /https?:\/\/[^\s)]+/g).map((match) => match[0]);
  assert.ok(llmsUrls.length > 0, '/llms.txt must contain links');
  for (const url of llmsUrls) {
    if (url === site) continue;
    if (url.startsWith(`${site}/`)) {
      const pathname = new URL(url).pathname;
      if (pathname === '/') continue;
      assert.ok(existsSync(localAsset(pathname)) || existsSync(outputForPath(pathname)), `/llms.txt links to missing ${pathname}`);
    } else {
      assert.ok(
        llmsProfileUrls.includes(url)
          || /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(url)
          || url === 'https://microsoft.github.io/student-learning-series/',
        `/llms.txt must only link to ${site}, listed profiles, or a validated GitHub pin, found ${url}`,
      );
    }
  }
  const pinnedReposComponent = text(join(root, 'src', 'components', 'PinnedRepos.astro'));
  for (const phrase of [
    'Build Your Personal Brand with Copilot',
    'A YouTube series for the Microsoft Developer channel that guides college students and beginners through turning an existing PDF resume into a portfolio website with GitHub Copilot.',
  ]) {
    assert.ok(pinnedReposComponent.includes(phrase), `/llms.txt series entry must match the Projects page: ${phrase}`);
    assert.ok(llmsTxt.includes(phrase), `/llms.txt must include the series entry: ${phrase}`);
  }
});
