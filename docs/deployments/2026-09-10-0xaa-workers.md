# 0xAA standalone Worker deployment — 2026-09-10

The four standalone Workers were deployed to Cloudflare account `0xAA`
(`4592ac4d37d07944e6abee1c15a6cc00`) after deterministic rendering, isolated
module evaluation, type checking, manifest verification and Wrangler dry-run.
No Agent Studio control-plane or Workers for Platforms namespace was used.

| Agent | Worker URL | deployed version |
| --- | --- | --- |
| Health Factor | https://xapi-bsc-health-factor-v8.0xaa.workers.dev | `dc5a9d30-b0b0-456a-b834-933447e64483` |
| Yield Optimisation | https://xapi-bsc-yield-optimizer-v8.0xaa.workers.dev | `b5544389-8484-4563-8023-6a996839a2c9` |
| Grid Trading | https://xapi-bsc-grid-trading-v8.0xaa.workers.dev | `bb05ed05-07d9-40e4-b688-c3d58d5ded40` |
| Liquidity Rebalancing | https://xapi-bsc-liquidity-rebalancing-v8.0xaa.workers.dev | `b032ea4b-ba99-4718-b96d-b12a1112b04f` |

Each Worker has the three required `secret_text` bindings. Values are not
stored in this repository. The same invocation secret was intentionally reused
for this hackathon deployment at the operator's explicit request.

## Live acceptance

All four public Agent Cards returned the expected BSC mainnet ERC-8004 identity.
Unauthenticated `POST /x402` returned `401` for every Worker. Authenticated live
requests returned `200` and exercised both the xAPI model gateway and Binance
Web3 API:

| Agent | invocation ID | result |
| --- | --- | --- |
| Health Factor | `92612d2a-972b-4c6f-b9b6-784d9ae69f70` | Completed; resolved a Venus debt position and reported HF `1.47`. |
| Yield Optimisation | `aa142cc7-4229-49c4-b126-e1b0f3135988` | Completed; eight candidates, two-protocol allocation, weighted APY `4.578%`. |
| Grid Trading | `98149b61-1b1e-4775-82af-d90389efcba2` | Completed; live price, 168 candles, pool evidence and ten-level unsigned grid. |
| Liquidity Rebalancing | `297334d1-3311-40b9-8895-0174e0f831d9` | Completed; matched the wallet NFT position and returned `keep_range`. |

These direct URLs are the upstream targets to register as ordinary xAPI API
services. xAPI must inject `X-XAPI-Upstream-Token` as a private upstream header;
consumers must never receive the invocation secret.
