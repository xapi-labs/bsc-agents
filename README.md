# xAPI BSC agents

Four request-scoped Agent Studio products for BNB Chain: Health Factor Monitoring,
Yield Optimisation, Grid Trading and Liquidity Rebalancing. The new **v8 candidates**
use real xAPI data, deterministic calculations and a model-generated explanation.
They return assessments or unsigned plans; they do not execute fund movements.

## Current candidates

[releases/candidates.json](releases/candidates.json) lists the manifests,
request files, per-agent runtime versions and their original source provenance.
[agents.json](agents.json) is the authoritative mapping from each release to its
BSC mainnet ERC-8004 identity and standalone Worker name.

| Agent | Candidate | Required runtime | Behavior |
|---|---|---|---|
| Health Factor Monitoring | [health-factor-pi-v8](releases/health-factor-pi-v8) | worker-v7 | Protocol-reported health factor, two-sided shocks and conditional mitigation comparisons; no default target HF |
| Yield Optimisation | [yield-optimizer-pi-v8](releases/yield-optimizer-pi-v8) | worker-v8 | Route to the highest currently verified, comparable yield subject to asset/protocol constraints; distinguish APR from APY |
| Grid Trading | [grid-trading-pi-v8](releases/grid-trading-pi-v8) | worker-v9 | Seven-day WBNB/USDT proposal from paired live prices/candles, quote-funded inventory and conditional keeper intents |
| Liquidity Rebalancing | [liquidity-rebalancing-pi-v8](releases/liquidity-rebalancing-pi-v8) | worker-v10 | Discover an existing PancakeSwap v3 WBNB/USDT NFT, calculate correctly oriented ranges and compare keeping versus resetting |

The full runtime names are `agent-studio-worker-v7` through `-v10`. Candidate key
v8, manifest schema v2, input profile v3 and Worker runtime versions are separate
version axes. There is no single shared runtime version for these candidates.

The implementation originally came from
[xapi-backend commit 5556ba3](https://github.com/xapi-labs/xapi-backend/commit/5556ba324373a7b0f199f74a821dd7b7cb5b75f8),
but this repository now owns the runtime, schemas, deterministic analysis,
read-only Web3 adapters, Worker renderer and deployment configuration. A backend
checkout is no longer needed to build or deploy these four Agents.

## How the managed runtime works

Each candidate has a fixed sequence of allowlisted, read-only xAPI queries. Code
validates identity, evidence and arithmetic, then DeepSeek v4 Flash explains the
structured result through the xAPI AI Gateway. The explanation cannot supply the
numeric plan or silently replace missing evidence. Unavailable or rejected prose
falls back transparently to a template. The candidate paths bypass the older
model-directed Pi repair loop while retaining the pinned engine identity and
existing gateway, signing, authorization and request limits.

Health and Liquidity accept a wallet without requiring a target HF, budget or
manually transcribed position snapshot. Ambiguous positions need a selector.
Yield and Grid require their asset/pair and proposed capital budget; that budget
is not represented as an observed wallet balance. Exact requests are checked in
as `live-test.request.json` beside each manifest.

These remain advisory tools. Neither the label “Monitoring” nor a keeper plan
means a background monitoring or execution service has been started. Evidence
and coverage gaps remain explicit, and reference market prices are not executable
quotes or necessarily pool spot prices. See [test results and limits](docs/v8-validation.md).

## Build and verify

Install the pinned dependencies, regenerate all four Worker modules, run the
runtime and contract tests, and ask Wrangler to build every upload without
publishing it:

```bash
pnpm install --frozen-lockfile
pnpm render
pnpm verify
pnpm test
pnpm typecheck
pnpm wrangler:dry-run
```

Generated, reviewable artifacts live under `workers/<release-key>/`. Each folder
contains `src/agent.mjs`, `wrangler.jsonc` and `deployment.json`; the last file
pins the source hash, runtime digest and ERC-8004 identity. See
[standalone deployment](docs/standalone-deployment.md) for the secret and rollout
procedure.

## Native Studio sources and previous candidates

`HealthFactorAgent/`, `YieldOptimizerAgent/`, `GridTradingAgent/` and
`RebalancingAgent/` retain the original Agent Studio 0.0.13 workspaces and their
v7 candidate manifests. Their generated protocol/signing boundaries are unchanged.
The native `app/agent` Node process does not implement these new managed Worker
analysis paths; do not confuse its deployment with publishing a v8 candidate.

[releases.json](releases.json) preserves the old v7-to-runtime-v6 mapping and adds
only a pointer to the new candidate catalog. Use each new catalog entry's manifest
and runtime together rather than applying the legacy global runtime to v8.

To build a native authoring workspace, follow its `AGENTS.md` and run from its root:

```bash
pnpm install --frozen-lockfile
pnpm --dir app/agent build
```

## Release state

The repository is deployable, but a generated file is not evidence of a live
deployment. Publishing, secret creation and xAPI service registration remain
explicit operator actions. The recorded ERC-8004 identities already exist on BSC;
this workflow only preserves and exposes those identities and never holds or
uses their wallet keys. Promotion and rollback must preserve the exact
source/manifest/runtime/identity pairing.
