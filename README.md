# xAPI Agent Studio competition agents

These are four prebuilt, request-scoped agents, authored from Agent Studio 0.0.13 workspaces, for
the BNB Chain Smart Money Era tracks. They are product releases maintained by
xAPI, not a general-purpose runtime where users upload arbitrary agent code.

Each top-level Agent directory is a standalone pnpm workspace containing the
original Agent Studio TypeScript project and its reviewed
`xapi-worker.manifest.json`. `releases.json` maps the four manifests to the
platform runtime releases used by xAPI.

| Release                 | Studio workspace      | Result                                                      |
| ----------------------- | --------------------- | ----------------------------------------------------------- |
| `rebalancing-pi-v7`     | `RebalancingAgent`    | Unsigned concentrated-liquidity rebalance plan              |
| `grid-trading-pi-v7`    | `GridTradingAgent`    | Unsigned bounded grid and order plan                        |
| `yield-optimizer-pi-v7` | `YieldOptimizerAgent` | Risk-adjusted opportunity ranking and allocation plan       |
| `health-factor-pi-v7`   | `HealthFactorAgent`   | Health-factor calculation, stress tests and mitigation plan |

## Managed execution now uses Pi

All four xAPI manifests pin `engine: "pi-agent-core@0.85.1"`. The publisher
bundles the official `@earendil-works/pi-agent-core` package into each User Worker.
Pi's `runAgentLoopContinue` owns model turns, tool dispatch and tool-result
history. It replaces the handwritten model/tool loop, not the platform's
security or marketplace services. There is no Node process, Container, Pi CLI,
shell, filesystem tool, persistent session, or remotely loaded runtime.

xAPI supplies Pi with a minimal reviewed tool set and a bounded, non-streaming
model transport. The model still goes through the xAPI AI gateway. Required
wallet hydration runs once before Pi starts, counts toward the same budget, and
enters Pi as compact evidence. DeepSeek reasoning is disabled, output is capped
at 4096 tokens, and invalid output receives at most two repair attempts. The
Worker also enforces 6 total tool calls, response-size bounds, timeouts, strict
raw argument validation, and request cancellation.

Agent Studio is **optional for execution**, but retained as an authoring/import
source and as the untouched official protocol/signing scaffold. The native
`app/agent` code is not the deployed xAPI Worker and has not been migrated to Pi.
In particular, retaining that source does not make native ERC-8183 jobs or wallet
signing available in the Worker. Pi itself supplies neither Web3 queries nor
marketplace billing: those remain xAPI-owned adapters and services.

For the competition we keep Studio compatibility and the service-profile sync
tests. A future platform-native project template can emit the same manifest
without Studio; removing Studio from backend registration metadata, CLI-version
gates and source-bundle provenance would be a separate migration.

Each workspace was generated with the official CLI and keeps its generated
protocol/signing boundary intact for the official Node deployment targets:

- A2A + FREE x402 faces, with FREE ERC-8183 quotes on BSC testnet;
- OpenAI-compatible `deepseek-v4-flash` calls through the xAPI AI Gateway at
  `https://ai.xapi.to/v1`, including provider reasoning continuity across tool
  turns;
- one fixed service prompt and JSON delivery contract per agent;
- read-only chain tools available to the model, while all signing stays in
  generated fixed code;
- no conversational memory or application persistence. ERC-8183 delivery may
  remain alive briefly after `notify_funded`; `/ping` reports `HEALTHY_BUSY`
  only for that bounded background job.

The Worker-native v2 manifests expose only the Binance Web3 reads that feed each
Agent's publishable evidence contract. Health reads lending positions, Grid can
read price/candles plus one relevant base-token balance, Liquidity reads pool and
price evidence, and Yield reads investment lists/details. Exact
concentrated-liquidity NFT state remains caller input. Health uses the
protocol-reported factor to infer a portfolio-wide effective liquidation
threshold when per-asset thresholds are absent.

Each v2 manifest also selects a versioned input profile. The canonical
address-based request keeps fixed parameters and the user's prompt separate:

```json
{
  "input": {
    "walletAddress": "0x...",
    "chainId": "56",
    "positionSelector": {
      "protocol": "PancakeSwap v3",
      "positionId": "..."
    },
    "constraints": {}
  },
  "prompt": "Assess the selected position and propose an unsigned mitigation plan."
}
```

`account` remains an accepted alias for `walletAddress`, and numeric `56` is
normalized to the canonical string chain ID. Conflicting aliases or malformed
addresses are rejected before any upstream call. When an address is present,
the fixed Worker runtime deterministically hydrates the following read-only data
before analysis:

| Agent                 | Automatic address hydration                         | Facts still normally supplied by the caller                     |
| --------------------- | --------------------------------------------------- | --------------------------------------------------------------- |
| Liquidity Rebalancing | matching DeFi positions when a wallet is supplied  | pool, capital and strategy constraints                          |
| Grid Trading          | matching base-token balance when a wallet is supplied | pair, capital, optional strategy bounds and risk limits       |
| Yield Optimisation    | matching DeFi positions when a wallet is supplied  | principal, allocation preferences and constraints               |
| Health Factor         | matching DeFi lending positions                    | target HF and optional exact position selector                  |

The Agent Card publishes both the profile ID and its JSON input schema. All four
current profiles treat caller input as intent, locators, and constraints rather
than market evidence. Time-sensitive prices, pools, opportunities, and positions
come from read-only tools. Health does not query wallet balances. An address is
enough to discover supported positions,
while the prompt still supplies strategy intent. If multiple positions remain
plausible, the Agent must use an exact `positionSelector` or return `needs_input`.

The MVP is advisory: it never claims to execute swaps, orders, deposits,
repayments or other user-fund actions. Missing facts that cannot be resolved by
an allowlisted tool are returned as `needs_input`, not guessed.

## Build locally

Run from each workspace root:

```bash
pnpm install --frozen-lockfile
pnpm --dir app/agent build
```

The xAPI Cloudflare target does not deploy that Node process. Each project has
an `xapi-worker.manifest.json` containing the reviewed service profile. The
xAPI publisher combines it with the fixed stateless Pi-backed Worker runtime, and the four
current manifests expose synchronous A2A/x402 plus explicit read-only tool
allowlists. No wallet or Web3 API key is copied into a User Worker; the
competition Worker remains advisory and unsigned.

The fixed Pi-backed Worker runtime, Marketplace contract renderer, registration
API and Cloudflare publisher are maintained in `xapi-backend`; they are not
duplicated in this source repository.

## Marketplace schema and executable example

From an `xapi-backend` checkout, render endpoint metadata for a Marketplace
SANDBOX revision from the same manifest that will be deployed:

```bash
pnpm agent-studio:marketplace-contract -- \
  --manifest /path/to/bsc-agents/GridTradingAgent/xapi-worker.manifest.json
```

To print only the request body that can be pasted into the Marketplace
playground or sent to `/x402`, add `--request-only`. The renderer emits no key,
wallet secret or environment value. Schema tests validate the emitted example,
and generated-Worker tests send the exact same object through each Agent's
signed x402 handler and assert HTTP 200.

## Release state

`releases.json` is a candidate mapping only. A Worker release becomes
activatable after its real source digest, normalized manifest digest, scoped
model secret and end-to-end A2A/x402 tests have been verified. ERC-8183 remains
available only in the unmodified official Studio runtime until a separate
Worker-native workflow is designed. Neither the Studio CLI's BNB/AWS/Azure
deploy command nor a live Cloudflare deployment is run from this repository
during local implementation.

The `*-pi-v7` keys are new candidates, not changes to any previously registered
v6 release. Keep the manifest schema at v2 and use Pi runtime profile v6 for the
v7 DeepSeek releases. The earlier v6 candidates selected the versioned input
profiles with complete nested schemas and Marketplace examples. The v1 input
profiles remain unchanged so existing release digests and deployed Workers can
still be verified. Legacy manifests
without an engine remain parseable with their original digest, but the
publisher refuses to upload them or any v2 runtime release.
Register a fresh source bundle containing the updated manifest and its actual
source digest, validate a new staging deployment, and only then change
marketplace routing. Existing deployed Workers stay unchanged.
Any future change to the generated runtime's execution semantics must use a new
runtime profile rather than silently changing v5.
