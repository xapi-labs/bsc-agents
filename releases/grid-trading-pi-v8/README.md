# grid-trading-pi-v8

Candidate metadata and live request copied byte-for-byte from
[xapi-backend 5556ba3](https://github.com/xapi-labs/xapi-backend/tree/5556ba324373a7b0f199f74a821dd7b7cb5b75f8/agents/agent-studio/releases/grid-trading-pi-v8).

- Runtime: `agent-studio-worker-v9`
- Input profile: `bnb-grid-trading-v3`
- Native Studio authoring workspace: `GridTradingAgent` (retained separately)
- Standalone Worker: [`workers/grid-trading-pi-v8`](../../workers/grid-trading-pi-v8)
- State: renderable candidate; publishing and xAPI registration are operator actions

The implementation and tests now live in this repository. Run the root `render`,
`verify`, `test`, `typecheck` and `wrangler:dry-run` scripts, then follow the
[standalone deployment guide](../../docs/standalone-deployment.md). A live call
reads current external data and can consume API credits; it never submits a
transaction.

The catalog's `artifactSha256` values hash the raw committed files. They are not
Studio source-bundle digests, normalized manifest digests or Worker bundle hashes.
See [validation and promotion notes](../../docs/v8-validation.md) before registration.
