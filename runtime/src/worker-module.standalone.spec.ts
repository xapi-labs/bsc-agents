import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import {
  agentStudioRuntimeForManifest,
  buildAgentStudioMarketplaceContract,
  parseAgentStudioWorkerManifest,
} from './agent-studio';
import {
  buildStandaloneAgentModule,
  type StandaloneAgentDeployment,
} from './worker-module';

describe('standalone Worker renderer', () => {
  it.each([
    ['health-factor-pi-v8', 'HealthFactorAgent'],
    ['yield-optimizer-pi-v8', 'YieldOptimizerAgent'],
    ['grid-trading-pi-v8', 'GridTradingAgent'],
    ['liquidity-rebalancing-pi-v8', 'RebalancingAgent'],
  ])(
    'renders %s with direct Web3 authentication and an origin-aware Agent Card',
    async (key) => {
    const identities = JSON.parse(
      readFileSync(join(process.cwd(), 'agents.json'), 'utf8'),
    ) as {
      agents: Array<{
        releaseKey: string;
        walletAddress: string;
        agentId: string;
      }>;
    };
    const identity = identities.agents.find(
      (candidate) => candidate.releaseKey === key,
    );
    expect(identity).toBeDefined();
    const manifest = parseAgentStudioWorkerManifest(
      JSON.parse(
        readFileSync(
          join(process.cwd(), 'releases', key, 'xapi-worker.manifest.json'),
          'utf8',
        ),
      ),
    );
    const input: StandaloneAgentDeployment = {
      deploymentId: `standalone:${key}`,
      releaseKey: key,
      publicHostname: 'placeholder.workers.dev',
      walletAddress: identity!.walletAddress,
      erc8004AgentId: identity!.agentId,
      network: 'bsc-mainnet',
      protocols: manifest.protocols,
      workerManifest: manifest,
      runtimeProfile: agentStudioRuntimeForManifest(manifest),
    };
    const source = buildStandaloneAgentModule(input, manifest);
    expect(source).toContain('"xapi-key": env.XAPI_WEB3_API_KEY');
    expect(source).toContain('const directUrl = url.origin');
    expect(source).toContain('worker_not_configured');
    expect(source).toContain('"runtime":"cloudflare-worker"');
    expect(source).toContain('agentWalletAddress');
    expect(source).toContain(input.runtimeProfile);

    const sandbox: {
      handler?: { fetch(request: Request, env: object): Promise<Response> };
    } = {};
    // The renderer bundles all Pi/runtime dependencies into one Worker module.
    // Evaluating that exact module verifies it has no hidden backend imports.
    // eslint-disable-next-line no-new-func
    new Function(
      '__name',
      'sandbox',
      source.replace('export default {', 'sandbox.handler = {'),
    )(undefined, sandbox);
    const cardResponse = await sandbox.handler!.fetch(
      new Request('https://deployed.example/.well-known/agent-card.json'),
      {},
    );
    const card = (await cardResponse.json()) as {
      url: string;
      xapi: {
        directUrl: string;
        erc8004: { agentId: string; agentWalletAddress: string };
      };
    };
    expect(cardResponse.status).toBe(200);
    expect(card.url).toBe('https://deployed.example');
    expect(card.xapi.directUrl).toBe('https://deployed.example');
    expect(card.xapi.erc8004).toMatchObject({
      agentId: identity!.agentId,
      agentWalletAddress: identity!.walletAddress,
    });

    const contract = buildAgentStudioMarketplaceContract(manifest);
    expect(contract).not.toBeNull();
    const ajv = new Ajv({ strict: false, validateFormats: false });
    expect(
      ajv.validate(contract!.bodySchema.schema, contract!.bodySchema.example),
    ).toBe(true);
    const success = contract!.responses.find(
      (response) => response.status_code === 200,
    );
    expect(success).toBeDefined();
    expect(ajv.validate(contract!.responseSchema, success!.body)).toBe(true);
    },
  );
});
