# Prospective check for strict-visibility-win-v2

Status: frozen candidate. No captures and no model calls in this change.

## Freeze

- Questions: `evals/seo-aeo/questions/questions.strict-visibility-decision1.v2.json`
- SHA-256: `7baece442ad3dcf0c65b2995efc8efb89da8f7988a887e4799c44cbb4d51e392`
- Rubric: `evals/seo-aeo/rubric.strict-visibility-win-v2.json`
- Scorer: `evals/seo-aeo/lib/strict-visibility-v2.mjs`
- v1 questions stay `questions.strict-visibility-decision1.v1.json`, SHA-256 `3a3dd9ac3ae6feb15db9086bbb5bed4eea85bbc8200f7d9357559c7c5f297b0b`
- The live sender still loads the v1 questions. Do not point it at v2 without a separate approval.

## What the offline tests show

They check the scorer and the decoder on synthetic records. A namesake class with a false or unknown mention is invalid, and the stored label is not rewritten. An explicit win pair with abstention is invalid, not a win and not a settled abstention. Unknown fact accuracy stays unknown and does not block an otherwise valid win. Missing and unknown labels are not turned into false.

## What they do not show

They do not show that a model will follow the new wording. They do not score the reviewed eight answers again, and they are not accuracy. Those eight cases motivated the failure classes. They are not the prospective sample.

## Before any fresh capture or call

1. Independent review of this freeze, including the question hash.
2. Assemble a new unlabeled capture set outside this repository. Do not reuse the reviewed eight as the proof set.
3. Pin a new plan the same way as plan v2: exact request bytes, no regenerated bodies, budget stop at $0.005 new or $0.05 cumulative, no retries.
4. Only then, and only with a separate approval, send. factAccuracy stays unknown until approved fact evidence exists.

A pass on that future set still would not make the judge unattended-ready by itself. This document does not authorize that call.
