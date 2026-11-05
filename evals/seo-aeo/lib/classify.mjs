// Deterministic entity classification. Regex signals only flag; they do not
// interpret meaning, so conflated and uncertain answers go to human review
// instead of being guessed.

const flags = 'iu';

export function compileSignals(facts, rubric) {
  const compile = (patterns) => patterns.map((pattern) => new RegExp(pattern, flags));
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

const matchesAny = (patterns, text) => patterns.some((pattern) => pattern.test(text));

function readSentence(text, signals) {
  return {
    text,
    target: signals.target.filter((fact) => fact.distinguishing && matchesAny(fact.match, text)).map((fact) => fact.id),
    namesake: signals.namesake.filter((fact) => matchesAny(fact.match, text)).map((fact) => fact.id),
    negated: matchesAny(signals.negation, text),
    separated: matchesAny(signals.separation, text),
  };
}

/**
 * Classifies one answer as target-only, other-only, both-separated,
 * conflated, or uncertain, with the reasons and the sentences behind it.
 */
export function classifyAnswer(text, signals) {
  const sentences = splitSentences(text).map((sentence) => readSentence(sentence, signals));
  const hasTarget = sentences.some((sentence) => sentence.target.length > 0);
  const assertsNamesake = sentences.some((sentence) => sentence.namesake.length > 0 && !sentence.negated);
  const negatesNamesake = sentences.some((sentence) => sentence.namesake.length > 0 && sentence.negated);
  const separated = sentences.some((sentence) => sentence.separated);
  const conflatedSentences = sentences.filter(
    (sentence) => sentence.target.length > 0 && sentence.namesake.length > 0 && !sentence.negated && !sentence.separated,
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
    reasons.push('target and namesake signals share a sentence with no separation cue or negation');
  } else if (separated) {
    classification = 'both-separated';
    reasons.push('both people appear with a separation cue');
  } else {
    classification = 'uncertain';
    reasons.push('both people appear with no separation cue');
  }

  return {
    classification,
    reasons,
    sentences,
    conflatedNamesakeFactIds: [...new Set(conflatedSentences.flatMap((sentence) => sentence.namesake))],
    targetText: sentences
      .filter((sentence) => !(sentence.namesake.length > 0 && sentence.target.length === 0 && !sentence.negated))
      .map((sentence) => sentence.text)
      .join(' '),
  };
}

/** Target facts present and contradicted in text attributed to the target. */
export function extractTargetFacts(text, signals) {
  const present = [];
  const contradicted = [];
  for (const fact of signals.target) {
    if (matchesAny(fact.contradict, text)) contradicted.push(fact.id);
    else if (matchesAny(fact.match, text)) present.push(fact.id);
  }
  return { present, contradicted };
}
