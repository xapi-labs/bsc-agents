# yield-optimizer-pi-v8

Candidate metadata and live request copied byte-for-byte from
[xapi-backend 5556ba3](https://github.com/xapi-labs/xapi-backend/tree/5556ba324373a7b0f199f74a821dd7b7cb5b75f8/agents/agent-studio/releases/yield-optimizer-pi-v8).

- Runtime: `agent-studio-worker-v8`
- Input profile: `bnb-yield-optimisation-v3`
- Native Studio authoring workspace: `YieldOptimizerAgent` (retained separately)
- State: candidate; no release registration, deployment or Marketplace activation

Read the [pinned implementation and validation notes](https://github.com/xapi-labs/xapi-backend/blob/5556ba324373a7b0f199f74a821dd7b7cb5b75f8/agents/agent-studio/releases/yield-optimizer-pi-v8/README.md).
The backend owns the deterministic analysis, schemas, tool adapters and Worker
publisher. These files cannot enable the new behavior on an older backend by
changing only a prompt.

For a real read-only invocation, run from a backend checkout containing the pinned
commit after setting `AGENT_STUDIO_MODEL_API_KEY` and `XAPI_WEB3_API_KEY` securely
in the process environment:

```bash
export BSC_AGENTS_ROOT=/absolute/path/to/bsc-agents
pnpm exec ts-node -r tsconfig-paths/register scripts/test-agent-studio-real-model.ts \
  --manifest "$BSC_AGENTS_ROOT/releases/yield-optimizer-pi-v8/xapi-worker.manifest.json" \
  --request "$BSC_AGENTS_ROOT/releases/yield-optimizer-pi-v8/live-test.request.json" \
  --release-key yield-optimizer-pi-v8 --repeat 3 --apply
```

Omit `--apply` to inspect the invocation plan without upstream calls. With
`--apply`, every repetition reads current external data and can consume API
credits; it is not a replay of captured evidence. Fresh results need not match
historical balances, yields or prices. No transaction is submitted.

The catalog's `artifactSha256` values hash the raw committed files. They are not
Studio source-bundle digests, normalized manifest digests or Worker bundle hashes.
See [validation and promotion notes](../../docs/v8-validation.md) before registration.
