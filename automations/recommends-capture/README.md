# Recommends capture contract

This folder defines a public-safe handoff for a possible recommendation. It is documentation and validation material only, not a collector or a private runtime.

## Boundary

A request contains only details intentionally supplied for one candidate. Do not add credentials, account identifiers, browser or media history, local paths, Telegram IDs, or runtime state. Do not infer a recommendation from observed activity.

A candidate is eligible only when Kaleb deliberately selects it and supplies its title, destination URL, medium, and date. It remains a draft until the normal repository review publishes it.

`take` is optional and can contain only Kaleb's exact supplied first-person wording. The validator returns the same request object without generating, expanding, polishing, summarizing, inferring, replacing, or otherwise transforming a public take. Omit `take` when no exact wording is supplied.

Destination URLs must be canonical public `http` or `https` URLs. The contract rejects credentials and fragments. Query parameters are allowed because many public links need them, such as YouTube `watch?v=`, but parameters that track the sharer or carry credentials (`utm_*`, Spotify `si`, `fbclid`, `srsltid`, `X-Amz-*`, `token`, and the rest of `x-disallowedQueryParameters` in the schema) are rejected. Resubmit such a URL without those parameters; `node scripts/clean-url.mjs <url>` prints the cleaned form.

Published recommends in `src/content/recommends/` follow the same parameter rule, enforced by the collection schema during `npm run build`, and also reject credentials (`user:password@`). Fragments are allowed in published recommends because browsers never send them to the destination server; only capture requests reject them.

## Files

- `contract.schema.json` validates a dry-run request.
- `dry-run.fixture.json` is a fictional validation example. It does not represent a real recommendation.

## Dry run

Validate the fixture without creating content or contacting a service:

```bash
node scripts/validate-recommends-capture.mjs automations/recommends-capture/dry-run.fixture.json
```

The dependency-free validator reads and enforces `contract.schema.json`, including required fields, strict object shape, enums, draft-only requests, URL policy, and strict calendar dates.

A later private capture implementation must keep its runtime state outside this repository and emit only a request that satisfies this contract.
