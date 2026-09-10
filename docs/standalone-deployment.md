# Standalone Cloudflare Worker deployment

The four v8 Agents are ordinary Cloudflare Workers. xAPI does not compile,
publish or control them. After deployment, register each Worker as a normal API
service and let the standard xAPI Gateway handle consumer authentication,
billing and usage records.

## Security boundary

Each Worker requires three persistent Cloudflare secrets:

- `XAPI_AGENT_INVOKE_SECRET`: authenticates the xAPI Gateway to this Worker.
- `XAPI_MODEL_API_KEY`: calls the model through `https://ai.xapi.to/v1`.
- `XAPI_WEB3_API_KEY`: calls the read-only Binance Web3 API through xAPI.

Use a distinct invocation secret per Worker. Never commit secret values or pass
them as shell arguments. In the ordinary xAPI service configuration, store the
same invocation value as a private upstream header named
`X-XAPI-Upstream-Token`. Consumers continue to send only their own `xapi-key` to
xAPI; the Gateway injects the private upstream header.

## Render and inspect

```bash
pnpm install --frozen-lockfile
pnpm render
pnpm verify
pnpm test
pnpm typecheck
pnpm wrangler:dry-run
```

`pnpm render` is deterministic. Review changes to both `src/agent.mjs` and
`deployment.json`; an unexpected source hash change must be explained before
publishing.

## Set secrets and deploy

For each release, enter values interactively. This example uses Grid Trading:

```bash
pnpm wrangler secret put XAPI_AGENT_INVOKE_SECRET --config workers/grid-trading-pi-v8/wrangler.jsonc
pnpm wrangler secret put XAPI_MODEL_API_KEY --config workers/grid-trading-pi-v8/wrangler.jsonc
pnpm wrangler secret put XAPI_WEB3_API_KEY --config workers/grid-trading-pi-v8/wrangler.jsonc
pnpm wrangler deploy --config workers/grid-trading-pi-v8/wrangler.jsonc --keep-vars
```

Repeat for the other three `workers/*/wrangler.jsonc` files. Record the exact
deployed URL and Worker version ID beside the release evidence; do not edit
`agents.json` merely to match an accidental deployment.

## Verify before xAPI registration

The Agent Card is public and should expose the matching ERC-8004 identity:

```bash
curl -fs https://<worker-url>/.well-known/agent-card.json | jq '.xapi.erc8004'
```

Direct invocation must reject a request without the private upstream token. Test
an authenticated request using an operator-only environment variable so the
secret does not enter shell history:

```bash
curl -fs -X POST https://<worker-url>/x402 \
  -H "X-XAPI-Upstream-Token: ${AGENT_UPSTREAM_TOKEN:?}" \
  -H 'content-type: application/json' \
  --data @releases/grid-trading-pi-v8/live-test.request.json
```

This call reads live external data and consumes model/Web3 API quota. It does not
sign or submit a transaction.

## Register as an ordinary xAPI service

Create a normal API service whose upstream base URL is the Worker URL. Configure
the private `X-XAPI-Upstream-Token` header, import or describe `POST /x402` and
`GET /.well-known/agent-card.json`, then publish through the ordinary API review
and version lifecycle. No Agent Studio database row or special runtime flag is
required.

After the public xAPI host passes E2E, retain the previous Worker version for
rollback. Do not delete a prior Worker until the xAPI serving revision, Agent
Card identity, model call, Web3 evidence and usage record have all been verified.
