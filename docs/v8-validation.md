# v8 candidate validation and promotion

This update synchronizes four candidate packages from
[xapi-backend 5556ba3](https://github.com/xapi-labs/xapi-backend/commit/5556ba324373a7b0f199f74a821dd7b7cb5b75f8).
Each manifest, release metadata file and live request is byte-identical to the
corresponding backend artifact. `releases/candidates.json` records raw artifact
hashes and an exact backend revision. Candidate README files are adapted to this
repository's paths.

## Changes by category

- **Health:** use protocol-reported HF with code-owned classification, buffers
  and both-sided valuation shocks. Do not infer that all supplied assets are
  collateral, require an independently calculated HF, or introduce a default
  repayment target such as HF 1.8. Produce one overview and distinct strategy
  comparisons, with funding and missing protocol evidence explicit.
- **Yield:** verify exact product details before allocating to the highest
  eligible quoted yield within the same rate basis. Honor the stable-only asset
  universe and protocol concentration limits. APR and APY remain distinct;
  absent lock-duration/history requirements do not become invented user limits.
  Unknown requirements still block eligibility when the caller explicitly sets
  them. Current quoted yield is not a durable or guaranteed future return.
- **Grid:** use base/quote reference prices and aligned seven-day candles, then
  calculate levels, budgets and inventory with Decimal. A quote-only budget
  requires a proposed WBNB bootstrap before sell intents. Neutral means
  two-sided inventory with directional exposure, not delta neutrality. External
  keeper intents do not place native orders or turn prices into LP ticks.
- **Liquidity:** use the wallet to discover an exact LP NFT without a fictional
  capital amount. USDT token0 / WBNB token1 requires inversion and swapped tick
  bounds for display. Compare keeping the actual range with conditional
  recentering; do not force equal token holdings. APR from investment detail is
  product-level rather than realized NFT yield. Missing gas/slippage and
  incremental net benefit remain unknown.

All four use model prose derived from code-verified structure. Prose validation
covers shape, numeric provenance and selected unsupported claims; it cannot
prove every qualitative statement. Fallback is explicitly labeled. None of these
candidates signs, transfers, approves, repays, deposits or places orders.

## Recorded backend acceptance

The following runs occurred on September 9–10, 2026 (Asia/Shanghai), before the
backend commit was pushed. They executed generated Worker code locally with
**real xAPI upstream data and model calls**, not mocked provider acceptance.
This repository sync does not claim to have rerun those paid live invocations.

| Candidate | Recorded live acceptance | Important scope |
|---|---|---|
| Health | Five successful model-generated analyses; about 3.8 s median | Venus wallet assessment, protocol HF, conditional evidence gaps; additional fallback cases were recorded separately |
| Yield | Three successful analyses; 9.782–10.889 s | USDT, stable-only, 60% protocol cap, highest comparable current yield |
| Grid | Three successful proposals; 5.311–6.421 s | WBNB/USDT, 3,000 USDT proposed budget, seven-day neutral inventory plan |
| Liquidity | Three main calls at 5.489 / 4.993 / 5.242 s; wallet-only call at 5.972 s; all model-generated | Actual NFT #7395916, keep-range path, no transaction |

The Liquidity snapshot reported roughly $1,366, with 998.97 USDT and 0.49581
WBNB. Ticks -66915 / -63699 translate to approximately 583.81–805.26 USDT/WBNB.
The reference price was roughly 740.84, so keeping the range was advised while
reset costs and incremental benefit were unverified. These are dated observations,
not promises about the next run or confirmed current pool slot0.

The backend validation finished with **319 tests across nine suites**, including
22 Liquidity tests. API/Worker builds, lint, generated-Worker dry runs, workerd
startup checks and independent Decimal checks of all four final Liquidity live
responses passed. Historical v6 Worker bundles remained byte-identical.

Captured regression evidence is available in the pinned backend
[fixtures directory](https://github.com/xapi-labs/xapi-backend/tree/5556ba324373a7b0f199f74a821dd7b7cb5b75f8/apps/platform-worker/src/services/fixtures).
Those fixtures feed deterministic tests; they are not substituted into live
acceptance runs. Negative tests mutate recorded evidence to exercise stale data,
identity mismatches, malformed values, multiple positions and out-of-range
scenarios. They do not claim that those states occurred in the real wallet.
Full invocation receipts and model drafts remain local test artifacts; repository
hash verification alone cannot independently establish their upstream authenticity.

## Reproduce the repository checks

From this repository:

```bash
node scripts/verify-candidates.mjs
```

This checks the four-category mapping, per-release runtime and profile identity,
metadata consistency, request presence and raw artifact hashes. It performs no
network calls or transactions. For actual schema validation, Worker rendering and
live tests, use the pinned backend and explicit manifest paths from the root
README. This repository intentionally does not duplicate the backend runtime.

## Checks performed for this repository sync

- All twelve manifest/metadata/request files matched the pinned backend bytes.
- The backend parser resolved all four expected runtime versions; every portable
  request and Marketplace success example passed its published schema.
- The backend publisher rendered all four Workers using this repository's new
  manifest paths.
- Catalog/hash verification, JavaScript syntax, local Markdown links, credential
  scan and `git diff --check` passed.
- Original Studio workspace files and legacy release mappings were unchanged.

The 319-test result and live timings above describe the already-validated backend
implementation; these metadata-only sync checks do not rerun paid provider calls.

## Promotion and rollback

1. Deploy the compatible API and platform-worker implementation in staging.
2. Use the approved Studio authoring/bundling workflow to produce a real source
   bundle containing the selected manifest. Record its actual source digest;
   the candidate metadata directory is not a substitute native Studio workspace.
3. Register a new immutable release using the candidate's **own** runtime version,
   exact manifest, Studio CLI version and actual source digest. Raw file hashes
   here are not source digests or the platform's normalized manifest digest.
4. Verify signed A2A/x402, successful/partial/unresolved/upstream-failure paths,
   model credentials and Marketplace billing/refund behavior in staging.
5. Only then change the serving binding. Keep the previous deployment/API revision
   for rollback and disable new candidate selection if it fails.

No source digest, registry entry, deployed URL, signed transaction or Marketplace
activation is fabricated by this update. Native ERC-8183/signing remains in the
original Studio code and is not made available by these managed Worker manifests.
