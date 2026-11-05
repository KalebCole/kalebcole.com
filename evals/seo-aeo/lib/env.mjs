// Reads API keys from gitignored local env files in evals/seo-aeo/. Values
// stay in memory and are never printed or written to artifacts.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Parses KEY=VALUE lines. Blank values count as missing. */
export function parseEnvFile(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

/**
 * Process environment wins over files; earlier files win over later ones.
 * Returns a reader with has(name) and get(name).
 */
export function loadEnv({ dir, files = ['.env.local', '.env'], env = process.env } = {}) {
  const merged = {};
  for (const file of [...files].reverse()) {
    const path = join(dir, file);
    if (existsSync(path)) Object.assign(merged, parseEnvFile(readFileSync(path, 'utf8')));
  }
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && value !== '') merged[key] = value;
  }
  return {
    has: (name) => typeof merged[name] === 'string' && merged[name].trim() !== '',
    get: (name) => merged[name],
  };
}

export function missingKeyMessage(providerId, key) {
  return `${providerId}: skipped, ${key} is not set. Add it to evals/seo-aeo/.env.local (gitignored) to run this check.`;
}
