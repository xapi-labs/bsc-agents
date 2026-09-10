import {
  LIQUIDITY_ANALYSIS_PROFILE,
  LIQUIDITY_ANALYSIS_INPUT_SCHEMA,
} from './liquidity-analysis-contract';
import {
  GRID_ANALYSIS_PROFILE,
  GRID_ANALYSIS_INPUT_SCHEMA,
} from './grid-analysis-contract';
import {
  YIELD_ANALYSIS_PROFILE,
  YIELD_ANALYSIS_INPUT_SCHEMA,
} from './yield-analysis-contract';
import {
  HEALTH_ANALYSIS_INPUT_SCHEMA,
  HEALTH_ANALYSIS_PROFILE,
} from './health-analysis-contract';

export type AgentStudioHydrationToolId =
  | 'getDeFiPositions'
  | 'getAllTokenBalancesByAddress';

export interface AgentStudioWorkerInputProfile {
  id: string;
  defaultChainId: '56';
  autoHydrationTools: AgentStudioHydrationToolId[];
  inputSchema: Record<string, unknown>;
}

function decimalValue(description: string, minimum?: number) {
  const numericBounds = {
    ...(minimum === undefined ? {} : { minimum }),
    maximum: Number.MAX_SAFE_INTEGER,
  };
  const stringPattern =
    minimum !== undefined && minimum >= 0
      ? '^\\d+(?:\\.\\d+)?$'
      : '^-?\\d+(?:\\.\\d+)?$';
  return {
    description,
    oneOf: [
      { type: 'string', pattern: stringPattern, maxLength: 80 },
      { type: 'number', ...numericBounds },
    ],
  };
}

function positiveDecimalValue(description: string) {
  return {
    description,
    oneOf: [
      {
        type: 'string',
        pattern: '^(?=.*[1-9])\\d+(?:\\.\\d+)?$',
        maxLength: 80,
      },
      {
        type: 'number',
        exclusiveMinimum: 0,
        maximum: Number.MAX_SAFE_INTEGER,
      },
    ],
  };
}

function percentageValue(description: string) {
  return {
    description,
    oneOf: [
      {
        type: 'string',
        maxLength: 64,
        // Canonical decimal strings in the inclusive 0..100 range. A value at
        // the upper bound may only add zero fractional digits.
        pattern: '^0*(?:(?:\\d|[1-9]\\d)(?:\\.\\d+)?|100(?:\\.0+)?)$',
      },
      { type: 'number', minimum: 0, maximum: 100 },
    ],
  };
}

const evmAddress = (description: string) => ({
  type: 'string',
  pattern: '^0x[A-Fa-f0-9]{40}$',
  description,
});

const riskProfile = {
  type: 'string',
  enum: ['conservative', 'balanced', 'aggressive'],
  description:
    'User risk preference. The Worker expands this into deterministic agent-specific constraints before model execution.',
};

const legacyDecimalValue = {
  oneOf: [
    { type: 'string', pattern: '^-?\\d+(?:\\.\\d+)?$' },
    { type: 'number' },
  ],
};

const legacyCommonProperties = {
  chain: {
    type: 'string',
    description: 'Human-readable chain name. These profiles support BNB Chain.',
  },
  chainId: {
    type: 'string',
    enum: ['56'],
    default: '56',
    description: 'Binance Web3 chain identifier. Defaults to BSC mainnet (56).',
  },
  walletAddress: {
    type: 'string',
    pattern: '^0x[A-Fa-f0-9]{40}$',
    description: 'Public EVM wallet address used for read-only hydration.',
  },
  account: {
    type: 'string',
    pattern: '^0x[A-Fa-f0-9]{40}$',
    deprecated: true,
    description: 'Backward-compatible alias for walletAddress.',
  },
  positionSelector: {
    type: 'object',
    additionalProperties: false,
    properties: {
      protocol: { type: 'string' },
      poolAddress: { type: 'string' },
      positionId: { type: 'string' },
      nftId: { type: 'string' },
      investmentId: { type: 'string' },
    },
    description:
      'Optional exact selector when a wallet contains multiple candidate positions.',
  },
  objective: { type: 'string' },
  constraints: { type: 'object', additionalProperties: true },
};

const commonProperties = {
  chain: {
    type: 'string',
    minLength: 1,
    maxLength: 64,
    description: 'Human-readable chain name. These profiles support BNB Chain.',
  },
  chainId: {
    type: 'string',
    enum: ['56'],
    default: '56',
    description: 'Binance Web3 chain identifier. Defaults to BSC mainnet (56).',
  },
  walletAddress: {
    ...evmAddress('Public EVM wallet address used for read-only hydration.'),
  },
  account: {
    type: 'string',
    pattern: '^0x[A-Fa-f0-9]{40}$',
    deprecated: true,
    description: 'Backward-compatible alias for walletAddress.',
  },
  positionSelector: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      protocol: { type: 'string', minLength: 1, maxLength: 128 },
      poolAddress: evmAddress('Exact BNB Chain pool contract address.'),
      positionId: { type: 'string', minLength: 1, maxLength: 256 },
      nftId: { type: 'string', minLength: 1, maxLength: 256 },
      investmentId: { type: 'string', minLength: 1, maxLength: 256 },
    },
    description:
      'Optional exact selector when a wallet contains multiple candidate positions.',
  },
  objective: {
    type: 'string',
    minLength: 1,
    maxLength: 2_000,
    description: 'User strategy objective. No transaction is executed.',
  },
  constraints: {
    type: 'object',
    additionalProperties: true,
    description: 'Agent-specific risk and allocation limits.',
  },
};

function profile(
  id: string,
  autoHydrationTools: AgentStudioHydrationToolId[],
  properties: Record<string, unknown>,
  required: string[] = [],
): AgentStudioWorkerInputProfile {
  return {
    id,
    defaultChainId: '56',
    autoHydrationTools,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      ...(required.length > 0 ? { required } : {}),
      properties: { ...commonProperties, ...properties },
    },
  };
}

function legacyProfile(
  id: string,
  autoHydrationTools: AgentStudioHydrationToolId[],
  properties: Record<string, unknown>,
): AgentStudioWorkerInputProfile {
  return {
    id,
    defaultChainId: '56',
    autoHydrationTools,
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties: { ...legacyCommonProperties, ...properties },
    },
  };
}

export const AGENT_STUDIO_WORKER_INPUT_PROFILES = [
  legacyProfile('bnb-liquidity-rebalancing-v1', ['getDeFiPositions'], {
    protocol: { type: 'string' },
    pool: { type: 'string' },
    current_price: legacyDecimalValue,
    current_range: {
      type: 'object',
      additionalProperties: false,
      properties: {
        lower: legacyDecimalValue,
        upper: legacyDecimalValue,
      },
    },
    liquidity_value_usd: legacyDecimalValue,
    token0_share_pct: legacyDecimalValue,
    token1_share_pct: legacyDecimalValue,
    target_width_bps: { type: 'integer', minimum: 1 },
    fee_tier: { oneOf: [{ type: 'integer' }, { type: 'string' }] },
    market_snapshot: { type: 'object', additionalProperties: true },
  }),
  legacyProfile('bnb-grid-trading-v1', ['getAllTokenBalancesByAddress'], {
    venue: { type: 'string' },
    pair: { type: 'string' },
    baseTokenAddress: { type: 'string' },
    quoteTokenAddress: { type: 'string' },
    current_price: legacyDecimalValue,
    lower_price: legacyDecimalValue,
    upper_price: legacyDecimalValue,
    grid_count: { type: 'integer', minimum: 2, maximum: 200 },
    grid_mode: { type: 'string', enum: ['arithmetic', 'geometric'] },
    capital_quote: legacyDecimalValue,
    base_inventory: legacyDecimalValue,
    fee_bps: legacyDecimalValue,
    slippage_bps: legacyDecimalValue,
    stop_loss: legacyDecimalValue,
    take_profit: legacyDecimalValue,
  }),
  legacyProfile(
    'bnb-yield-optimisation-v1',
    ['getDeFiPositions', 'getAllTokenBalancesByAddress'],
    {
      asset: { type: 'string' },
      assetTokenAddress: { type: 'string' },
      amount: legacyDecimalValue,
      current_position: { type: 'object', additionalProperties: true },
      opportunities: { type: 'array', items: { type: 'object' } },
    },
  ),
  legacyProfile(
    'bnb-health-factor-v1',
    ['getDeFiPositions', 'getAllTokenBalancesByAddress'],
    {
      protocol: { type: 'string' },
      collateral: { type: 'array', items: { type: 'object' } },
      debt: { type: 'array', items: { type: 'object' } },
      reported_health_factor: legacyDecimalValue,
      target_health_factor: legacyDecimalValue,
      available_repay_assets: { type: 'array', items: { type: 'object' } },
      available_collateral: { type: 'array', items: { type: 'object' } },
      oracle_snapshot_at: {
        oneOf: [{ type: 'string' }, { type: 'integer' }],
      },
    },
  ),
  profile(
    'bnb-liquidity-rebalancing-v2',
    ['getDeFiPositions'],
    {
      protocol: {
        type: 'string',
        minLength: 1,
        maxLength: 128,
        description: 'Liquidity protocol name.',
      },
      pool: {
        type: 'string',
        minLength: 1,
        maxLength: 200,
        description: 'Pool address or unambiguous pool and fee-tier label.',
      },
      capital_amount: decimalValue(
        'Capital available for the proposed liquidity position or rebalance.',
        0,
      ),
      capital_asset: {
        type: 'string',
        minLength: 1,
        maxLength: 32,
        description: 'Asset denomination for capital_amount, for example USDT.',
      },
      risk_profile: riskProfile,
      current_price: decimalValue('Current token0 price in token1 units.', 0),
      current_range: {
        type: 'object',
        additionalProperties: false,
        required: ['lower', 'upper'],
        properties: {
          lower: decimalValue('Current lower price bound.', 0),
          upper: decimalValue('Current upper price bound.', 0),
        },
        description: 'Current concentrated-liquidity price range.',
      },
      liquidity_value_usd: positiveDecimalValue(
        'Strictly positive current position value in USD.',
      ),
      token0_share_pct: percentageValue('Token0 share of position value.'),
      token1_share_pct: percentageValue('Token1 share of position value.'),
      target_width_bps: {
        type: 'integer',
        minimum: 1,
        maximum: 100_000,
        description: 'Requested full price-range width in basis points.',
      },
      fee_tier: {
        description:
          'Pool fee tier as integer basis points (for example 25) or an explicit label such as 0.25% or 25 bps.',
        oneOf: [
          { type: 'integer', minimum: 1, maximum: 10_000 },
          { type: 'string', minLength: 1, maxLength: 32 },
        ],
      },
      constraints: {
        type: 'object',
        additionalProperties: false,
        properties: {
          max_slippage_bps: {
            type: 'number',
            minimum: 0,
            maximum: 10_000,
          },
          max_gas_usd: {
            type: 'number',
            minimum: 0,
            maximum: Number.MAX_SAFE_INTEGER,
          },
          preserve_unclaimed_fees: { type: 'boolean' },
        },
        description:
          'Rebalance execution limits used to build the unsigned plan.',
      },
      market_snapshot: {
        type: 'object',
        additionalProperties: false,
        properties: {
          token0: { type: 'string', minLength: 1, maxLength: 64 },
          token1: { type: 'string', minLength: 1, maxLength: 64 },
          token0_address: evmAddress('Token0 contract address.'),
          token1_address: evmAddress('Token1 contract address.'),
          snapshot_at: { type: 'string', format: 'date-time' },
        },
        description: 'Optional caller-supplied market evidence.',
      },
    },
    ['pool', 'capital_amount', 'capital_asset', 'objective'],
  ),
  profile(
    'bnb-grid-trading-v2',
    ['getAllTokenBalancesByAddress'],
    {
      venue: {
        type: 'string',
        minLength: 1,
        maxLength: 128,
        description: 'DEX or execution venue.',
      },
      pair: {
        type: 'string',
        minLength: 1,
        maxLength: 100,
        description:
          'Base/quote pair label using /, -, _, or : as the separator. The quote symbol must equal capital_asset.',
      },
      capital_asset: {
        type: 'string',
        minLength: 1,
        maxLength: 32,
        description: 'Quote asset used to denominate capital_quote.',
      },
      risk_profile: riskProfile,
      baseTokenAddress: evmAddress('Optional base-token contract address.'),
      quoteTokenAddress: evmAddress('Optional quote-token contract address.'),
      current_price: decimalValue(
        'Current base-token price in quote units.',
        0,
      ),
      market_snapshot_at: {
        type: 'string',
        format: 'date-time',
        description:
          'Optional observation time for caller-supplied current_price and bounds.',
      },
      lower_price: decimalValue('Inclusive lower grid bound.', 0),
      upper_price: decimalValue('Inclusive upper grid bound.', 0),
      grid_count: {
        type: 'integer',
        minimum: 2,
        maximum: 200,
        description: 'Number of grid price levels.',
      },
      grid_mode: {
        type: 'string',
        enum: ['arithmetic', 'geometric'],
        description: 'Equal price spacing or equal percentage spacing.',
      },
      capital_quote: decimalValue('Quote-asset capital budget.', 0),
      base_inventory: decimalValue(
        'Base-asset inventory available to sell.',
        0,
      ),
      fee_bps: decimalValue('Expected venue fee in basis points.', 0),
      slippage_bps: decimalValue(
        'Maximum assumed slippage in basis points.',
        0,
      ),
      stop_loss: decimalValue('Optional stop-loss price.', 0),
      take_profit: decimalValue('Optional take-profit price.', 0),
      constraints: {
        type: 'object',
        additionalProperties: false,
        properties: {
          max_quote_per_order: decimalValue(
            'Maximum quote value per order.',
            0,
          ),
          reserve_quote_pct: { type: 'number', minimum: 0, maximum: 100 },
        },
        description: 'Grid capital and per-order limits.',
      },
    },
    ['pair', 'capital_asset', 'capital_quote', 'risk_profile', 'objective'],
  ),
  profile(
    'bnb-yield-optimisation-v2',
    ['getDeFiPositions', 'getAllTokenBalancesByAddress'],
    {
      asset: {
        type: 'string',
        minLength: 1,
        maxLength: 32,
        description: 'Asset to allocate.',
      },
      assetTokenAddress: evmAddress('Optional asset contract address.'),
      amount: decimalValue('Total asset amount to allocate.', 0),
      risk_profile: riskProfile,
      asset_universe: {
        type: 'string',
        enum: ['stable_only', 'bluechip_allowed', 'any_supported_asset'],
        description:
          'Whether the allocation must remain in stablecoins or may swap into other supported assets.',
      },
      existing_yield_assets: {
        type: 'string',
        maxLength: 2_000,
        description:
          'Optional user description of existing yield-bearing positions when no wallet hydration is requested.',
      },
      current_position: {
        type: 'object',
        additionalProperties: false,
        properties: {
          protocol: { type: 'string', minLength: 1, maxLength: 128 },
          market: { type: 'string', minLength: 1, maxLength: 200 },
          amount: decimalValue('Current position amount.', 0),
          apr_pct: {
            type: 'number',
            minimum: -Number.MAX_SAFE_INTEGER,
            maximum: Number.MAX_SAFE_INTEGER,
          },
        },
        description:
          'Optional current allocation used for switching-cost analysis.',
      },
      opportunities: {
        type: 'array',
        minItems: 1,
        maxItems: 100,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'protocol',
            'market',
            'principal_asset',
            'principal_asset_class',
            'investable',
            'apr_pct',
            'tvl_usd',
            'risk_score_0_100',
            'lock_days',
          ],
          properties: {
            protocol: { type: 'string', minLength: 1, maxLength: 128 },
            market: { type: 'string', minLength: 1, maxLength: 200 },
            principal_asset: {
              type: 'string',
              minLength: 1,
              maxLength: 128,
              description:
                'Asset or asset pair accepted as principal by this opportunity.',
            },
            principal_asset_class: {
              type: 'string',
              enum: ['stable', 'bluechip', 'other'],
              description:
                'Caller-supplied classification used to enforce asset_universe.',
            },
            investable: {
              type: 'boolean',
              description:
                'Whether the caller snapshot confirms that new deposits are currently supported.',
            },
            investment_id: {
              type: 'string',
              minLength: 1,
              maxLength: 256,
              description:
                'Optional exact provider investment identifier for this caller snapshot.',
            },
            apr_pct: {
              type: 'number',
              minimum: -Number.MAX_SAFE_INTEGER,
              maximum: Number.MAX_SAFE_INTEGER,
            },
            tvl_usd: {
              type: 'number',
              minimum: 0,
              maximum: Number.MAX_SAFE_INTEGER,
            },
            liquidity_usd: {
              type: 'number',
              minimum: 0,
              maximum: Number.MAX_SAFE_INTEGER,
            },
            risk_score_0_100: { type: 'number', minimum: 0, maximum: 100 },
            lock_days: {
              type: 'number',
              minimum: 0,
              maximum: Number.MAX_SAFE_INTEGER,
            },
            reward_tokens: {
              type: 'array',
              maxItems: 32,
              items: { type: 'string', minLength: 1, maxLength: 64 },
            },
            snapshot_at: { type: 'string', format: 'date-time' },
          },
        },
        description: 'Caller-supplied opportunity snapshots to rank.',
      },
      constraints: {
        type: 'object',
        additionalProperties: false,
        properties: {
          max_protocol_share_pct: { type: 'number', minimum: 0, maximum: 100 },
          max_risk_score: { type: 'number', minimum: 0, maximum: 100 },
          max_lock_days: {
            type: 'number',
            minimum: 0,
            maximum: Number.MAX_SAFE_INTEGER,
          },
          min_tvl_usd: {
            type: 'number',
            minimum: 0,
            maximum: Number.MAX_SAFE_INTEGER,
          },
          gas_budget_usd: {
            type: 'number',
            minimum: 0,
            maximum: Number.MAX_SAFE_INTEGER,
          },
        },
        description: 'Eligibility and concentration limits.',
      },
    },
    ['asset', 'amount', 'risk_profile', 'objective'],
  ),
  profile(
    'bnb-health-factor-v2',
    ['getDeFiPositions', 'getAllTokenBalancesByAddress'],
    {
      protocol: {
        type: 'string',
        minLength: 1,
        maxLength: 128,
        description: 'Lending protocol name.',
      },
      collateral_asset: {
        type: 'string',
        minLength: 1,
        maxLength: 64,
        description:
          'Optional collateral-asset filter used when the wallet has multiple lending positions.',
      },
      collateral: {
        type: 'array',
        minItems: 1,
        maxItems: 50,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'asset',
            'amount',
            'price_usd',
            'liquidation_threshold_pct',
          ],
          properties: {
            asset: { type: 'string', minLength: 1, maxLength: 64 },
            amount: decimalValue('Collateral token amount.', 0),
            price_usd: decimalValue('Oracle price in USD.', 0),
            liquidation_threshold_pct: percentageValue(
              'Protocol liquidation threshold percentage.',
            ),
          },
        },
        description: 'Collateral snapshot used for independent HF calculation.',
      },
      debt: {
        type: 'array',
        minItems: 1,
        maxItems: 50,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['asset', 'amount', 'price_usd'],
          properties: {
            asset: { type: 'string', minLength: 1, maxLength: 64 },
            amount: decimalValue('Debt token amount.', 0),
            price_usd: decimalValue('Oracle price in USD.', 0),
          },
        },
        description: 'Debt snapshot used for independent HF calculation.',
      },
      reported_health_factor: decimalValue(
        'Health factor reported by the protocol.',
        0,
      ),
      target_health_factor: decimalValue(
        'Desired post-mitigation health factor.',
        0,
      ),
      available_repay_assets: {
        type: 'array',
        maxItems: 50,
        items: balanceItemSchema('repayment'),
        description: 'Assets available for an unsigned repayment option.',
      },
      available_collateral: {
        type: 'array',
        maxItems: 50,
        items: balanceItemSchema('additional collateral', true),
        description: 'Assets available for an unsigned supply option.',
      },
      oracle_snapshot_at: {
        oneOf: [{ type: 'string', format: 'date-time' }, { type: 'integer' }],
        description:
          'ISO timestamp or Unix timestamp for the supplied oracle prices.',
      },
      constraints: {
        type: 'object',
        additionalProperties: false,
        properties: {
          max_repay_usd: {
            type: 'number',
            minimum: 0,
            maximum: Number.MAX_SAFE_INTEGER,
          },
          max_additional_collateral_usd: {
            type: 'number',
            minimum: 0,
            maximum: Number.MAX_SAFE_INTEGER,
          },
        },
        description: 'Limits for the unsigned mitigation options.',
      },
    },
    ['walletAddress', 'objective'],
  ),
] as const satisfies readonly AgentStudioWorkerInputProfile[];

function balanceItemSchema(
  purpose: string,
  includeLiquidationThreshold = false,
) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['asset', 'amount'],
    properties: {
      asset: { type: 'string', minLength: 1, maxLength: 64 },
      amount: decimalValue(`Token amount available for ${purpose}.`, 0),
      price_usd: decimalValue('Optional oracle price in USD.', 0),
      ...(includeLiquidationThreshold
        ? {
            liquidation_threshold_pct: percentageValue(
              'Protocol liquidation threshold for this additional collateral asset.',
            ),
          }
        : {}),
    },
  };
}

const profilesById = new Map(
  AGENT_STUDIO_WORKER_INPUT_PROFILES.map((inputProfile) => [
    inputProfile.id,
    inputProfile,
  ]),
);
profilesById.set(HEALTH_ANALYSIS_PROFILE, {
  id: HEALTH_ANALYSIS_PROFILE,
  defaultChainId: '56',
  autoHydrationTools: ['getDeFiPositions'],
  inputSchema: HEALTH_ANALYSIS_INPUT_SCHEMA,
});

profilesById.set(YIELD_ANALYSIS_PROFILE, {
  id: YIELD_ANALYSIS_PROFILE,
  defaultChainId: '56',
  autoHydrationTools: [],
  inputSchema: YIELD_ANALYSIS_INPUT_SCHEMA,
});

profilesById.set(GRID_ANALYSIS_PROFILE, {
  id: GRID_ANALYSIS_PROFILE,
  defaultChainId: '56',
  autoHydrationTools: [],
  inputSchema: GRID_ANALYSIS_INPUT_SCHEMA,
});

profilesById.set(LIQUIDITY_ANALYSIS_PROFILE, {
  id: LIQUIDITY_ANALYSIS_PROFILE,
  defaultChainId: '56',
  autoHydrationTools: [],
  inputSchema: LIQUIDITY_ANALYSIS_INPUT_SCHEMA,
});

export function resolveAgentStudioWorkerInputProfile(
  id: string,
): AgentStudioWorkerInputProfile | null {
  const inputProfile = profilesById.get(id);
  return inputProfile ? structuredClone(inputProfile) : null;
}
