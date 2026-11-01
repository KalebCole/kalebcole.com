import assert from 'node:assert/strict';
import test from 'node:test';
import { APPROVED_LLMS_TXT_COPY, buildLlmsTxt } from '../src/lib/llms-txt.mjs';
import { PERSON_SCHEMA } from '../src/lib/person-schema.mjs';

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
    '## Posts',
    '',
    '',
    '## Projects',
    '',
    '',
  ].join('\n');
  assert.equal(output, expectedHeader);
  assert.deepEqual(
    [PERSON_SCHEMA.name, PERSON_SCHEMA.jobTitle, PERSON_SCHEMA.worksFor.name, PERSON_SCHEMA.homeLocation.name],
    ['Kaleb Cole', 'Software Engineer', 'Microsoft', 'Seattle, WA'],
  );
  assert.doesNotMatch(output, /[\u2013\u2014\u2019]/);
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

test('llms.txt lists pinned projects under Projects', () => {
  const output = buildLlmsTxt({
    posts: [],
    repos: [
      { name: 'demo', description: 'A demo.', url: 'https://github.com/KalebCole/demo' },
      { name: 'bare', description: null, url: 'https://github.com/KalebCole/bare' },
    ],
  });
  const projects = output.split('## Projects\n')[1];
  assert.match(projects, /^- \[demo\]\(https:\/\/github\.com\/KalebCole\/demo\): A demo\.$/m);
  assert.match(projects, /^- \[bare\]\(https:\/\/github\.com\/KalebCole\/bare\)$/m);
});
