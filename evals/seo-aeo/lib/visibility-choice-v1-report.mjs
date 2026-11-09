// Offline accounting. This is the only module that reads gold labels.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHOICE_DIR, accountChoice, decideChoice } from './visibility-choice-v1.mjs';

export function loadChoiceGold() {
  const parsed = JSON.parse(readFileSync(join(CHOICE_DIR, 'gold.json'), 'utf8'));
  return new Map(Object.entries(parsed.labels));
}

export function reportChoice(plan, rawById = new Map()) {
  const labels = loadChoiceGold();
  const decisions = new Map();
  for (const [id, raw] of rawById.entries()) {
    let parsed = raw;
    if (Buffer.isBuffer(raw)) {
      try {
        parsed = JSON.parse(raw.toString('utf8'));
      } catch {
        decisions.set(id, { outcome: 'invalid' });
        continue;
      }
    }
    decisions.set(id, decideChoice(parsed));
  }
  return accountChoice(plan, decisions, labels);
}
