import assert from 'node:assert/strict';
import test from 'node:test';
import { APPROVED_LLMS_TXT_COPY, LLMS_FULL_PAGE_COPY, LLMS_FULL_TXT_NOTE, buildLlmsFullTxt, buildLlmsTxt } from '../../src/lib/llms-txt.mjs';
import { PERSON_SCHEMA } from '../../src/lib/person-schema.mjs';

const post = (id, date, draft = false) => ({
  id,
  data: { title: `Title ${id}`, description: `Description ${id}.`, date: new Date(date), draft },
});

test('llms.txt header matches the approved format and the Person JSON-LD', () => {
  const output = buildLlmsTxt({ posts: [], repos: [] });
  const expectedHeader = [
    '# Kaleb Cole',
    '# Purpose: help language models describe Kaleb Cole (the software engineer in Seattle) accurately.',
    '',
    `name: ${PERSON_SCHEMA.name}`,
    `job_title: ${PERSON_SCHEMA.jobTitle}`,
    `works_for: ${PERSON_SCHEMA.worksFor.name}`,
    `location: ${PERSON_SCHEMA.homeLocation.name}`,
    'website: https://kalebcole.com',
    'github: https://github.com/KalebCole',
    'linkedin: https://www.linkedin.com/in/kaleb-cole',
    'x: https://x.com/Kalebicole',
    'resume: https://kalebcole.com/resume.pdf',
    '',
    'description:',
    APPROVED_LLMS_TXT_COPY.description,
    '',
    'primary_topics:',
    '- AI agents and agent interfaces',
    '- Building software with agents',
    '- Developer tools (GitHub Copilot, CLIs)',
    '',
    LLMS_FULL_TXT_NOTE,
    '',
    '## Posts',
    '',
    '',
    '## Projects',
    '',
  ].join('\n');
  assert.ok(output.startsWith(expectedHeader));
  assert.deepEqual(
    [PERSON_SCHEMA.name, PERSON_SCHEMA.jobTitle, PERSON_SCHEMA.worksFor.name, PERSON_SCHEMA.homeLocation.name],
    ['Kaleb Cole', 'Software Engineer', 'Microsoft', 'Seattle, WA'],
  );
  assert.doesNotMatch(output, /[\u2013\u2014\u2019]/);
  assert.equal(APPROVED_LLMS_TXT_COPY.description, PERSON_SCHEMA.description);
  assert.match(PERSON_SCHEMA.description, /software engineer at Microsoft in Seattle/);
});

test('llms.txt lists published posts newest first and never lists drafts', () => {
  const output = buildLlmsTxt({
    posts: [post('older', '2026-01-01'), post('secret', '2026-03-01', true), post('newer', '2026-02-01')],
    repos: [],
  });
  assert.ok(!output.includes('secret'));
  assert.ok(output.indexOf('/blog/newer/') < output.indexOf('/blog/older/'));
  assert.match(output, /^- \[Title newer\]\(https:\/\/kalebcole\.com\/blog\/newer\/\): Description newer\.$/m);
});

test('llms.txt lists the series first, then the pinned repos only', () => {
  const output = buildLlmsTxt({
    posts: [],
    repos: [
      { name: 'partiful-cli', description: 'Pinned.', url: 'https://github.com/KalebCole/partiful-cli' },
      { name: 'bare', description: null, url: 'https://github.com/KalebCole/bare' },
    ],
  });
  const names = [...output.split('## Projects\n')[1].matchAll(/^- \[([^\]]+)\]/gm)].map((match) => match[1]);
  assert.deepEqual(names, ['Build Your Personal Brand with Copilot', 'partiful-cli', 'bare']);
  assert.match(output, /^- \[bare\]\(https:\/\/github\.com\/KalebCole\/bare\)$/m);
  assert.doesNotMatch(output, /[\u2013\u2014]/);
});

test('llms-full.txt starts with llms.txt and adds published page text', () => {
  const posts = [
    post('older', '2026-01-01'),
    { ...post('secret', '2026-03-01', true), body: 'SECRET_DRAFT_BODY' },
    { ...post('newer', '2026-02-01'), body: 'PUBLISHED_BODY about agents.' },
  ];
  posts[0].body = 'OLDER_BODY';
  const recommends = [
    {
      data: {
        title: 'A published recommend',
        url: 'https://example.com/talk',
        date: new Date('2026-02-02'),
        medium: 'watch',
        take: 'I liked the routing example.',
        draft: false,
      },
    },
    {
      data: {
        title: 'A draft recommend',
        url: 'https://example.com/secret',
        date: new Date('2026-03-02'),
        take: 'PLACEHOLDER_DRAFT_TAKE',
        draft: true,
      },
    },
  ];
  const index = buildLlmsTxt({ posts, repos: [] });
  const full = buildLlmsFullTxt({ posts, repos: [], recommends });
  assert.ok(full.startsWith(index));
  assert.match(full, /^## Full pages$/m);
  assert.ok(full.includes(LLMS_FULL_PAGE_COPY.homeGreeting));
  assert.ok(full.includes(LLMS_FULL_PAGE_COPY.homeSubtitle));
  assert.ok(full.includes(LLMS_FULL_PAGE_COPY.writingIntro));
  assert.ok(full.includes(LLMS_FULL_PAGE_COPY.projectsIntro));
  assert.ok(full.includes(LLMS_FULL_PAGE_COPY.recommendsIntro));
  assert.ok(full.includes('PUBLISHED_BODY about agents.'));
  assert.ok(full.includes('OLDER_BODY'));
  assert.ok(!full.includes('SECRET_DRAFT_BODY'));
  assert.ok(!full.includes('/blog/secret'));
  assert.ok(full.includes('A published recommend'));
  assert.ok(full.includes('I liked the routing example.'));
  assert.ok(!full.includes('PLACEHOLDER_DRAFT_TAKE'));
  assert.ok(!full.includes('A draft recommend'));
  assert.ok(full.includes(LLMS_FULL_PAGE_COPY.privacyParagraphs[0]));
  assert.doesNotMatch(full, /[\u2013\u2014]/);
});
