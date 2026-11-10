import { ELSEWHERE_LINKS } from './elsewhere.mjs';
import { PERSON_SCHEMA } from './person-schema.mjs';
import { PRODUCTION_ORIGIN } from './site-origin.mjs';

/**
 * Builds /llms.txt: a key/value header followed by the published posts and
 * pinned projects. Identity fields come from the Person JSON-LD and the
 * shared profile links so they never drift from the structured data.
 * /llms-full.txt starts with the same document, then adds the public text of
 * published pages and posts.
 */

/**
 * Kaleb approved this wording verbatim on 2026-11-01. It is protected: do not
 * edit, reflow, or rephrase it without his explicit ok. The description is the
 * Person JSON-LD description so the two surfaces cannot drift.
 */
export const APPROVED_LLMS_TXT_COPY = Object.freeze({
  purpose: 'help language models describe Kaleb Cole (the software engineer in Seattle) accurately.',
  description: PERSON_SCHEMA.description,
  primaryTopics: Object.freeze([
    'AI agents and agent interfaces',
    'Building software with agents',
    'Developer tools (GitHub Copilot, CLIs)',
  ]),
});

/**
 * The Copilot series row on the Projects page, in llms.txt form. Title and
 * series description match src/components/PinnedRepos.astro (the site checks
 * verify this); the URL and the third-person role sentence were approved by Kaleb
 * for llms.txt on 2026-11-01. Protected wording: do not edit without his ok.
 */
export const LLMS_SERIES_PROJECT = Object.freeze({
  name: 'Build Your Personal Brand with Copilot',
  url: 'https://microsoft.github.io/student-learning-series/',
  description: 'A YouTube series for the Microsoft Developer channel that guides college students and beginners through turning an existing PDF resume into a portfolio website with GitHub Copilot. Kaleb helped create the series with a team and built its website.',
});

export const LLMS_FULL_TXT_HREF = `${PRODUCTION_ORIGIN}/llms-full.txt`;
export const LLMS_FULL_TXT_NOTE = `The complete public text of published pages and posts is in [llms-full.txt](${LLMS_FULL_TXT_HREF}).`;

/**
 * Public page sentences copied verbatim from the published pages. Site checks
 * fail if these drift from the homepage, Writing, Projects, Recommends, or
 * privacy sources. Do not rewrite them here.
 */
export const LLMS_FULL_PAGE_COPY = Object.freeze({
  homeGreeting: 'Hi, I\u2019m Kaleb.',
  homeStatement: 'I make things, write down what I learn, and follow whatever has me curious right now.',
  homeSubtitle: 'I\u2019m a software engineer at Microsoft, building what interests me and designing how we work with agents.',
  writingIntro: 'Notes, essays, and half-finished thoughts.',
  projectsIntro: 'Things I\u2019ve built, contributed to, or am currently working on.',
  recommendsIntro: 'Things I thought were interesting.',
  privacyParagraphs: Object.freeze([
    "This is the privacy policy for Work Cal Mirror, a calendar app for Kaleb Cole's personal use only. It is not a privacy policy for kalebcole.com.",
    "Work Cal Mirror reads Kaleb Cole's work calendar feed. It copies event titles, times, and free/busy into a Google calendar the app created in his own account.",
    'That data goes only to Google and is never sold or shared with anyone else.',
    'To ask about Work Cal Mirror, email kalebcole2021@gmail.com.',
  ]),
});

const profile = (id) => ELSEWHERE_LINKS.find((entry) => entry.id === id).href;

export const LLMS_TXT_FIELDS = Object.freeze([
  ['name', PERSON_SCHEMA.name],
  ['job_title', PERSON_SCHEMA.jobTitle],
  ['works_for', PERSON_SCHEMA.worksFor.name],
  ['location', PERSON_SCHEMA.homeLocation.name],
  ['website', PRODUCTION_ORIGIN],
  ['github', profile('github')],
  ['linkedin', profile('linkedin')],
  ['x', profile('x')],
  ['resume', `${PRODUCTION_ORIGIN}/resume.pdf`],
]);

function link(title, url, description) {
  return description ? `- [${title}](${url}): ${description}` : `- [${title}](${url})`;
}

function projects(repos) {
  return [LLMS_SERIES_PROJECT, ...repos];
}

function publishedPosts(posts) {
  return posts
    .filter((post) => !post.data.draft)
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

function publishedRecommends(recommends) {
  return recommends
    .filter((item) => !item.data.draft)
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * @param {{
 *   posts: { id: string, data: { title: string, description: string, date: Date, draft?: boolean } }[],
 *   repos: { name: string, description: string | null, url: string }[],
 * }} input
 */
export function buildLlmsTxt({ posts, repos }) {
  const published = publishedPosts(posts);

  return [
    `# ${PERSON_SCHEMA.name}`,
    `# Purpose: ${APPROVED_LLMS_TXT_COPY.purpose}`,
    '',
    ...LLMS_TXT_FIELDS.map(([key, value]) => `${key}: ${value}`),
    '',
    'description:',
    APPROVED_LLMS_TXT_COPY.description,
    '',
    'primary_topics:',
    ...APPROVED_LLMS_TXT_COPY.primaryTopics.map((topic) => `- ${topic}`),
    '',
    LLMS_FULL_TXT_NOTE,
    '',
    '## Posts',
    '',
    ...published.map((post) => link(post.data.title, `${PRODUCTION_ORIGIN}/blog/${post.id}/`, post.data.description)),
    '',
    '## Projects',
    '',
    ...projects(repos).map((repo) => link(repo.name, repo.url, repo.description ?? undefined)),
    '',
  ].join('\n');
}

function pageBlock(title, url, lines) {
  return [`### ${title}`, `url: ${url}`, '', ...lines, ''];
}

/**
 * @param {{
 *   posts: { id: string, body?: string, data: { title: string, description: string, date: Date, draft?: boolean } }[],
 *   repos: { name: string, description: string | null, url: string }[],
 *   recommends?: { data: { title: string, url: string, date: Date, medium?: string, author?: string, source?: string, take?: string, draft?: boolean } }[],
 * }} input
 */
export function buildLlmsFullTxt({ posts, repos, recommends = [] }) {
  const published = publishedPosts(posts);
  const items = publishedRecommends(recommends);
  const copy = LLMS_FULL_PAGE_COPY;

  const postBlocks = published.flatMap((post) => {
    const body = typeof post.body === 'string' ? post.body.trimEnd() : '';
    return pageBlock(post.data.title, `${PRODUCTION_ORIGIN}/blog/${post.id}/`, [
      `date: ${ymd(post.data.date)}`,
      `description: ${post.data.description}`,
      ...(body ? ['', body] : []),
    ]);
  });

  const recommendBlocks = items.flatMap((item) => {
    const lines = [
      `date: ${ymd(item.data.date)}`,
    ];
    if (item.data.medium) lines.push(`medium: ${item.data.medium}`);
    if (item.data.author) lines.push(`author: ${item.data.author}`);
    if (item.data.source) lines.push(`source: ${item.data.source}`);
    if (item.data.take) {
      lines.push('', 'My thoughts:', item.data.take);
    }
    return pageBlock(item.data.title, item.data.url, lines);
  });

  return [
    buildLlmsTxt({ posts, repos }),
    '## Full pages',
    '',
    ...pageBlock('Home', `${PRODUCTION_ORIGIN}/`, [
      copy.homeGreeting,
      '',
      copy.homeStatement,
      '',
      copy.homeSubtitle,
    ]),
    ...pageBlock('Writing', `${PRODUCTION_ORIGIN}/blog/`, [copy.writingIntro]),
    ...postBlocks,
    ...pageBlock('Projects', `${PRODUCTION_ORIGIN}/projects/`, [copy.projectsIntro]),
    ...pageBlock('Recommends', `${PRODUCTION_ORIGIN}/recommends/`, [copy.recommendsIntro]),
    ...recommendBlocks,
    ...pageBlock('Work Cal Mirror privacy policy', `${PRODUCTION_ORIGIN}/privacy/`, [...copy.privacyParagraphs]),
  ].join('\n');
}
