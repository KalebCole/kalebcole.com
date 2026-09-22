# Recommends capture contract

This folder defines a public-safe handoff for a possible recommendation. It is documentation and validation material only, not a collector or a private runtime.

## Boundary

A request contains only details intentionally supplied for one candidate. Do not add credentials, account identifiers, browser or media history, local paths, Telegram IDs, or runtime state. Do not infer a recommendation from observed activity.

A candidate is eligible only when Kaleb deliberately selects it and supplies its title, destination URL, medium, and date. It remains a draft until the normal repository review publishes it.

`take` is optional and can contain only Kaleb's exact supplied first-person wording. The system must never generate, expand, polish, summarize, infer, or replace a public take. Omit `take` when no exact wording is supplied.

## Files

- `contract.schema.json` validates a dry-run request.
- `dry-run.fixture.json` is a fictional validation example. It does not represent a real recommendation.

## Dry run

Validate the fixture without creating content or contacting a service:

```bash
node -e "JSON.parse(require('node:fs').readFileSync('automations/recommends-capture/dry-run.fixture.json', 'utf8')); console.log('fixture JSON is valid')"
```

A later private capture implementation must keep its runtime state outside this repository and emit only a request that satisfies this contract.
