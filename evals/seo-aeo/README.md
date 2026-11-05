# SEO and AEO eval

A repeatable, scored check of how search engines and AI answer engines describe Kaleb Cole the software engineer, and whether they keep him apart from a different Kaleb Cole, a former Atomwaffen Division leader convicted in federal court. Part of #187; this folder is the scaffold from #188. It feeds evidence to the monthly audit (#150) and does not replace it.

The eval runs by hand only. It is not part of `npm test`, `npm run check`, the build, or any GitHub workflow, and the unit tests fail if that changes.

## What is here

| File | Purpose |
| --- | --- |
| `queries.json` | The four exact name queries from #187, sent to engines word for word. |
| `facts.json` | Atomic, sourced, dated facts the scorer checks answers against. **Pending Kaleb's approval.** |
| `rubric.json` | Versioned classification rules, signals, and metric definitions. |
| `config.json` | Locale, repeats, providers, and the request, retry, quota, and cost caps. |
| `schemas/` | JSON schemas for every file above, plus captured answers and review decisions. |
| `run.mjs` | The CLI. |
| `lib/` | Loader and validator, env reader, classifier, scorer, runner, report, adapters. |
| `.env.example` | The keys later adapters will read. Copy to `.env.local`. |

Offline fixtures live in `tests/fixtures/seo-aeo/` and the tests in `tests/unit/seo-aeo-*.test.mjs`.

## Commands

```bash
npm run eval:seo-aeo                          # preflight (same as plan): calls, spend ceiling, skips
npm run eval:seo-aeo -- validate              # check the definition files
npm run eval:seo-aeo -- run --provider fixture
npm run eval:seo-aeo -- run --provider fixture --fixture tests/fixtures/seo-aeo/conflated.json
npm run eval:seo-aeo -- import captures.json  # manual UI captures (see schemas/answer.schema.json)
npm run eval:seo-aeo -- report evals/seo-aeo/artifacts/<run-id> --review decisions.json
```

Options: `--provider`, `--query`, `--repeats`, `--max-cost-usd`, `--max-requests`, `--fixture`, `--out`, `--review`, `--dry-run`. The cost and request flags can only lower the caps in `config.json`.

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

Keys live in `evals/seo-aeo/.env.local` (or `.env`), which git ignores; a process environment variable wins over the file. Values are never printed or written to artifacts. A missing key skips that provider with a message naming the key, and the skipped calls appear in the report's missingness instead of disappearing.

Live providers also stay off while `facts.json` is `pending-approval`, so no live baseline is scored against facts Kaleb has not approved.

### Adding an adapter

An adapter is an object with `id`, `estimate({ provider, queries, repeats })` and `capture({ prompt, queryId, repeat, provider, locale, env })` (see `lib/adapters/index.mjs`). `capture` receives only the exact query text, never facts. It resolves to `{ status: 'ok' | 'absent', text, citations, organic, model, costUsd, raw }` or throws `AdapterError` with `retryable` set. Register it in `createAdapterRegistry`, set the provider's `adapter` in `config.json`, and add fixture tests. Recheck model availability and pricing before turning a paid provider on.

## Caps

Preflight prints every planned call, a per-provider spend ceiling, and a worst case that assumes every call uses all its retries. A run is refused before any call when the worst case exceeds `maxCostUsdPerRun`, the calls exceed `maxRequestsPerRun`, or a provider's calls exceed its `maxCallsPerRun`. During a run, only retryable errors are retried, at most `maxRetries` times with exponential backoff from `retryBaseDelayMs`, and every attempt counts toward the request, quota, and cost caps. Calls past a cap are recorded as skipped.

## Artifacts

Each run writes to `evals/seo-aeo/artifacts/<run-id>/`, which git ignores:

- `manifest.json`: commit, versions, locale, caps, plan, skips, requests and spend.
- `raw/<provider>/<query>/<repeat>.json`: the untouched capture or error.
- `answers.jsonl`: normalized answers (`schemas/answer.schema.json`).
- `scores.json`: per-surface scores and per-answer evaluations.
- `review.jsonl`: what a human needs to check.
- `review-decisions.json`: decisions applied by `report --review`, reused on later reports.
- `report.md`: the readable summary, times shown in Pacific time with the UTC value beside them.

## Scoring

Each answer is classified as target only, other only, both separated, conflated, or uncertain (`rubric.json`). Regex signals come from the `match` patterns in `facts.json` and the cue lists in `rubric.json`. Seattle and the bare name are not distinguishing, since the namesake's case was also in Washington.

- A correct namesake-only answer is a visibility miss, not a false claim.
- A negation ("is not the Kaleb Cole who...") or a separation cue ("a different Kaleb Cole") is separation, not conflation.
- Conflated and uncertain answers go to the review queue and stay out of the scores until a review decision exists. Suspected conflations are listed as critical in the report either way.

Metrics are per provider and surface, never merged across API proxies, SERP captures, and manual UI checks. Each is 0 to 100 when measurable and keeps its raw counts; missing or not applicable is reported as such, never as zero.

| Metric | Measures |
| --- | --- |
| Visibility | Decided answers that identify the engineer. |
| Entity separation | Decided answers that do not conflate the two people. |
| Fact accuracy | Correct target claims over correct plus contradicted plus conflated namesake claims. |
| Completeness | Required facts per query that appear. |
| Citation support | Answers about the engineer that cite a site he owns or a corroborating page. Whether the page supports the claim is a reviewer call. |
| Organic rank | `round(100 * (N + 1 - p) / N)` for the first kalebcole.com result at position p of N captured; not in the top N scores 0 and keeps the raw rank as `>N`. |

Each surface also gets a compatibility key built from the query, fact, and rubric versions, the locale, and the queries and repeats that surface actually ran. Compare runs month over month only when the keys match; a model or locale change starts a new baseline.

## Human review

`review.jsonl` lists classification calls and citation-support checks. Record decisions in a JSON array (or JSONL) that matches `schemas/review.schema.json`:

```json
[{ "answerId": "openai-web-search:chatgpt-api-proxy:who-is:1", "reviewer": "kaleb", "reviewedAt": "2026-12-01", "classification": "both-separated", "citationSupport": true }]
```

Then rescore with `report <run-dir> --review <file>`. Applied decisions are saved in the run's `review-decisions.json` and reused on every later `report`, so regenerating a report never drops a confirmation; a new review file is merged on top.

## Approving the facts

`facts.json` is a proposal. Target facts come only from kalebcole.com, the public GitHub profile, and the Person schema in `src/lib/person-schema.mjs`; namesake facts come from the U.S. Department of Justice and the Counter Extremism Project. To approve, Kaleb sets each target fact's `approval` to `approved` or `rejected`, fills in `approval.approvedBy` and `approval.approvedAt`, and sets both `status` fields to `approved`. Rejected facts are ignored by the scorer. The validator refuses an approved file that still has pending target facts.
