import { ELSEWHERE_LINKS } from './elsewhere.mjs';
import { PERSON_SCHEMA } from './person-schema.mjs';
import { PRODUCTION_ORIGIN } from './site-origin.mjs';

/**
 * Builds /llms.txt (https://llmstxt.org) from text that already exists on the
 * site: the default site description in Layout.astro, the Person JSON-LD, page
 * intros and meta descriptions, feed titles, and each piece's own frontmatter.
 * Keep it that way. Do not write new copy in Kaleb's voice here.
 */

export const SITE_DESCRIPTION = 'Kaleb Cole’s public workshop for ideas, experiences, interests, and projects.';

const absolute = (path) => new URL(path, PRODUCTION_ORIGIN).href;

function link(title, url, description) {
  return description ? `- [${title}](${url}): ${description}` : `- [${title}](${url})`;
}

function profileLinks() {
  const profiles = ELSEWHERE_LINKS
    .filter((entry) => entry.href.startsWith('https://'))
    .sort((first, second) => first.footerOrder - second.footerOrder)
    .map((entry) => link(entry.label, entry.href, entry.accessibleName.replace(/, external link$/, '')));
  const listed = new Set(ELSEWHERE_LINKS.map((entry) => entry.href));
  for (const href of PERSON_SCHEMA.sameAs) {
    if (listed.has(href)) continue;
    if (href.startsWith('https://x.com/')) profiles.push(link('X', href, 'Kaleb Cole on X'));
  }
  return profiles;
}

/**
 * @param {{
 *   posts: { id: string, data: { title: string, description: string, date: Date, draft?: boolean } }[],
 *   repos: { name: string, description: string | null, url: string }[],
 * }} input
 */
export function buildLlmsTxt({ posts, repos }) {
  const published = posts
    .filter((post) => !post.data.draft)
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

  const lines = [
    `# ${PERSON_SCHEMA.name}`,
    '',
    `> ${SITE_DESCRIPTION}`,
    '',
    `- Name: ${PERSON_SCHEMA.name}`,
    `- Job title: ${PERSON_SCHEMA.jobTitle}`,
    `- Works for: ${PERSON_SCHEMA.worksFor.name}`,
    `- Home location: ${PERSON_SCHEMA.homeLocation.name}`,
    `- Website: ${PERSON_SCHEMA.url}`,
    '',
    '## Writing',
    '',
    link('Writing', absolute('/blog/'), 'Notes, essays, and half-finished thoughts.'),
    link('Kaleb Cole | Writing feed', absolute('/rss.xml'), 'Writing by Kaleb Cole.'),
    ...published.map((post) => link(post.data.title, absolute(`/blog/${post.id}/`), post.data.description)),
    '',
    '## Recommends',
    '',
    link('Recommends', absolute('/recommends/'), 'Things worth your time: articles, talks, and audio, with Kaleb Cole\'s note on why.'),
    link('Kaleb Cole recommends', absolute('/recommends/rss.xml'), 'Things I thought were interesting.'),
    '',
    '## Projects',
    '',
    link('Projects', absolute('/projects/'), 'Things Kaleb Cole has made or is exploring.'),
    ...repos.map((repo) => link(repo.name, repo.url, repo.description ?? undefined)),
    '',
    '## Résumé',
    '',
    link('Résumé', absolute('/resume.pdf')),
    '',
    '## Profiles',
    '',
    ...profileLinks(),
    '',
  ];

  return lines.join('\n');
}
