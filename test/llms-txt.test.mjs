import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLlmsTxt, SITE_DESCRIPTION } from '../src/lib/llms-txt.mjs';

const post = (id, date, draft = false) => ({
  id,
  data: { title: `Title ${id}`, description: `Description ${id}.`, date: new Date(date), draft },
});

test('llms.txt opens with the name and the existing site description', () => {
  const output = buildLlmsTxt({ posts: [], repos: [] });
  assert.ok(output.startsWith(`# Kaleb Cole\n\n> ${SITE_DESCRIPTION}\n`));
});

test('llms.txt lists published writing newest first and never lists drafts', () => {
  const output = buildLlmsTxt({
    posts: [post('older', '2026-01-01'), post('secret', '2026-03-01', true), post('newer', '2026-02-01')],
    repos: [],
  });
  assert.ok(!output.includes('secret'));
  assert.ok(output.indexOf('/blog/newer/') < output.indexOf('/blog/older/'));
  assert.match(output, /^- \[Title newer\]\(https:\/\/kalebcole\.com\/blog\/newer\/\): Description newer\.$/m);
});

test('llms.txt lists pinned projects and only the profiles already on the site', () => {
  const output = buildLlmsTxt({
    posts: [],
    repos: [{ name: 'demo', description: null, url: 'https://github.com/KalebCole/demo' }],
  });
  assert.match(output, /^- \[demo\]\(https:\/\/github\.com\/KalebCole\/demo\)$/m);
  const profiles = output.split('## Profiles\n')[1];
  assert.deepEqual(
    [...profiles.matchAll(/\]\((https:[^)]+)\)/g)].map((match) => match[1]),
    ['https://github.com/KalebCole', 'https://www.linkedin.com/in/kaleb-cole', 'https://x.com/Kalebicole'],
  );
  assert.ok(!output.includes('mailto:'));
});
