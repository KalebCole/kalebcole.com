# Recommends capture contract

This folder defines a public-safe handoff for a possible recommendation. It is documentation and validation material only, not a collector or a private runtime.

## Boundary

A request contains only details intentionally supplied for one candidate. Do not add credentials, account identifiers, browser or media history, local paths, Telegram IDs, or runtime state. Do not infer a recommendation from observed activity.

A candidate is eligible only when Kaleb deliberately selects it and supplies its title, destination URL, medium, and date. It remains a draft until the normal repository review publishes it.

`take` is optional and can contain only Kaleb's exact supplied first-person wording. The validator returns the same request object without generating, expanding, polishing, summarizing, inferring, replacing, or otherwise transforming a public take. Omit `take` when no exact wording is supplied.

Destination URLs must be canonical public `http` or `https` URLs. The contract rejects credentials, query parameters, and fragments. Query parameters are rejected rather than allowlisted because their public safety cannot be determined from a generic capture request.

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
