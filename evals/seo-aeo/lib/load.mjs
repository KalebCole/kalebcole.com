// Loads and validates the eval definitions (queries, facts, rubric, config)
// and checks the references between them, so a bad edit fails before any
// provider is called.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from './schema.mjs';

export const EVAL_DIR = fileURLToPath(new URL('../', import.meta.url));

const DEFINITIONS = ['queries', 'facts', 'rubric', 'config'];

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadSchema(name, dir = EVAL_DIR) {
  return readJson(join(dir, 'schemas', `${name}.schema.json`));
}

function duplicates(values) {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

function regexErrors(label, patterns) {
  const errors = [];
  for (const pattern of patterns) {
    try {
      new RegExp(pattern, 'iu');
    } catch (error) {
      errors.push(`${label}: invalid pattern ${JSON.stringify(pattern)} (${error.message})`);
    }
  }
  return errors;
}

/** Cross-file checks that a JSON schema cannot express. */
export function checkDefinitions({ queries, facts, rubric, config }) {
  const errors = [];
  const factIds = facts.facts.map((fact) => fact.id);
  const targetIds = new Set(facts.facts.filter((fact) => fact.subject === 'target').map((fact) => fact.id));

  for (const id of duplicates(queries.queries.map((query) => query.id))) errors.push(`queries.json: duplicate query id ${id}`);
  for (const id of duplicates(queries.queries.map((query) => query.prompt))) errors.push(`queries.json: duplicate prompt ${id}`);
  for (const id of duplicates(factIds)) errors.push(`facts.json: duplicate fact id ${id}`);
  for (const id of duplicates(config.providers.map((provider) => provider.id))) errors.push(`config.json: duplicate provider id ${id}`);

  for (const query of queries.queries) {
    for (const id of [...query.requiredFactIds, ...query.desiredFactIds]) {
      if (!targetIds.has(id)) errors.push(`queries.json: ${query.id} references ${id}, which is not a target fact in facts.json`);
    }
  }
  for (const fact of facts.facts) {
    if (!fact.id.startsWith(`${fact.subject}-`)) errors.push(`facts.json: ${fact.id} must start with ${fact.subject}-`);
    errors.push(...regexErrors(`facts.json ${fact.id} match`, fact.match));
    errors.push(...regexErrors(`facts.json ${fact.id} contradict`, fact.contradict));
  }
  for (const id of rubric.accuracyExcludesFactIds) {
    if (!targetIds.has(id)) errors.push(`rubric.json: accuracyExcludesFactIds lists unknown target fact ${id}`);
  }
  errors.push(...regexErrors('rubric.json separationCues', rubric.signals.separationCues));
  errors.push(...regexErrors('rubric.json negationCues', rubric.signals.negationCues));

  if (facts.status === 'approved') {
    if (facts.approval.status !== 'approved' || !facts.approval.approvedBy || !facts.approval.approvedAt) {
      errors.push('facts.json: status approved needs approval.status approved, approvedBy and approvedAt');
    }
    for (const fact of facts.facts) {
      if (fact.subject === 'target' && fact.approval !== 'approved' && fact.approval !== 'rejected') {
        errors.push(`facts.json: ${fact.id} is still pending, so the file cannot be approved`);
      }
    }
  }
  return errors;
}

/**
 * Reads and validates every definition file. Throws one error that lists
 * every problem, so a single run shows everything to fix.
 */
export function loadDefinitions(dir = EVAL_DIR) {
  const definitions = {};
  const errors = [];
  for (const name of DEFINITIONS) {
    let value;
    try {
      value = readJson(join(dir, `${name}.json`));
    } catch (error) {
      errors.push(`${name}.json: ${error.message}`);
      continue;
    }
    for (const problem of validate(loadSchema(name, dir), value)) errors.push(`${name}.json: ${problem}`);
    definitions[name] = value;
  }
  if (errors.length === 0) errors.push(...checkDefinitions(definitions));
  if (errors.length > 0) {
    const error = new Error(`Invalid eval definitions:\n- ${errors.join('\n- ')}`);
    error.problems = errors;
    throw error;
  }
  return { ...definitions, dir };
}

/** Facts the scorer may use: rejected facts are dropped. */
export function activeFacts(facts) {
  return facts.facts.filter((fact) => fact.approval !== 'rejected');
}
