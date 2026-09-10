import {
  digestAgentStudioWorkerManifest,
  parseAgentStudioWorkerManifest,
} from './worker-manifest';

describe('Agent Studio Worker manifest', () => {
  const manifest = {
    schemaVersion: 1,
    slug: 'grid-trading',
    displayName: 'Grid Trading Agent',
    description: 'Produces an unsigned grid plan.',
    tags: ['defi', 'grid'],
    systemPrompt: 'Return one JSON object.',
    protocols: ['x402', 'a2a'],
    model: { name: 'gpt-5-mini', temperature: 0.2, maxOutputTokens: 4096 },
  };

  it('normalizes protocol order and computes a stable content digest', () => {
    expect(parseAgentStudioWorkerManifest(manifest)).toEqual({
      ...manifest,
      protocols: ['a2a', 'x402'],
    });
    expect(digestAgentStudioWorkerManifest(manifest)).toMatch(
      /^sha256:[a-f0-9]{64}$/,
    );
    expect(
      digestAgentStudioWorkerManifest({
        ...manifest,
        protocols: ['a2a', 'x402'],
      }),
    ).toBe(digestAgentStudioWorkerManifest(manifest));
  });

  it('resolves manifest v2 tool ids to the platform-owned tool catalog', () => {
    const parsed = parseAgentStudioWorkerManifest({
      ...manifest,
      schemaVersion: 2,
      tools: ['getTokenPrice', 'getGasPrice'],
    });

    expect(parsed).toEqual(
      expect.objectContaining({
        schemaVersion: 2,
        tools: [
          expect.objectContaining({
            id: 'getTokenPrice',
            name: 'binance_get_token_price',
            method: 'POST',
            path: '/api/v1/dex/market/price',
          }),
          expect.objectContaining({
            id: 'getGasPrice',
            name: 'binance_get_gas_price',
            method: 'GET',
            path: '/api/v1/dex/pre-transaction/gas-price',
          }),
        ],
      }),
    );
    expect(parseAgentStudioWorkerManifest(parsed)).toEqual(parsed);
    expect(digestAgentStudioWorkerManifest(parsed)).toBe(
      digestAgentStudioWorkerManifest({
        ...manifest,
        schemaVersion: 2,
        tools: ['getTokenPrice', 'getGasPrice'],
      }),
    );
  });

  it('pins Pi into the digest without changing legacy manifest digests', () => {
    const pinned = { ...manifest, engine: 'pi-agent-core@0.85.1' };
    expect(parseAgentStudioWorkerManifest(pinned).engine).toBe(pinned.engine);
    expect(digestAgentStudioWorkerManifest(pinned)).not.toBe(
      digestAgentStudioWorkerManifest(manifest),
    );
    expect(parseAgentStudioWorkerManifest(manifest)).not.toHaveProperty(
      'engine',
    );
    expect(() =>
      parseAgentStudioWorkerManifest({
        ...manifest,
        engine: 'pi-agent-core@future',
      }),
    ).toThrow('engine');
  });

  it('rejects unknown and duplicate manifest v2 tools', () => {
    expect(() =>
      parseAgentStudioWorkerManifest({
        ...manifest,
        schemaVersion: 2,
        tools: ['submitTransaction'],
      }),
    ).toThrow('Worker manifest tool is unsupported: submitTransaction');
    expect(() =>
      parseAgentStudioWorkerManifest({
        ...manifest,
        schemaVersion: 2,
        tools: ['getTokenPrice', 'getTokenPrice'],
      }),
    ).toThrow('Worker manifest tools must be unique and non-empty');
  });

  it('resolves a versioned input profile and enforces its hydration tools', () => {
    const raw = {
      ...manifest,
      schemaVersion: 2,
      tools: ['getAllTokenBalancesByAddress'],
      inputProfile: 'bnb-grid-trading-v1',
    };
    const parsed = parseAgentStudioWorkerManifest(raw);

    expect(parsed).toEqual(
      expect.objectContaining({
        inputProfile: expect.objectContaining({
          id: 'bnb-grid-trading-v1',
          defaultChainId: '56',
          autoHydrationTools: ['getAllTokenBalancesByAddress'],
          inputSchema: expect.objectContaining({ type: 'object' }),
        }),
      }),
    );
    expect(parseAgentStudioWorkerManifest(parsed)).toEqual(parsed);
    expect(digestAgentStudioWorkerManifest(parsed)).toBe(
      digestAgentStudioWorkerManifest(raw),
    );

    expect(() =>
      parseAgentStudioWorkerManifest({
        ...raw,
        tools: ['getGasPrice'],
      }),
    ).toThrow(
      'Worker manifest inputProfile requires missing tool: getAllTokenBalancesByAddress',
    );
    expect(() =>
      parseAgentStudioWorkerManifest({
        ...raw,
        inputProfile: 'unknown-profile',
      }),
    ).toThrow('Worker manifest inputProfile is unsupported: unknown-profile');
  });

  it('keeps the v1 input-profile digest stable beside v2 profiles', () => {
    const legacy = {
      ...manifest,
      schemaVersion: 2,
      engine: 'pi-agent-core@0.85.1',
      tools: ['getAllTokenBalancesByAddress'],
      inputProfile: 'bnb-grid-trading-v1',
    };
    const current = { ...legacy, inputProfile: 'bnb-grid-trading-v2' };

    expect(digestAgentStudioWorkerManifest(legacy)).toBe(
      'sha256:3210eed4bef3386351f172a7db00481e12416325d69130958ccb3abfbe963208',
    );
    expect(digestAgentStudioWorkerManifest(current)).not.toBe(
      digestAgentStudioWorkerManifest(legacy),
    );
  });

  it('keeps manifest v1 free of tool configuration', () => {
    expect(
      parseAgentStudioWorkerManifest({ ...manifest, tools: ['getTokenPrice'] }),
    ).not.toHaveProperty('tools');
  });

  it('rejects protocols that the Worker runtime does not implement', () => {
    expect(() =>
      parseAgentStudioWorkerManifest({
        ...manifest,
        protocols: ['x402', 'erc8183'],
      }),
    ).toThrow('unsupported: erc8183');
  });
});
