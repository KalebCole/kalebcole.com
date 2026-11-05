// Deterministic entity classification. Regex signals only flag; they do not
// interpret meaning, so conflated and uncertain answers go to human review
// instead of being guessed.
//
// Polarity is scoped to each claim: a match counts as negated only when a
// negation cue comes before it in the same sentence with no clause break
// (";", ":", "and", "but", ...) in between. "He is not the Kaleb Cole who was
// convicted" negates "convicted"; "was sentenced ... and was not granted
// bail" does not negate "sentenced".

const CLAUSE_BREAK = /[;:]|\b(and|but|while|whereas|although|though|however|yet)\b/iu;

export function compileSignals(facts, rubric) {
  const compile = (patterns) => patterns.map((pattern) => new RegExp(pattern, 'iu'));
  const fact = (entry) => ({
    id: entry.id,
    distinguishing: entry.distinguishing,
    match: compile(entry.match),
    contradict: compile(entry.contradict),
  });
  return {
    target: facts.filter((entry) => entry.subject === 'target').map(fact),
    namesake: facts.filter((entry) => entry.subject === 'namesake').map(fact),
    separation: compile(rubric.signals.separationCues),
    negation: compile(rubric.signals.negationCues),
  };
}

export function splitSentences(text) {
  return String(text ?? '')
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

// Signals are compiled without the g flag so .test() never carries lastIndex
// between calls; matchAll gets a fresh global copy each time.
const matchesOf = (pattern, text) => [...text.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))];
const testAny = (patterns, text) => patterns.some((pattern) => matchesOf(pattern, text).length > 0);

/** True when a negation cue governs the match starting at index. */
function negatedAt(sentence, index, negation) {
  return negation.some((cue) => matchesOf(cue, sentence).some((found) => {
    const end = found.index + found[0].length;
    return end <= index && !CLAUSE_BREAK.test(sentence.slice(end, index));
  }));
}

/**
 * Polarity of each pattern group in a sentence: asserted when any match is
 * not negated, negated when every match is negated, absent otherwise.
 */
export function polarity(patterns, sentence, negation) {
  const found = patterns.flatMap((pattern) => matchesOf(pattern, sentence));
  if (found.length === 0) return 'absent';
  return found.some((match) => !negatedAt(sentence, match.index, negation)) ? 'asserted' : 'negated';
}

function readSentence(text, signals) {
  const read = (facts) => facts.map((fact) => ({ id: fact.id, distinguishing: fact.distinguishing, polarity: polarity(fact.match, text, signals.negation) }));
  const target = read(signals.target);
  const namesake = read(signals.namesake);
  const ids = (entries, wanted) => entries.filter((entry) => entry.polarity === wanted).map((entry) => entry.id);
  return {
    text,
    target: ids(target.filter((entry) => entry.distinguishing), 'asserted'),
    negatedTarget: ids(target, 'negated'),
    namesake: ids(namesake, 'asserted'),
    negatedNamesake: ids(namesake, 'negated'),
    separated: testAny(signals.separation, text),
  };
}

/**
 * Classifies one answer as target-only, other-only, both-separated,
 * conflated, or uncertain, with the reasons and the sentences behind it.
 */
export function classifyAnswer(text, signals) {
  const sentences = splitSentences(text).map((sentence) => readSentence(sentence, signals));
  const hasTarget = sentences.some((sentence) => sentence.target.length > 0);
  const assertsNamesake = sentences.some((sentence) => sentence.namesake.length > 0);
  const negatesNamesake = sentences.some((sentence) => sentence.negatedNamesake.length > 0);
  const separated = sentences.some((sentence) => sentence.separated);
  const conflatedSentences = sentences.filter(
    (sentence) => sentence.target.length > 0 && sentence.namesake.length > 0 && !sentence.separated,
  );

  let classification;
  const reasons = [];
  if (!hasTarget && !assertsNamesake) {
    classification = 'uncertain';
    reasons.push(negatesNamesake ? 'negates the namesake but gives no target signal' : 'no distinguishing signal for either person');
  } else if (hasTarget && !assertsNamesake) {
    classification = negatesNamesake ? 'both-separated' : 'target-only';
    if (negatesNamesake) reasons.push('mentions the namesake only in a negation');
  } else if (!hasTarget && assertsNamesake) {
    classification = 'other-only';
  } else if (conflatedSentences.length > 0) {
    classification = 'conflated';
    reasons.push('a sentence asserts target and namesake claims with no separation cue');
  } else if (separated) {
    classification = 'both-separated';
    reasons.push('both people appear with a separation cue');
  } else {
    classification = 'uncertain';
    reasons.push('both people appear with no separation cue');
  }
  if (sentences.some((sentence) => sentence.negatedTarget.length > 0)) reasons.push('negates a target claim; confirm the fact labels');

  return {
    classification,
    reasons,
    sentences,
    conflatedNamesakeFactIds: [...new Set(conflatedSentences.flatMap((sentence) => sentence.namesake))],
    assertedNamesakeFactIds: [...new Set(sentences.flatMap((sentence) => sentence.namesake))],
    negatedTargetFactIds: [...new Set(sentences.flatMap((sentence) => sentence.negatedTarget))],
    targetText: sentences
      .filter((sentence) => !(sentence.namesake.length > 0 && sentence.target.length === 0))
      .map((sentence) => sentence.text)
      .join('\n'),
  };
}

/**
 * Target facts present, contradicted, and negated in text attributed to the
 * target. A negated contradiction ("not its sole creator") is not a
 * contradiction, and a negated fact earns no credit, even when another
 * sentence asserts it.
 */
export function extractTargetFacts(text, signals) {
  const present = [];
  const contradicted = [];
  const negated = [];
  for (const sentence of splitSentences(text)) {
    for (const fact of signals.target) {
      if (polarity(fact.contradict, sentence, signals.negation) === 'asserted') contradicted.push(fact.id);
      const state = polarity(fact.match, sentence, signals.negation);
      if (state === 'asserted') present.push(fact.id);
      if (state === 'negated') negated.push(fact.id);
    }
  }
  const unique = (ids) => [...new Set(ids)];
  const contradictedIds = unique(contradicted);
  // A fact both asserted and denied earns no automatic credit; it stays in
  // negated so a reviewer labels it.
  const negatedIds = unique(negated).filter((id) => !contradictedIds.includes(id));
  return {
    present: unique(present).filter((id) => !contradictedIds.includes(id) && !negatedIds.includes(id)),
    contradicted: contradictedIds,
    negated: negatedIds,
  };
}
