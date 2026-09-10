import {
  AGENT_STUDIO_NETWORKS,
  buildAgentStudioErc8004Identity,
} from './erc8004-identity';

describe('Agent Studio ERC-8004 identity', () => {
  it('publishes the canonical BSC mainnet registry tuple', () => {
    expect(AGENT_STUDIO_NETWORKS).toContain('bsc-mainnet');
    expect(
      buildAgentStudioErc8004Identity({
        network: 'bsc-mainnet',
        walletAddress: '0x91eFa0F254239bC367DDE38F5ac9cF6F3b0AAC82',
        erc8004AgentId: '341284',
      }),
    ).toEqual({
      standard: 'ERC-8004',
      agentId: '341284',
      network: 'bsc-mainnet',
      chainId: '56',
      registryAddress: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
      agentRegistry:
        'eip155:56:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
      agentWalletAddress: '0x91eFa0F254239bC367DDE38F5ac9cF6F3b0AAC82',
    });
  });

  it('omits incomplete or unknown identities', () => {
    expect(
      buildAgentStudioErc8004Identity({
        network: 'bsc-mainnet',
        walletAddress: '0x91eFa0F254239bC367DDE38F5ac9cF6F3b0AAC82',
        erc8004AgentId: null,
      }),
    ).toBeNull();
    expect(
      buildAgentStudioErc8004Identity({
        network: 'unknown',
        walletAddress: '0x91eFa0F254239bC367DDE38F5ac9cF6F3b0AAC82',
        erc8004AgentId: '341284',
      }),
    ).toBeNull();
  });
});
