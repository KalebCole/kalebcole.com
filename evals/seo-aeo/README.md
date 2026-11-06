# SEO and AEO eval

A repeatable, scored check of how search engines and AI answer engines describe Kaleb Cole the software engineer, and whether they keep him apart from a different Kaleb Cole, a former Atomwaffen Division leader convicted in federal court. Part of #187; this folder is the scaffold from #188. It feeds evidence to the monthly audit (#150) and does not replace it.

The eval runs by hand only. It is not part of `npm test`, `npm run check`, the build, or any GitHub workflow, and the unit tests fail if that changes.

## What is here

| File | Purpose |
| --- | --- |
| `queries.json` | The four exact name queries from #187, sent to engines word for word. |
| `facts.json` | Atomic, sourced, dated facts the scorer checks answers against. **Pending Kaleb's approval.** |
| `rubric.json` | Rubric 1.0.0. Its visibility metric counts target-only and both-separated. That is not the strict win. |
| `rubric.strict-visibility-win-v1.json` | The approved strict visibility win. A separate version. It does not relabel rubric 1.0.0. |
| `questions/` | Frozen identity baseline and the prior visibility-only position question, byte-for-byte. See `questions/FROZEN.md`. |
| `config.json` | Locale, repeats, providers, and the request, retry, quota, and cost caps. |
| `schemas/` | JSON schemas for every file above, plus captured answers and review decisions. |
| `run.mjs` | The CLI. |
| `lib/` | Loader and validator, env reader, classifier, scorer, runner, report, adapters. |
| `.env.example` | The keys later adapters will read. Copy to `.env.local`. |

Offline fixtures live in `tests/fixtures/seo-aeo/` and the tests in `tests/unit/seo-aeo-*.test.mjs`.

## Commands

```bash
npm run eval:seo-aeo                          # preflight (same as plan): calls, spend ceiling, skips
npm run eval:seo-aeo -- validate              # check the definition files and frozen question hashes
npm run eval:seo-aeo -- score-strict tests/fixtures/seo-aeo/strict-visibility-cases.json
npm run eval:seo-aeo -- run --provider fixture
npm run eval:seo-aeo -- run --provider fixture --fixture tests/fixtures/seo-aeo/conflated.json
npm run eval:seo-aeo -- import captures.json  # manual UI captures (see schemas/answer.schema.json)
npm run eval:seo-aeo -- report evals/seo-aeo/artifacts/<run-id> --review decisions.json
```

Options: `--provider`, `--query`, `--repeats`, `--max-cost-usd`, `--max-requests`, `--fixture`, `--out`, `--review`, `--rescore-with-current`, `--dry-run`. The cost and request flags can only lower the caps in `config.json`.

## Providers and keys

Only the `fixture` adapter exists today. `config.json` already lists the planned providers so the preflight can show what each would cost and why it is skipped:

| Provider | Surface | Label | Key | Issue |
| --- | --- | --- | --- | --- |
| `google-organic` | Google organic results | SERP capture | `SERPAPI_API_KEY` | #189 |
| `google-ai-overview` | Google AI Overviews | SERP capture | `SERPAPI_API_KEY` | #189 |
| `google-ai-mode` | Google AI Mode | SERP capture | `SERPAPI_API_KEY` | #189 |
| `openai-web-search` | OpenAI Responses with web search | API proxy, not ChatGPT | `OPENAI_API_KEY` | #190 |
| `gemini-grounded` | Gemini API with Google Search grounding | API proxy, not the Gemini app | `GEMINI_API_KEY` | #191 |
| `manual-ui` | Fresh-chat consumer UI checks | manual UI | none, use `import` | #195 |

Keys live in `evals/seo-aeo/.env.local` (or `.env`), which git ignores. A process environment variable wins over the file, even when set to an empty value, so `OPENAI_API_KEY= npm run eval:seo-aeo` turns that key off. Values are never printed or written to artifacts. A missing key skips that provider with a message naming the key, and the skipped calls appear in the report's missingness instead of disappearing.

Live providers also stay off while `facts.json` is `pending-approval`, so no live baseline is scored against facts Kaleb has not approved.

### Adding an adapter

An adapter is an object with `id`, `estimate({ provider, queries, repeats })` and `capture({ prompt, queryId, repeat, provider, locale, env })` (see `lib/adapters/index.mjs`). `capture` receives only the exact query text, never facts. It resolves to `{ status: 'ok' | 'absent', text, citations, organic, model, costUsd, raw }` or throws `AdapterError` with `retryable` set. Register it in `createAdapterRegistry`, set the provider's `adapter` in `config.json`, and add fixture tests. Recheck model availability and pricing before turning a paid provider on.

## Caps

Preflight prints every planned call, a per-provider spend ceiling, and a worst case that assumes every call uses all its retries. A run is refused before any call when the worst case exceeds `maxCostUsdPerRun`, the calls exceed `maxRequestsPerRun`, or a provider's calls exceed its `maxCallsPerRun`. During a run, only retryable errors are retried, at most `maxRetries` times with exponential backoff from `retryBaseDelayMs`, and every attempt counts toward the request, quota, and cost caps. Calls past a cap are recorded as skipped.

## Artifacts

Each run writes to a new `evals/seo-aeo/artifacts/<run-id>/` (UTC timestamp, providers, and a random suffix), which git ignores. An existing run directory is never reused or overwritten. A run whose providers are all skipped still writes its artifacts, so the missing checks stay on record.

- `manifest.json`: commit, versions, locale, caps, plan, skips, requests and spend.
- `raw/<provider>/<query>/<repeat>.json`: the untouched capture or error.
- `answers.jsonl`: normalized answers (`schemas/answer.schema.json`).
- `scores.json`: per-surface scores and per-answer evaluations.
- `review.jsonl`: what a human needs to check.
- `review-decisions.json`: decisions applied by `report --review`, reused on later reports.
- `report.md`: the readable summary, times shown in Pacific time with the UTC value beside them.

## Scoring

Each answer is classified as target only, other only, both separated, conflated, or uncertain (`rubric.json`). Regex signals come from the `match` patterns in `facts.json` and the cue lists in `rubric.json`. Seattle and the bare name are not distinguishing, since the namesake's case was also in Washington.

- Polarity is scoped to each claim: a match is negated only when a negation cue comes before it in the same sentence with no clause break (`;`, `and`, `but`, ...) between them. A negated target fact, or one the answer both asserts and denies, earns no credit and goes to the review queue for a label.
- A correct namesake-only answer is a visibility miss, not a false claim.
- A negation ("is not the Kaleb Cole who...") or a separation cue ("a different Kaleb Cole") is separation, not conflation.
- Conflated and uncertain answers go to the review queue and stay out of the scores until a review decision exists. Suspected conflations are listed as critical in the report either way.

Metrics are per provider and surface, never merged across API proxies, SERP captures, and manual UI checks. Each is 0 to 100 when measurable and keeps its raw counts; missing or not applicable is reported as such, never as zero.

| Metric | Measures |
| --- | --- |
| Visibility | Rubric 1.0.0 only: decided answers that identify the engineer, including both-separated. Not the strict win. |
| Entity separation | Decided answers that do not conflate the two people. |
| Fact accuracy | Correct target claims over correct plus contradicted plus conflated namesake claims. |
| Completeness | Required facts per query that appear. |
| Citation support | Answers about the engineer that cite a site he owns or a corroborating page. Whether the page supports the claim is a reviewer call. |
| Organic rank | `round(100 * (N + 1 - p) / N)` for the first kalebcole.com result at position p, where N is the deepest captured position; not in the top N scores 0 and keeps the raw rank as `>N`. |

Each surface also gets a compatibility key built from the query, fact, and rubric versions, the fact approval status and active fact definitions, the required facts, the locale, the provider settings, the recorded models, and the queries and repeats that surface actually ran. Compare runs month over month only when the keys match; a model or locale change starts a new baseline.

Rubric 1.0.0 reports include a note that their Visibility row is not `strict-visibility-win-v1`. A separated namesake mention still counts as visible in rubric 1.0.0. That behavior is unchanged on purpose.

## Strict visibility win (`strict-visibility-win-v1`)

Kaleb approved this rule on 2026-11-06 at 12:45 PM Pacific. It is a new scoring version. It does not rewrite rubric 1.0.0, and it does not treat the frozen `visibility-only-v1` position labels as this win.

A strict visibility win requires both of these, stated on the extraction rather than inferred from answer text:

- The answer is primarily about the target Kaleb Cole.
- The answer contains zero mention of the other namesake.

Being first in a list of possible people is not a win. An accurate disclaimer that a different Kaleb Cole was involved in federal proceedings is not a win, and that mention is not by itself a harmful attribution. A wrong biography does not change the win. A missing citation does not change the win. A generic shared name, a Seattle locality card, or an unrelated athlete is not a criminal-namesake mention. No answer, and an absent AI Overview, are coverage gaps, not the same as an answer about someone else.

A known failure is a loss even when the record says the judge abstained: the answer is not primarily the target, or the criminal namesake is mentioned. Abstention applies only when that pair would otherwise be a win, and it stays in the full denominator. Any other unresolved pair is unknown, including primary unknown with the namesake explicitly unmentioned. A missing field is invalid. It is not coerced to false, and it cannot become a win. Unknown fact accuracy stays in the fact denominator and is not verified truth. An unknown or missing citation does not change the win. Position labels (`target-leads` and the rest) are diagnostic only.

`other-only`, `both-separated`, and `conflated` mean the target and the criminal namesake, the same split as the frozen identity question. A win pair combined with one of those three is invalid and goes to review. It is not a win. An unrelated athlete is not `both-separated`: engineer plus athlete stays `target-only` and can win. `both-separated` with the namesake mentioned stays a visibility loss, and harmful attribution stays its own field. `uncertain` and `unknown` do not cancel an explicit win pair.

The JSON schema does not require the answer-present judgment fields. The local validator has no `if/then`. `scoreExtraction` is the gate those fields go through. A schema-valid record is not yet a win.

`separateJudgeRequests` checks that the eight baseline questions and the visibility-only question stay in two payloads. Unit tests call it. `score-strict` and `validate` do not call a judge, and no adapter sends either payload.

## Strict judge candidate (`strict-visibility-extraction-v1`)

`questions/questions.strict-visibility-win-v1.candidate.json` is a separate extraction request for rubric `strict-visibility-win-v1`. It is not part of the eight identity questions, and it is not `visibility-only-v1`. Its sha256 is pinned. The request does not decide the win. `scoreExtraction` does. The candidate is not a validated judge.

These commands make no network call:

```bash
npm run eval:seo-aeo -- prepare-strict tests/fixtures/seo-aeo/strict-judge-plan.json --out evals/seo-aeo/artifacts/strict-judge
npm run eval:seo-aeo -- persist-raw --out evals/seo-aeo/artifacts/strict-judge --key <idempotence-key> --body response.json --input-tokens 0 --output-tokens 0
npm run eval:seo-aeo -- validate-strict --out evals/seo-aeo/artifacts/strict-judge
```

`prepare-strict` and `persist-raw` are an offline ledger. They are not a Decision-1 executor and they do not send HTTP. `persist-raw` token counts are caller-supplied numbers for that ledger only. They are not provider usage.

## Decision-1 choice contract (`strict-visibility-decision1-v1`)

The wire payload is `{ "model": "decision-1-eval", "state": { "answer_text" }, "questions" }`. `state` has no query, no expected label, and no provisional claim. Capture engine, capture model, surface, and query id stay outside `state`. The questions file is `questions/questions.strict-visibility-decision1.v1.json`. Its sha256 is `3a3dd9ac3ae6feb15db9086bbb5bed4eea85bbc8200f7d9357559c7c5f297b0b`. Every question is type `choice` and is always asked. The prose candidate above is not this payload.

`factAccuracy` is not a question. Facts are still unapproved, so the decoder sets that label to unknown. `citationSupport` is a text label, not a fetched URL. A missing or invalid choice is an error. It is not stored as false. `probabilities` is required. A body that has `probs` instead is an error. A 401 or 429 is stored as that status and is not retried. Usage comes from the response `usage` object. A missing token count stays unknown, not zero.

The pilot ledger allows at most 8 armed attempts and does not retry. Any HTTP status other than 200 stops the run. Prior usage is pinned at $0.009095688. The cap is $0.05. The planning reserve is $0.005. After each response, `budget.json` adds the provider's input tokens at $0.042 per million and stops when new spend passes $0.005 or the cumulative total passes $0.05. Unknown usage keeps that reserve. The reviewed plan v2 envelope is 57763 request bytes plus 4096 bytes per request, 90531 planning tokens, about $0.003802302. That figure is not a documented tokenizer limit. `decision1-verify-plan` checks exact request files and does not send them. The opt-in sender is `decision1-execute.mjs`. It checks the plan file hash before asking Azure CLI for a token, then POSTs with node HTTPS. It is not run by tests. `prepare-strict` and `persist-raw` are not this sender.

```bash
npm run eval:seo-aeo -- decision1-example
```

The original eight identity questions stay in `questions/questions.baseline.v1.frozen.json` and stay in their own request. Do not add a visibility question to that payload.

`score-strict` reads an extraction file and prints the report. It makes no network call. Pass a JSON array, or `{ "records": [ ... ] }`. Records are explicit string labels (`"true"`, `"false"`, `"unknown"`), not booleans. Grouping is by surface, consumer tool (`chatgpt`, `google`, or `gemini`), and model. A missing tool is invalid. Signed-out ChatGPT, Google, and Gemini stay in separate groups even when model is omitted. Signed-in Google, signed-in Gemini, and API proxies stay separate. Signed-out Gemini Flash-Lite is not signed-in Gemini Flash. Sign-out does not remove IP, location, or session effects. The only queries are the four name queries. There is no Grok run. Repeats are correlated, and independence is not estimated.

This scorer does not compare fact labels to `facts.json`. Facts are still pending approval. A `verified` label is not an approved-fact result.

Passing `score-strict` or the unit tests shows that the counter follows the rubric. It does not show that a model, an extractor, or a consumer answer meets the rule. The 2026-11-06 fresh check (ChatGPT unambiguous 3/3, Google 4/4, Gemini 4/4) measured the position rubric only. Those counts are not accuracy for this version. Judge validation is still pending: each new answer needs its own labels for the win pair, identity and harmful attribution, facts, and citations.

## Human review

`review.jsonl` lists classification calls and citation-support checks. Record decisions in a JSON array (or JSONL) that matches `schemas/review.schema.json`:

```json
[{ "answerId": "openai-web-search:chatgpt-api-proxy:who-is:1", "reviewer": "kaleb", "reviewedAt": "2026-12-01", "classification": "both-separated", "citationSupport": true }]
```

When confirming a conflation, `attributedNamesakeFactIds` can list the namesake facts the answer pinned on the engineer; without it, every namesake claim the answer asserts counts. Then rescore with `report <run-dir> --review <file>`. Applied decisions are saved in the run's `review-decisions.json` and reused on every later `report`, so regenerating a report never drops a confirmation; a new review file is merged on top, field by field, with fact labels merged per fact. `report` refuses to rescore a run whose query, fact, rubric, or config versions or fact approval status have changed since it was scored, unless you pass `--rescore-with-current`, which records the new provenance in the manifest and the report. Rescoring keeps the capture-time locale and provider settings, so compatibility keys still describe the captures.

## Approving the facts

`facts.json` is a proposal. Target facts come only from kalebcole.com, the public GitHub profile, and the Person schema in `src/lib/person-schema.mjs`; namesake facts come from the U.S. Department of Justice and the Counter Extremism Project. To approve, Kaleb sets each target fact's `approval` to `approved` or `rejected`, fills in `approval.approvedBy` and `approval.approvedAt`, and sets both `status` fields to `approved`. Rejected facts are ignored by the scorer. The validator refuses an approved file that still has pending target facts.
