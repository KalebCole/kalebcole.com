# Prospective check for strict-visibility-win-v2

Status: frozen. No captures and no model calls are authorized by this file.

## Freeze

- Questions: `evals/seo-aeo/questions/questions.strict-visibility-decision1.v2.json`
- Questions SHA-256: `7baece442ad3dcf0c65b2995efc8efb89da8f7988a887e4799c44cbb4d51e392`
- Scorer: `evals/seo-aeo/lib/strict-visibility-v2.mjs`
- Scorer SHA-256: `b72f8193af1f84a895c7e3bf87d71e1d487ef332199fd19b2277b0de93b13721`
- Rubric: `evals/seo-aeo/rubric.strict-visibility-win-v2.json`
- Rubric SHA-256: `d7a93da04345fbb1759603cd606527147c4f7c459e760f60f443b0d3e2779f15`
- Query list SHA-256: `6e6bab2e14984615911dd193edef08f4f830ae827a8c3556d9d3f5dd5351fc81`
- v1 questions stay `questions.strict-visibility-decision1.v1.json`, SHA-256 `3a3dd9ac3ae6feb15db9086bbb5bed4eea85bbc8200f7d9357559c7c5f297b0b`
- The live sender still loads the v1 questions. This plan does not point it at v2.

## Pinned cases

Eight new slots. The reviewed eight answers are not these slots and are not the proof set.

| Slot | Engine | Session | Query id | Prompt |
| --- | --- | --- | --- | --- |
| google:signed-out:name | google | signed-out | name | kaleb cole |
| google:signed-out:who-is | google | signed-out | who-is | who is kaleb cole |
| google:signed-out:name-microsoft | google | signed-out | name-microsoft | kaleb cole microsoft |
| google:signed-out:name-seattle-swe | google | signed-out | name-seattle-swe | kaleb cole seattle software engineer |
| gemini:signed-out:name | gemini | signed-out | name | kaleb cole |
| gemini:signed-out:who-is | gemini | signed-out | who-is | who is kaleb cole |
| gemini:signed-out:name-microsoft | gemini | signed-out | name-microsoft | kaleb cole microsoft |
| gemini:signed-out:name-seattle-swe | gemini | signed-out | name-seattle-swe | kaleb cole seattle software engineer |

No other query or engine is part of this check. A result for an unplanned id is refused. A planned slot with no extraction is `missing` and stays in the total.

## Accounting

`npm run eval:seo-aeo -- prospective-v2` prints the empty grid. It does not capture or call a model. `calls` is 0.

Every slot is one of: win, loss, unknown, invalid, missing, coverage-missing, version-mismatch. Those counts sum to 8. Abstention is a subset of unknown: outcome unknown and abstained true. v2 has no abstain outcome.

The full pipeline denominator is the 8 planned slots. Wins divided by anything smaller is not the headline. Decisive conditional agreement uses only wins and losses, and its coverage is that count divided by 8. Invalid is a contradiction or a missing required label. It is not a correct judgment and it is not a fix.

An answer-present v2 row needs `abstained` true or false. Omitting it is invalid, not a win. The shared schema is unchanged, so v1 still accepts an omitted abstained boolean.

## Before any fresh capture or call

1. Independent recheck of this file and the hashes above.
2. Assemble eight new unlabeled captures outside this repository, one per slot. Do not reuse the reviewed eight.
3. Pin the request bytes in a new plan. Do not regenerate bodies. Keep the existing budget stop, and do not retry.
4. Only with a separate approval, send. factAccuracy stays unknown until approved fact evidence exists.

A later pass would still not make the judge unattended-ready by itself. This document does not authorize that call.
