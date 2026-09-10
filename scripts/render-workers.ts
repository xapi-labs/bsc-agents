import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  agentStudioRuntimeForManifest,
  digestAgentStudioWorkerManifest,
  parseAgentStudioWorkerManifest,
} from '../runtime/src/agent-studio';
import {
  buildStandaloneAgentModule,
  type StandaloneAgentDeployment,
} from '../runtime/src/worker-module';

type Candidate = {
  key: string;
  workspace: string;
  runtimeProfile: string;
  manifest: string;
  metadata: string;
};

type Identity = {
  releaseKey: string;
  workspace: string;
  workerName: string;
  workerUrl: string;
  agentId: string;
  walletAddress: string;
};

const root = resolve(__dirname, '..');
const check = process.argv.includes('--check');
const catalog = JSON.parse(
  readFileSync(join(root, 'releases/candidates.json'), 'utf8'),
) as { compatibilityDate: string; workerEntrypoint: string; releases: Candidate[] };
const identityCatalog = JSON.parse(
  readFileSync(join(root, 'agents.json'), 'utf8'),
) as {
  cloudflareAccountId: string;
  network: string;
  chainId: string;
  registryAddress: string;
  agents: Identity[];
};

if (
  !/^[a-f0-9]{32}$/i.test(identityCatalog.cloudflareAccountId) ||
  identityCatalog.network !== 'bsc-mainnet' ||
  identityCatalog.chainId !== '56' ||
  identityCatalog.registryAddress.toLowerCase() !==
    '0x8004a169fb4a3325136eb29fa0ceb6d2e539a432'
) {
  throw new Error('agents.json must use the canonical BSC mainnet ERC-8004 registry');
}

const identities = new Map(
  identityCatalog.agents.map((identity) => [identity.releaseKey, identity]),
);
if (identities.size !== catalog.releases.length) {
  throw new Error('agents.json must contain exactly one identity per candidate');
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function emit(path: string, content: string) {
  if (check) {
    const current = readFileSync(path, 'utf8');
    if (current !== content) throw new Error(`${path} is stale; run pnpm render`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

for (const candidate of catalog.releases) {
  const identity = identities.get(candidate.key);
  if (!identity || identity.workspace !== candidate.workspace) {
    throw new Error(`Missing or mismatched ERC-8004 identity for ${candidate.key}`);
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(identity.walletAddress)) {
    throw new Error(`Invalid wallet address for ${candidate.key}`);
  }
  if (!/^\d+$/.test(identity.agentId)) {
    throw new Error(`Invalid ERC-8004 agent id for ${candidate.key}`);
  }
  const workerUrl = new URL(identity.workerUrl);
  if (
    workerUrl.protocol !== 'https:' ||
    workerUrl.pathname !== '/' ||
    workerUrl.search ||
    workerUrl.hash ||
    workerUrl.hostname !== `${identity.workerName}.0xaa.workers.dev`
  ) {
    throw new Error(`Invalid 0xAA workers.dev URL for ${candidate.key}`);
  }

  const manifest = parseAgentStudioWorkerManifest(
    JSON.parse(readFileSync(join(root, candidate.manifest), 'utf8')),
  );
  if (agentStudioRuntimeForManifest(manifest) !== candidate.runtimeProfile) {
    throw new Error(`Runtime profile mismatch for ${candidate.key}`);
  }
  const bundleDigest = digestAgentStudioWorkerManifest(manifest);
  const deployment: StandaloneAgentDeployment = {
    deploymentId: `standalone:${candidate.key}`,
    releaseKey: candidate.key,
    publicHostname: workerUrl.hostname,
    marketplaceHost: null,
    walletAddress: identity.walletAddress,
    erc8004AgentId: identity.agentId,
    network: identityCatalog.network,
    protocols: manifest.protocols,
    workerManifest: manifest,
    runtimeProfile: candidate.runtimeProfile,
  };
  const source = buildStandaloneAgentModule(deployment, manifest);
  const sourceSha256 = createHash('sha256').update(source).digest('hex');
  const outputRoot = join(root, 'workers', candidate.key);
  emit(join(outputRoot, 'src', 'agent.mjs'), source);
  emit(
    join(outputRoot, 'deployment.json'),
    stableJson({
      schemaVersion: 1,
      releaseKey: candidate.key,
      workerName: identity.workerName,
      workerUrl: identity.workerUrl,
      sourceSha256,
      bundleDigest,
      runtimeProfile: deployment.runtimeProfile,
      requiredSecrets: [
        'XAPI_AGENT_INVOKE_SECRET',
        'XAPI_MODEL_API_KEY',
        'XAPI_WEB3_API_KEY',
      ],
      erc8004: {
        network: identityCatalog.network,
        chainId: identityCatalog.chainId,
        registryAddress: identityCatalog.registryAddress,
        agentId: identity.agentId,
        walletAddress: identity.walletAddress,
      },
    }),
  );
  emit(
    join(outputRoot, 'wrangler.jsonc'),
    stableJson({
      $schema: '../../node_modules/wrangler/config-schema.json',
      account_id: identityCatalog.cloudflareAccountId,
      name: identity.workerName,
      main: 'src/agent.mjs',
      compatibility_date: catalog.compatibilityDate,
      compatibility_flags: ['nodejs_compat'],
      workers_dev: true,
      preview_urls: false,
      vars: {
        XAPI_MODEL_BASE_URL: 'https://ai.xapi.to/v1',
        XAPI_WEB3_BASE_URL: 'https://binance-web3-api.p.xapi.to',
        XAPI_AGENT_DEPLOYMENT_ID: deployment.deploymentId,
        XAPI_AGENT_RELEASE_KEY: deployment.releaseKey,
        XAPI_AGENT_BUNDLE_DIGEST: bundleDigest,
        XAPI_AGENT_RUNTIME_PROFILE: deployment.runtimeProfile,
      },
      observability: {
        enabled: true,
        logs: { head_sampling_rate: 1 },
      },
    }),
  );
}

console.log(`${check ? 'verified' : 'rendered'} ${catalog.releases.length} standalone Workers`);
