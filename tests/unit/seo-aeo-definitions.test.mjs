import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { checkDefinitions, loadDefinitions, loadSchema } from '../../evals/seo-aeo/lib/load.mjs';
import { validate } from '../../evals/seo-aeo/lib/schema.mjs';
import { PERSON_SCHEMA } from '../../src/lib/person-schema.mjs';
import { root } from '../support/root.mjs';

const definitions = loadDefinitions();

test('the committed definitions pass their schemas and cross-checks', () => {
  assert.deepEqual(checkDefinitions(definitions), []);
});

test('queries are exactly the four name queries from #187', () => {
  assert.deepEqual(definitions.queries.queries.map((query) => query.prompt), [
    'kaleb cole',
    'who is kaleb cole',
    'kaleb cole microsoft',
    'kaleb cole seattle software engineer',
  ]);
});

test('facts are a sourced, dated proposal that stays pending until Kaleb approves it', () => {
  const { facts } = definitions;
  assert.equal(facts.status, 'pending-approval');
  assert.equal(facts.approval.status, 'pending');
  for (const fact of facts.facts) {
    assert.ok(fact.sources.length > 0, `${fact.id} needs a source`);
    assert.equal(fact.approval, 'pending', `${fact.id} must wait for approval`);
    assert.match(fact.verifiedAt, /^\d{4}-\d{2}-\d{2}$/);
  }
  const namesake = facts.facts.filter((fact) => fact.subject === 'namesake');
  assert.ok(namesake.length >= 3, 'include namesake disambiguation facts');
  for (const fact of namesake) {
    for (const source of fact.sources) {
      assert.doesNotMatch(source.url, /kalebcole\.com|github\.com\/KalebCole/i, `${fact.id} must be sourced independently of the site`);
    }
  }
});

test('target facts only use the site, the GitHub profile, and the Person schema', () => {
  const allowed = /^https:\/\/(kalebcole\.com\/|github\.com\/KalebCole(\/kalebcole\.com\/blob\/[0-9a-f]{40}\/src\/lib\/person-schema\.mjs)?$)/;
  for (const fact of definitions.facts.facts.filter((entry) => entry.subject === 'target')) {
    for (const source of fact.sources) assert.match(source.url, allowed, `${fact.id} cites ${source.url}`);
  }
  const value = (id) => definitions.facts.facts.find((fact) => fact.id === id).value;
  assert.equal(value('target-name'), PERSON_SCHEMA.name);
  assert.equal(value('target-role'), PERSON_SCHEMA.jobTitle);
  assert.equal(value('target-employer'), PERSON_SCHEMA.worksFor.name);
  assert.equal(value('target-location'), PERSON_SCHEMA.homeLocation.name);
});

test('an approved status needs every target fact decided and an approver', () => {
  const approved = structuredClone(definitions);
  approved.facts.status = 'approved';
  const problems = checkDefinitions(approved);
  assert.ok(problems.some((problem) => problem.includes('approvedBy')));
  assert.ok(problems.some((problem) => problem.includes('target-role is still pending')));
});

test('the schemas reject bad records', () => {
  const answer = loadSchema('answer');
  assert.deepEqual(validate(answer, { provider: 'x', surface: 'x', label: 'manual-ui', queryId: 'name', repeat: 1, status: 'ok', capturedAt: '2026-11-05T22:00:00Z' }), []);
  const problems = validate(answer, { provider: 'x', surface: 'x', label: 'ui', queryId: 'name', repeat: 0, status: 'ok', capturedAt: 'yesterday', extra: 1 });
  assert.ok(problems.some((problem) => problem.includes('label')));
  assert.ok(problems.some((problem) => problem.includes('repeat')));
  assert.ok(problems.some((problem) => problem.includes('date-time')));
  assert.ok(problems.some((problem) => problem.includes('unexpected property extra')));
});

test('local keys and raw artifacts are gitignored, and the eval stays out of CI and the build', () => {
  for (const path of ['evals/seo-aeo/.env.local', 'evals/seo-aeo/.env', 'evals/seo-aeo/artifacts/run/raw.json']) {
    execFileSync('git', ['check-ignore', '-q', path], { cwd: root });
  }
  assert.throws(() => execFileSync('git', ['check-ignore', '-q', 'evals/seo-aeo/.env.example'], { cwd: root, stdio: 'ignore' }));
  const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts;
  assert.match(scripts['eval:seo-aeo'], /evals\/seo-aeo\/run\.mjs/);
  for (const [name, command] of Object.entries(scripts)) {
    if (name !== 'eval:seo-aeo') assert.doesNotMatch(command, /eval:seo-aeo|evals\/seo-aeo/, `${name} must not run the eval`);
  }
  const workflows = execFileSync('git', ['ls-files', '.github/workflows'], { cwd: root }).toString().split('\n').filter(Boolean);
  for (const workflow of workflows) {
    assert.doesNotMatch(readFileSync(join(root, workflow), 'utf8'), /eval:seo-aeo|evals\/seo-aeo/, `${workflow} must not run the eval`);
  }
});
