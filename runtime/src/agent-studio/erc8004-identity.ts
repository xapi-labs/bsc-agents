export const AGENT_STUDIO_NETWORKS = ['bsc-testnet', 'bsc-mainnet'] as const;

export type AgentStudioNetwork = (typeof AGENT_STUDIO_NETWORKS)[number];

const ERC8004_REGISTRIES: Record<
  AgentStudioNetwork,
  { chainId: string; registryAddress: `0x${string}` }
> = {
  'bsc-testnet': {
    chainId: '97',
    registryAddress: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
  },
  'bsc-mainnet': {
    chainId: '56',
    registryAddress: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  },
};

export interface AgentStudioErc8004Identity {
  standard: 'ERC-8004';
  agentId: string;
  network: AgentStudioNetwork;
  chainId: string;
  registryAddress: `0x${string}`;
  agentRegistry: string;
  agentWalletAddress: string;
}

export function buildAgentStudioErc8004Identity(input: {
  network: string;
  walletAddress: string;
  erc8004AgentId?: string | null;
}): AgentStudioErc8004Identity | null {
  if (!input.erc8004AgentId) return null;
  const network = input.network as AgentStudioNetwork;
  const registry = ERC8004_REGISTRIES[network];
  if (!registry) return null;
  return {
    standard: 'ERC-8004',
    agentId: input.erc8004AgentId,
    network,
    chainId: registry.chainId,
    registryAddress: registry.registryAddress,
    agentRegistry: `eip155:${registry.chainId}:${registry.registryAddress}`,
    agentWalletAddress: input.walletAddress,
  };
}
