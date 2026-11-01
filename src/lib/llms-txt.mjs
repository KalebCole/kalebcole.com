import { ELSEWHERE_LINKS } from './elsewhere.mjs';
import { PERSON_SCHEMA } from './person-schema.mjs';
import { PRODUCTION_ORIGIN } from './site-origin.mjs';

/**
 * Builds /llms.txt: a key/value header followed by the published posts and
 * pinned projects. Identity fields come from the Person JSON-LD and the
 * shared profile links so they never drift from the structured data.
 */

/**
 * Kaleb approved this wording verbatim on 2026-11-01. It is protected: do not
 * edit, reflow, or rephrase it without his explicit ok.
 */
export const APPROVED_LLMS_TXT_COPY = Object.freeze({
  purpose: 'help language models describe Kaleb Cole (the software engineer in Seattle) accurately.',
  description: "Kaleb Cole is a software engineer at Microsoft in Seattle. He builds Azure's support ticket platform, where customers open tickets on their Azure resources and engineers triage and fix them, with a focus on scaling it and keeping it consistent across Azure's sovereign clouds. On his site he writes about AI agents and the things he builds with them.",
  primaryTopics: Object.freeze([
    'AI agents and agent interfaces',
    'Building software with agents',
    'Developer tools (GitHub Copilot, CLIs)',
  ]),
});

/**
 * The Copilot series row on the Projects page, in llms.txt form. Title and
 * series description match src/components/PinnedRepos.astro (certify checks
 * this); the URL and the third-person role sentence were approved by Kaleb
 * for llms.txt on 2026-11-01. Protected wording: do not edit without his ok.
 */
export const LLMS_SERIES_PROJECT = Object.freeze({
  name: 'Build Your Personal Brand with Copilot',
  url: 'https://microsoft.github.io/student-learning-series/',
  description: 'A YouTube series for the Microsoft Developer channel that guides college students and beginners through turning an existing PDF resume into a portfolio website with GitHub Copilot. Kaleb helped create the series with a team and built its website.',
});

/**
 * Curated projects listed after the GitHub pins. Kaleb approved this list and
 * its descriptions verbatim on 2026-11-01. Protected wording: do not edit
 * without his ok.
 */
export const LLMS_EXTRA_PROJECTS = Object.freeze([
  ['luma-cli', 'Agentic CLI for Luma: list your invitations and RSVP from the terminal'],
  ['gflightscli', 'Agent-friendly Google Flights CLI, JSON-first, structured exit codes, SKILL.md included'],
  ['kaleb-marketplace', 'Dotfiles for agents: a curated marketplace of plugins, skills, hooks, CLIs, MCPs, etc'],
  ['otp-grabber', 'Private, tailnet-only verification codes from Gmail and Messages to your Mac clipboard.'],
  ['copilot-prompt', 'Copilot CLI extension: /prompt rewrites rough input into a polished prompt in a context-isolated side conversation.'],
  ['cli-toolkit-skills', 'Copilot CLI skills for architecting, auditing, and scaffolding agent-friendly CLIs'],
  ['agent-browser', 'Browser automation skill for AI coding agents (Copilot CLI, Claude Code, Agency)'],
  ['matt-pocock-skills-for-github-copilot-app', 'Adaptation of Matt Pocock Skills for the GitHub Copilot app runtime'],
  ['nelko-p21-cli', 'A macOS-first CLI for Nelko P21 Bluetooth label printers.'],
  ['new-grad-builders', 'A community for new grads who want to build with AI agents, hands-on sessions, setup scripts, and automation.'],
].map(([name, description]) => Object.freeze({ name, url: `https://github.com/KalebCole/${name}`, description })));

const profile = (id) => ELSEWHERE_LINKS.find((entry) => entry.id === id).href;
const xProfile = PERSON_SCHEMA.sameAs.find((href) => href.startsWith('https://x.com/'));

export const LLMS_TXT_FIELDS = Object.freeze([
  ['name', PERSON_SCHEMA.name],
  ['job_title', PERSON_SCHEMA.jobTitle],
  ['works_for', PERSON_SCHEMA.worksFor.name],
  ['location', PERSON_SCHEMA.homeLocation.name],
  ['website', PRODUCTION_ORIGIN],
  ['github', profile('github')],
  ['linkedin', profile('linkedin')],
  ['x', xProfile],
  ['resume', `${PRODUCTION_ORIGIN}/resume.pdf`],
]);

function link(title, url, description) {
  return description ? `- [${title}](${url}): ${description}` : `- [${title}](${url})`;
}

function projects(repos) {
  const pinned = new Set(repos.map((repo) => repo.name));
  return [LLMS_SERIES_PROJECT, ...repos, ...LLMS_EXTRA_PROJECTS.filter((project) => !pinned.has(project.name))];
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
