# xAPI BSC agents

Four request-scoped Agent Studio products for BNB Chain: Health Factor Monitoring,
Yield Optimisation, Grid Trading and Liquidity Rebalancing. The new **v8 candidates**
use real xAPI data, deterministic calculations and a model-generated explanation.
They return assessments or unsigned plans; they do not execute fund movements.

## Current candidates

[releases/candidates.json](releases/candidates.json) lists the new manifests,
request files, per-agent runtime versions and pinned backend provenance.

| Agent | Candidate | Required runtime | Behavior |
|---|---|---|---|
| Health Factor Monitoring | [health-factor-pi-v8](releases/health-factor-pi-v8) | worker-v7 | Protocol-reported health factor, two-sided shocks and conditional mitigation comparisons; no default target HF |
| Yield Optimisation | [yield-optimizer-pi-v8](releases/yield-optimizer-pi-v8) | worker-v8 | Route to the highest currently verified, comparable yield subject to asset/protocol constraints; distinguish APR from APY |
| Grid Trading | [grid-trading-pi-v8](releases/grid-trading-pi-v8) | worker-v9 | Seven-day WBNB/USDT proposal from paired live prices/candles, quote-funded inventory and conditional keeper intents |
| Liquidity Rebalancing | [liquidity-rebalancing-pi-v8](releases/liquidity-rebalancing-pi-v8) | worker-v10 | Discover an existing PancakeSwap v3 WBNB/USDT NFT, calculate correctly oriented ranges and compare keeping versus resetting |

The full runtime names are `agent-studio-worker-v7` through `-v10`. Candidate key
v8, manifest schema v2, input profile v3 and Worker runtime versions are separate
version axes. There is no single shared runtime version for these candidates.

Required backend: [xapi-backend commit 5556ba3](https://github.com/xapi-labs/xapi-backend/commit/5556ba324373a7b0f199f74a821dd7b7cb5b75f8),
on `feat/agent-studio-wfp-mvp`, or a descendant preserving its contracts.
The backend owns the analysis code, input/output schemas, xAPI gateway adapters,
Marketplace integration and Cloudflare publisher. Copying only the new prompts
into an older backend does not install the new runtime behavior.

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

## Verify and reproduce

Verify catalog consistency and artifact hashes with Node.js (no install needed):

```bash
node scripts/verify-candidates.mjs
```

For real upstream tests, use a backend checkout containing the pinned commit.
Install its dependencies using its lockfile and supply
`AGENT_STUDIO_MODEL_API_KEY` and `XAPI_WEB3_API_KEY` through the process environment.
From that backend root:

```bash
export BSC_AGENTS_ROOT=/absolute/path/to/bsc-agents
pnpm exec ts-node -r tsconfig-paths/register scripts/test-agent-studio-real-model.ts \
  --manifest "$BSC_AGENTS_ROOT/releases/liquidity-rebalancing-pi-v8/xapi-worker.manifest.json" \
  --request "$BSC_AGENTS_ROOT/releases/liquidity-rebalancing-pi-v8/live-test.request.json" \
  --release-key liquidity-rebalancing-pi-v8 --repeat 3 --apply
```

Omit `--apply` for a plan without API calls. Calls with `--apply` can consume API
credits and read new live state; snapshots are not substituted as upstreams.
Results go to the backend's ignored `infra/agent-studio-worker-runtime/dist/real-model/`.
Each candidate README gives its own command and pinned implementation notes.

To render the Marketplace contract for one of these exact manifests, run from
the same backend checkout:

```bash
pnpm exec ts-node -r tsconfig-paths/register scripts/render-agent-studio-marketplace-contract.ts \
  --manifest "$BSC_AGENTS_ROOT/releases/grid-trading-pi-v8/xapi-worker.manifest.json"
```

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

The checked-in metadata does not register or activate a release. New candidates
need a real source bundle and digest, backend-supported runtime, scoped model
credentials, and staging validation of signed A2A/x402 and billing before a
Marketplace serving binding is changed. Raw file SHA-256 values in the candidate
catalog are for repository sync verification, not platform registration digests.

No Cloudflare, AWS, Azure or on-chain deployment is performed by this update.
Existing registered releases and deployed Workers are unaffected. Promotion and
rollback must preserve the exact source/manifest/runtime pairing; see
[validation and promotion notes](docs/v8-validation.md).
