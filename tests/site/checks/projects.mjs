import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { collect, dist, localAsset, matches, root, text } from './helpers.mjs';

// Projects index and homepage project preview.
export const check = collect('projects', async ({ routes, homepage, projectsPage }) => {
  const pinnedReposSource = text(join(root, 'src', 'components', 'PinnedRepos.astro'));

  const projectsSource = text(join(root, 'src', 'pages', 'projects.astro'));

  assert.match(homepage, /<section\b[^>]*class="recent-projects"[\s\S]*?<div\b[^>]*class="recent-heading"[^>]*\bdata-motion-beat\b[^>]*>[\s\S]*?<h2[^>]*>Recent projects<\/h2>/i, 'Recent projects heading must be a publication motion beat');
  assert.match(homepage, /class="all-projects-link"[^>]*\bdata-motion-beat\b[^>]*href="\/projects"[^>]*>\s*All projects\s*<span[^>]*>→<\/span>\s*<\/a>/i, 'homepage project preview must end with a motion-enabled All projects link');
  const homepageProjectSection = homepage.match(/<section\b[^>]*class="recent-projects"[\s\S]*?<\/section>/i)?.[0] ?? '';
  const homepageProjectCards = matches(homepageProjectSection, /<li\b[^>]*class="[^"]*project-index-row[^"]*"[^>]*>/gi);
  const homepageProjectVisuals = matches(homepageProjectSection, /<a\b[^>]*class="project-visual"[^>]*\bdata-motion-beat\b[^>]*>/gi);
  const homepageProjectCopies = matches(homepageProjectSection, /<div\b[^>]*class="project-index-copy"[^>]*\bdata-motion-beat\b[^>]*>/gi);
  assert.ok(homepageProjectCards.length > 0 && homepageProjectCards.length <= 2, 'homepage must show between one and two projects');
  assert.equal(homepageProjectVisuals.length, homepageProjectCards.length, 'every homepage project visual must be a publication motion beat');
  assert.equal(homepageProjectCopies.length, homepageProjectCards.length, 'every homepage project copy block must be a publication motion beat');
  assert.match(homepageProjectSection, /Build Your Personal Brand with Copilot/i, 'homepage must use the published series title');
  assert.match(homepageProjectSection, /A YouTube series for the Microsoft Developer channel that guides college students and beginners through turning an existing PDF resume into a portfolio website with GitHub Copilot\./i, 'homepage must explain the series audience and outcome');
  assert.doesNotMatch(homepageProjectSection, /Website \+ video/i, 'homepage must not show redundant project taxonomy');
  assert.doesNotMatch(homepageProjectSection, /Website \+ PowerShell/i, 'homepage must not show redundant project taxonomy');
  assert.doesNotMatch(pinnedReposSource, /class="repo-lang"/, 'project cards must not render language metadata');
  assert.match(pinnedReposSource, /url: 'https:\/\/kalebcole\.github\.io\/uprint-cli\/'/i, 'uprint override must target its website');
  assert.match(pinnedReposSource, /name: 'uprint-cli'/, 'uprint override must use the repository name');
  assert.match(pinnedReposSource, /description: 'Agentic CLI for Microsoft Employees to print hassle-free at the Redmond campus'/, 'uprint override must match the GitHub About description');
  assert.match(pinnedReposSource, /'KalebCole\/partiful-cli':\s*\{/, 'Partiful must have a presentation override keyed by owner/repo');
  assert.match(
    pinnedReposSource,
    /url: 'https:\/\/kalebcole\.github\.io\/partiful-cli\/'/,
    'Partiful override must target its published website',
  );
  assert.match(
    pinnedReposSource,
    /description: 'Reverse-engineered Partiful’s API into an agentic CLI for managing events\. My favorite workflows match invitations against my calendar and help me find events around Seattle\.'/,
    'Partiful override must use the approved description',
  );
  assert.match(
    pinnedReposSource,
    /image: '\/projects\/partiful-cli-website\.webp'/,
    'Partiful override must use the local website preview',
  );
  assert.match(
    pinnedReposSource,
    /imageAlt: 'Partiful CLI homepage with the headline Your agent has the party covered'/,
    'Partiful override must use the approved image alt text',
  );
  assert.match(
    pinnedReposSource,
    /imageWidth: 1200[\s\S]*?imageHeight: 630/,
    'Partiful preview must declare its generated dimensions',
  );
  assert.match(pinnedReposSource, /const override = repoOverrides\[identity as keyof typeof repoOverrides\]/, 'repository overrides must apply on every project surface by owner/repo identity');
  assert.doesNotMatch(pinnedReposSource, /variant === ['"]home['"]\s*\?\s*repoOverrides/, 'repository overrides must not be homepage-only');
  assert.match(projectsPage, /Build Your Personal Brand with Copilot/i, 'Projects index must include the published series title');
  assert.match(projectsPage, /<header\b[^>]*class="page-heading"[^>]*\bdata-motion-beat\b[^>]*>/i, 'Projects heading must be a publication motion beat');
  const projectsCards = matches(projectsPage, /<li\b[^>]*class="[^\"]*project-index-row[^\"]*"[^>]*>/gi);
  const projectsVisuals = matches(projectsPage, /<a\b[^>]*class="project-visual"[^>]*\bdata-motion-beat\b[^>]*>/gi);
  const projectsCopies = matches(projectsPage, /<div\b[^>]*class="project-index-copy"[^>]*\bdata-motion-beat\b[^>]*>/gi);
  assert.ok(projectsCards.length > 0, 'Projects index must render projects');
  assert.equal(projectsVisuals.length, projectsCards.length, 'every Projects visual must be a publication motion beat');
  assert.equal(projectsCopies.length, projectsCards.length, 'every Projects copy block must be a publication motion beat');
  assert.equal(matches(projectsSource, /\binitPublicationMotion\(\)/g).length, 1, 'Projects must initialize publication motion exactly once');
  assert.doesNotMatch(projectsPage, /Still curious\?|I keep more experiments, tools, and unfinished threads on GitHub\.|Find me on GitHub/i, 'Projects index must not render the removed GitHub onward prompt');
  assert.doesNotMatch(projectsPage, /\b(?:case study|case-study|metrics?|stars|forks|language)\b/i, 'Projects index must not add metrics, project-language metadata, or case-study framing');
  for (const [surface, html] of [['homepage', homepage], ['Projects index', projectsPage]]) {
    if (/uprint-cli/i.test(html)) {
      assert.match(html, /href="https:\/\/kalebcole\.github\.io\/uprint-cli\/"/i, `${surface} uprint card must target its website`);
      assert.match(html, /src="\/projects\/uprint-website\.webp"/i, `${surface} uprint card must use the website preview`);
      assert.match(html, /Agentic CLI for Microsoft Employees to print hassle-free at the Redmond campus/i, `${surface} uprint card must match the GitHub About description`);
    }
  }

  assert.ok(existsSync(join(dist, 'projects', 'uprint-website.webp')), 'production build must emit the uprint website preview');
  assert.ok(
    existsSync(localAsset('/projects/partiful-cli-website.webp')),
    'production build must emit the Partiful website preview',
  );
  assert.doesNotMatch(homepage, /projects couldn’t load|find them on GitHub instead/i, 'homepage must not expose project-loading errors');
  assert.doesNotMatch(text(routes.get('/projects/')), /projects couldn’t load|find them on GitHub instead/i, 'Projects page must not expose project-loading errors');
});
