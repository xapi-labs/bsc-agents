import {
  LIQUIDITY_ANALYSIS_PROFILE,
  LIQUIDITY_ANALYSIS_OUTPUT_SCHEMA,
  liquidityAnalysisExample,
} from './liquidity-analysis-contract';
import {
  GRID_ANALYSIS_PROFILE,
  GRID_ANALYSIS_OUTPUT_SCHEMA,
  gridAnalysisExample,
} from './grid-analysis-contract';
import {
  YIELD_ANALYSIS_PROFILE,
  YIELD_ANALYSIS_OUTPUT_SCHEMA,
  yieldAnalysisExample,
} from './yield-analysis-contract';
import type { AgentStudioWorkerManifest } from './worker-manifest';
import {
  HEALTH_ANALYSIS_PROFILE,
  HEALTH_ANALYSIS_OUTPUT_SCHEMA,
} from './health-analysis-contract';

export interface AgentStudioMarketplaceResponseExample {
  status_code: number;
  label: string;
  type: 'json' | 'text';
  body: unknown;
  description: string;
}

export interface AgentStudioMarketplaceContract {
  endpointName: string;
  endpointDescription: string;
  bodySchema: {
    description: string;
    contentType: 'application/json';
    schema: Record<string, unknown>;
    example: Record<string, unknown>;
  };
  responses: AgentStudioMarketplaceResponseExample[];
  responseSchema: Record<string, unknown>;
}

interface AgentExampleDefinition {
  profileId: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}

const stringArray = { type: 'array', items: { type: 'string' } };
const commonResultProperties = {
  assumptions: stringArray,
  risk_warnings: stringArray,
  missing_fields: stringArray,
};

const OUTPUT_SCHEMAS: Readonly<Record<string, Record<string, unknown>>> = {
  'liquidity-rebalancing': {
    type: 'object',
    additionalProperties: false,
    required: [
      'agent',
      'status',
      'plan_type',
      'rebalance_needed',
      'current_position',
      'pool_evidence',
      'market_evidence',
      'proposed_range',
      'capital_summary',
      'unsigned_action_plan',
      'assumptions',
      'risk_warnings',
      'missing_fields',
    ],
    properties: {
      agent: { const: 'liquidity-rebalancing' },
      status: {
        type: 'string',
        enum: ['ready', 'hold', 'needs_input', 'unsupported'],
      },
      plan_type: {
        type: 'string',
        enum: ['new_position', 'rebalance'],
      },
      rebalance_needed: { type: 'boolean' },
      current_position: {
        oneOf: [
          { type: 'null' },
          {
            type: 'object',
            additionalProperties: false,
            required: [
              'current_range',
              'liquidity_value_usd',
              'token0_share_pct',
              'token1_share_pct',
              'in_range',
              'distance_to_nearest_bound_bps',
            ],
            properties: {
              current_range: {
                type: 'object',
                additionalProperties: false,
                required: ['lower', 'upper'],
                properties: {
                  lower: { type: 'string' },
                  upper: { type: 'string' },
                },
              },
              liquidity_value_usd: { type: 'string' },
              token0_share_pct: { type: 'number', minimum: 0, maximum: 100 },
              token1_share_pct: { type: 'number', minimum: 0, maximum: 100 },
              in_range: { type: 'boolean' },
              distance_to_nearest_bound_bps: { type: 'number' },
            },
          },
        ],
      },
      pool_evidence: {
        oneOf: [
          { type: 'null' },
          {
            type: 'object',
            additionalProperties: false,
            required: [
              'pool_address',
              'protocol',
              'liquidity_usd',
              'token_contract_addresses',
              'fee_tier_bps',
              'fee_tier_source',
              'tick_spacing',
              'tick_spacing_source',
              'source',
              'as_of',
            ],
            properties: {
              pool_address: { type: 'string' },
              protocol: { type: 'string' },
              liquidity_usd: { type: 'string' },
              token_contract_addresses: {
                type: 'array',
                items: { type: 'string' },
              },
              fee_tier_bps: { type: 'number' },
              fee_tier_source: {
                type: 'string',
                enum: ['web3_tool', 'caller_input', 'pool_label'],
              },
              tick_spacing: {
                oneOf: [{ type: 'number' }, { type: 'null' }],
              },
              tick_spacing_source: {
                type: 'string',
                enum: ['web3_tool', 'unresolved'],
              },
              source: { type: 'string', enum: ['web3_tool', 'mixed'] },
              as_of: { type: 'string', format: 'date-time' },
            },
          },
        ],
      },
      market_evidence: {
        type: 'object',
        additionalProperties: false,
        required: ['source', 'current_price', 'as_of'],
        properties: {
          source: {
            type: 'string',
            enum: ['caller_snapshot', 'web3_tool', 'none'],
          },
          current_price: { type: 'string' },
          as_of: {
            oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }],
          },
        },
      },
      proposed_range: {
        type: 'object',
        additionalProperties: false,
        required: ['lower', 'upper', 'width_bps'],
        properties: {
          lower: { type: 'string' },
          upper: { type: 'string' },
          width_bps: { type: 'number' },
        },
      },
      capital_summary: {
        type: 'object',
        additionalProperties: false,
        required: ['deployed_amount', 'reserved_amount', 'asset'],
        properties: {
          deployed_amount: { type: 'string' },
          reserved_amount: { type: 'string' },
          asset: { type: 'string' },
        },
      },
      unsigned_action_plan: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['step', 'action', 'parameters', 'reason'],
          properties: {
            step: { type: 'integer', minimum: 1 },
            action: { type: 'string' },
            parameters: { type: 'object', additionalProperties: true },
            reason: { type: 'string' },
          },
        },
      },
      ...commonResultProperties,
    },
  },
  'grid-trading': {
    type: 'object',
    additionalProperties: false,
    required: [
      'agent',
      'status',
      'market_evidence',
      'grid',
      'orders',
      'capital_summary',
      'unsigned_action_plan',
      'assumptions',
      'risk_warnings',
      'missing_fields',
    ],
    properties: {
      agent: { const: 'grid-trading' },
      status: {
        type: 'string',
        enum: ['ready', 'hold', 'needs_input', 'unsupported'],
      },
      market_evidence: {
        type: 'object',
        additionalProperties: false,
        required: ['source', 'current_price', 'range_basis', 'as_of'],
        properties: {
          source: {
            type: 'string',
            enum: ['caller_snapshot', 'web3_tool', 'none'],
          },
          current_price: { type: 'string' },
          range_basis: {
            type: 'string',
            enum: ['caller_bounds', 'candles', 'none'],
          },
          as_of: {
            oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }],
          },
        },
      },
      grid: {
        type: 'object',
        additionalProperties: false,
        required: [
          'mode',
          'strategy',
          'execution_model',
          'lower',
          'upper',
          'levels',
        ],
        properties: {
          mode: { type: 'string', enum: ['arithmetic', 'geometric'] },
          strategy: {
            type: 'string',
            enum: ['neutral', 'buy_first', 'sell_first'],
          },
          execution_model: {
            type: 'string',
            enum: [
              'external_keeper',
              'amm_concentrated_liquidity',
              'venue_limit_order',
            ],
          },
          lower: { type: 'string' },
          upper: { type: 'string' },
          levels: stringArray,
        },
      },
      orders: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['side', 'price', 'amount_base', 'amount_quote'],
          properties: {
            side: { type: 'string', enum: ['buy', 'sell'] },
            price: { type: 'string' },
            amount_base: { type: 'string' },
            amount_quote: { type: 'string' },
          },
        },
      },
      capital_summary: {
        type: 'object',
        additionalProperties: false,
        required: [
          'allocated_quote',
          'reserved_quote',
          'estimated_round_trip_fee',
        ],
        properties: {
          allocated_quote: { type: 'string' },
          reserved_quote: { type: 'string' },
          estimated_round_trip_fee: { type: 'string' },
        },
      },
      unsigned_action_plan: stringArray,
      ...commonResultProperties,
    },
  },
  'yield-optimisation': {
    type: 'object',
    additionalProperties: false,
    required: [
      'agent',
      'status',
      'ranked_opportunities',
      'allocation',
      'unallocated_amount',
      'estimated_portfolio_apr_pct',
      'unsigned_action_plan',
      'assumptions',
      'risk_warnings',
      'missing_fields',
    ],
    properties: {
      agent: { const: 'yield-optimisation' },
      status: {
        type: 'string',
        enum: ['ready', 'hold', 'needs_input', 'unsupported'],
      },
      ranked_opportunities: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'protocol',
            'market',
            'investment_id',
            'principal_asset',
            'principal_asset_class',
            'requires_principal_swap',
            'apr_pct',
            'tvl_usd',
            'risk_score_0_100',
            'risk_adjusted_score',
            'lock_days',
            'reward_tokens',
            'evidence_source',
            'snapshot_at',
            'eligible',
            'ineligibility_reasons',
            'reason',
          ],
          properties: {
            protocol: { type: 'string' },
            market: { type: 'string' },
            investment_id: { type: 'string' },
            principal_asset: { type: 'string' },
            principal_asset_class: {
              type: 'string',
              enum: ['stable', 'bluechip', 'other'],
            },
            requires_principal_swap: { type: 'boolean' },
            apr_pct: { type: 'number' },
            tvl_usd: { type: 'number', minimum: 0 },
            risk_score_0_100: {
              type: 'number',
              minimum: 0,
              maximum: 100,
            },
            risk_adjusted_score: {
              type: 'number',
              minimum: 0,
              maximum: 100,
            },
            lock_days: { type: 'number', minimum: 0 },
            reward_tokens: stringArray,
            evidence_source: {
              type: 'string',
              enum: ['caller_snapshot', 'web3_tool', 'mixed'],
            },
            snapshot_at: {
              oneOf: [
                { type: 'string', format: 'date-time' },
                { type: 'null' },
              ],
            },
            eligible: { type: 'boolean' },
            ineligibility_reasons: stringArray,
            reason: { type: 'string' },
          },
        },
      },
      allocation: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['protocol', 'market', 'asset', 'share_pct', 'amount'],
          properties: {
            protocol: { type: 'string' },
            market: { type: 'string' },
            investment_id: { type: 'string', maxLength: 256 },
            asset: { type: 'string' },
            share_pct: { type: 'number', minimum: 0, maximum: 100 },
            amount: { type: 'string' },
          },
        },
      },
      unallocated_amount: { type: 'string' },
      estimated_portfolio_apr_pct: { type: 'number' },
      unsigned_action_plan: stringArray,
      ...commonResultProperties,
    },
  },
  'health-factor-monitoring': {
    type: 'object',
    additionalProperties: false,
    required: [
      'agent',
      'status',
      'computed',
      'evidence_quality',
      'stress_tests',
      'mitigation_options',
      'unsigned_action_plan',
      'assumptions',
      'risk_warnings',
      'missing_fields',
    ],
    properties: {
      agent: { const: 'health-factor-monitoring' },
      status: {
        type: 'string',
        enum: ['safe', 'warning', 'critical', 'needs_input', 'unsupported'],
      },
      computed: {
        type: 'object',
        additionalProperties: false,
        required: [
          'collateral_usd',
          'weighted_liquidation_value_usd',
          'debt_usd',
          'health_factor',
        ],
        properties: {
          collateral_usd: { type: 'string' },
          weighted_liquidation_value_usd: { type: 'string' },
          debt_usd: { type: 'string' },
          health_factor: { type: 'string' },
        },
      },
      evidence_quality: {
        type: 'object',
        additionalProperties: false,
        required: [
          'source',
          'health_factor_kind',
          'liquidation_thresholds',
          'as_of',
        ],
        properties: {
          source: {
            type: 'string',
            enum: ['caller_snapshot', 'web3_tool', 'mixed', 'none'],
          },
          health_factor_kind: {
            type: 'string',
            enum: [
              'protocol_reported',
              'independently_computed',
              'estimated',
              'unavailable',
            ],
          },
          liquidation_thresholds: {
            type: 'string',
            enum: [
              'protocol_verified',
              'caller_supplied',
              'estimated',
              'missing',
            ],
          },
          as_of: {
            oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }],
          },
        },
      },
      stress_tests: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'collateral_drawdown_pct',
            'projected_health_factor',
            'liquidation_risk',
          ],
          properties: {
            collateral_drawdown_pct: {
              type: 'number',
              minimum: 0,
              maximum: 100,
            },
            projected_health_factor: { type: 'string' },
            liquidation_risk: { type: 'boolean' },
          },
        },
      },
      mitigation_options: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'priority',
            'action',
            'amount',
            'amount_usd',
            'debt_asset',
            'funding_asset',
            'requires_swap',
            'feasibility',
            'expected_health_factor',
            'reason',
          ],
          properties: {
            priority: { type: 'integer', minimum: 1 },
            action: {
              type: 'string',
              enum: [
                'repay',
                'swap_then_repay',
                'add_collateral',
                'reduce_exposure',
                'hold',
              ],
            },
            amount: { type: 'string' },
            amount_usd: { type: 'string' },
            debt_asset: { type: 'string' },
            funding_asset: { type: 'string' },
            requires_swap: { type: 'boolean' },
            feasibility: {
              type: 'string',
              enum: ['verified', 'conditional', 'unavailable'],
            },
            expected_health_factor: { type: 'string' },
            reason: { type: 'string' },
          },
        },
      },
      unsigned_action_plan: stringArray,
      ...commonResultProperties,
    },
  },
};

const EXAMPLES: Readonly<Record<string, AgentExampleDefinition>> = {
  'liquidity-rebalancing': {
    profileId: 'bnb-liquidity-rebalancing-v2',
    input: {
      chain: 'BNB Smart Chain',
      chainId: '56',
      pool: 'WBNB/USDT 0.25%',
      capital_amount: '10000',
      capital_asset: 'USDT',
      risk_profile: 'balanced',
      current_price: '600',
      objective:
        'Propose a balanced concentrated-liquidity range and keep enough capital outside the position for gas and re-entry.',
      market_snapshot: {
        token0: 'WBNB',
        token1: 'USDT',
        token0_address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
        token1_address: '0x55d398326f99059fF775485246999027B3197955',
        snapshot_at: '2026-09-08T06:00:00Z',
      },
    },
    output: {
      agent: 'liquidity-rebalancing',
      status: 'ready',
      plan_type: 'new_position',
      rebalance_needed: false,
      current_position: null,
      pool_evidence: {
        pool_address: '0x1401ff943d08a7e098328c1d3a9d388923b115d2',
        protocol: 'PancakeSwap v3',
        liquidity_usd: '50000000',
        token_contract_addresses: [
          '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
          '0x55d398326f99059fF775485246999027B3197955',
        ],
        fee_tier_bps: 25,
        fee_tier_source: 'pool_label',
        tick_spacing: null,
        tick_spacing_source: 'unresolved',
        source: 'mixed',
        as_of: '2026-09-08T06:00:00Z',
      },
      market_evidence: {
        source: 'caller_snapshot',
        current_price: '600',
        as_of: '2026-09-08T06:00:00Z',
      },
      proposed_range: { lower: '560', upper: '656', width_bps: 1600 },
      capital_summary: {
        deployed_amount: '8500',
        reserved_amount: '1500',
        asset: 'USDT',
      },
      unsigned_action_plan: [
        {
          step: 1,
          action: 'review_new_position',
          parameters: {
            pool: 'WBNB/USDT 0.25%',
            capital: '10000 USDT',
            max_slippage_bps: 40,
          },
          reason:
            'No existing position was supplied, so this is a new-position plan.',
        },
      ],
      assumptions: [
        'No existing LP position was supplied.',
        'The 40 bps maximum slippage guard is the balanced platform default.',
        'Tick spacing was not returned by the read-only pool API and must be verified before converting price bounds into executable ticks.',
      ],
      risk_warnings: [
        'Tick spacing is unresolved, so executable tick rounding still requires protocol or on-chain verification.',
        'The timestamped caller price and pool snapshot must be refreshed before constructing ticks because market data can become stale.',
        'Review slippage, gas and impermanent-loss exposure.',
      ],
      missing_fields: [],
    },
  },
  'grid-trading': {
    profileId: 'bnb-grid-trading-v2',
    input: {
      chain: 'BNB Smart Chain',
      chainId: '56',
      venue: 'PancakeSwap v3',
      pair: 'WBNB/USDT',
      baseTokenAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      quoteTokenAddress: '0x55d398326f99059fF775485246999027B3197955',
      capital_asset: 'USDT',
      capital_quote: '3000',
      risk_profile: 'balanced',
      objective:
        'Build a neutral seven-day grid using live market evidence and do not place any orders.',
    },
    output: {
      agent: 'grid-trading',
      status: 'ready',
      market_evidence: {
        source: 'web3_tool',
        current_price: '600',
        range_basis: 'candles',
        as_of: '2026-09-08T06:00:00Z',
      },
      grid: {
        mode: 'arithmetic',
        strategy: 'buy_first',
        execution_model: 'external_keeper',
        lower: '540',
        upper: '660',
        levels: [
          '540',
          '553.333333',
          '566.666667',
          '580',
          '593.333333',
          '606.666667',
          '620',
          '633.333333',
          '646.666667',
          '660',
        ],
      },
      orders: [
        {
          side: 'buy',
          price: '540',
          amount_base: '0.944444',
          amount_quote: '510',
        },
        {
          side: 'buy',
          price: '553.333333',
          amount_base: '0.921687',
          amount_quote: '510',
        },
        {
          side: 'buy',
          price: '566.666667',
          amount_base: '0.900000',
          amount_quote: '510',
        },
        {
          side: 'buy',
          price: '580',
          amount_base: '0.879310',
          amount_quote: '510',
        },
        {
          side: 'buy',
          price: '593.333333',
          amount_base: '0.859551',
          amount_quote: '510',
        },
      ],
      capital_summary: {
        allocated_quote: '2550',
        reserved_quote: '450',
        estimated_round_trip_fee: '',
      },
      unsigned_action_plan: [
        'Review five conditional buy intents totaling 2550 USDT with a maximum-slippage guard of 35 bps; create sell intents only after base inventory is acquired.',
      ],
      assumptions: [
        'The 15% quote reserve and ten price levels are xAPI balanced-policy defaults.',
        'Only quote capital was supplied, so this is buy-first rather than a neutral inventory grid.',
      ],
      risk_warnings: [
        'Orders are not protected from gaps or smart-contract risk.',
        'The maximum-slippage guard is 35 bps; actual execution can still fail or receive no fill.',
        'Refresh the timestamped market and candle evidence immediately before creating orders because prices can become stale.',
      ],
      missing_fields: [],
    },
  },
  'yield-optimisation': {
    profileId: 'bnb-yield-optimisation-v2',
    input: {
      chain: 'BNB Smart Chain',
      chainId: '56',
      asset: 'USDT',
      assetTokenAddress: '0x55d398326f99059fF775485246999027B3197955',
      amount: '10000',
      risk_profile: 'balanced',
      asset_universe: 'stable_only',
      objective:
        'Find durable BNB Chain yield while retaining daily liquidity.',
      constraints: {
        max_protocol_share_pct: 60,
        max_lock_days: 7,
      },
      opportunities: [
        {
          protocol: 'Venus',
          market: 'USDT supply',
          principal_asset: 'USDT',
          principal_asset_class: 'stable',
          investable: true,
          apr_pct: 3.8,
          tvl_usd: 120000000,
          risk_score_0_100: 20,
          lock_days: 0,
          reward_tokens: [],
          snapshot_at: '2026-09-08T06:00:00Z',
        },
        {
          protocol: 'PancakeSwap',
          market: 'USDT/USDC LP',
          principal_asset: 'USDT/USDC',
          principal_asset_class: 'stable',
          investable: true,
          apr_pct: 7.2,
          tvl_usd: 25000000,
          risk_score_0_100: 35,
          lock_days: 0,
          reward_tokens: ['CAKE'],
          snapshot_at: '2026-09-08T06:00:00Z',
        },
      ],
    },
    output: {
      agent: 'yield-optimisation',
      status: 'ready',
      ranked_opportunities: [
        {
          protocol: 'PancakeSwap',
          market: 'USDT/USDC LP',
          investment_id: '',
          principal_asset: 'USDT/USDC',
          principal_asset_class: 'stable',
          requires_principal_swap: true,
          apr_pct: 7.2,
          tvl_usd: 25000000,
          risk_score_0_100: 35,
          risk_adjusted_score: 4.68,
          lock_days: 0,
          reward_tokens: ['CAKE'],
          evidence_source: 'caller_snapshot',
          snapshot_at: '2026-09-08T06:00:00Z',
          eligible: true,
          ineligibility_reasons: [],
          reason: 'Meets the supplied liquidity and risk constraints.',
        },
        {
          protocol: 'Venus',
          market: 'USDT supply',
          investment_id: '',
          principal_asset: 'USDT',
          principal_asset_class: 'stable',
          requires_principal_swap: false,
          apr_pct: 3.8,
          tvl_usd: 120000000,
          risk_score_0_100: 20,
          risk_adjusted_score: 3.04,
          lock_days: 0,
          reward_tokens: [],
          evidence_source: 'caller_snapshot',
          snapshot_at: '2026-09-08T06:00:00Z',
          eligible: true,
          ineligibility_reasons: [],
          reason: 'Meets the supplied liquidity and risk constraints.',
        },
      ],
      allocation: [
        {
          protocol: 'PancakeSwap',
          market: 'USDT/USDC LP',
          investment_id: '',
          asset: 'USDT',
          share_pct: 60,
          amount: '6000',
        },
        {
          protocol: 'Venus',
          market: 'USDT supply',
          investment_id: '',
          asset: 'USDT',
          share_pct: 40,
          amount: '4000',
        },
      ],
      unallocated_amount: '0',
      estimated_portfolio_apr_pct: 5.84,
      unsigned_action_plan: [
        'Review a USDT-to-USDC swap for the LP allocation, then review the unsigned approvals and deposits.',
      ],
      assumptions: [
        'APRs and TVL are the supplied point-in-time values.',
        'Risk-adjusted scores use APR * (100 - risk score) / 100 only as a transparent ranking heuristic.',
      ],
      risk_warnings: [
        'Yield, incentives and stablecoin pegs can change; the USDT-to-USDC conversion introduces slippage and price-impact risk.',
        'Refresh APR, TVL, reward-token and snapshot-time evidence before allocating because the supplied opportunities can become stale.',
      ],
      missing_fields: [],
    },
  },
  'health-factor-monitoring': {
    profileId: 'bnb-health-factor-v2',
    input: {
      chain: 'BNB Smart Chain',
      chainId: '56',
      walletAddress: '0x000000000000000000000000000000000000dEaD',
      protocol: 'Venus',
      collateral_asset: 'WBNB',
      collateral: [
        {
          asset: 'WBNB',
          amount: '10',
          price_usd: '600',
          liquidation_threshold_pct: '75',
        },
      ],
      debt: [{ asset: 'USDT', amount: '3000', price_usd: '1' }],
      reported_health_factor: '1.50',
      available_repay_assets: [
        { asset: 'USDT', amount: '1500', price_usd: '1' },
      ],
      available_collateral: [{ asset: 'WBNB', amount: '1', price_usd: '600' }],
      oracle_snapshot_at: '2026-09-08T06:00:00Z',
      objective:
        'Assess liquidation risk and show the smallest unsigned mitigation that raises the health factor above 1.80.',
      constraints: { max_repay_usd: 1000, max_additional_collateral_usd: 600 },
    },
    output: {
      agent: 'health-factor-monitoring',
      status: 'warning',
      computed: {
        collateral_usd: '6000',
        weighted_liquidation_value_usd: '4500',
        debt_usd: '3000',
        health_factor: '1.5',
      },
      evidence_quality: {
        source: 'caller_snapshot',
        health_factor_kind: 'independently_computed',
        liquidation_thresholds: 'caller_supplied',
        as_of: '2026-09-08T06:00:00Z',
      },
      stress_tests: [
        {
          collateral_drawdown_pct: 10,
          projected_health_factor: '1.35',
          liquidation_risk: false,
        },
        {
          collateral_drawdown_pct: 20,
          projected_health_factor: '1.2',
          liquidation_risk: false,
        },
        {
          collateral_drawdown_pct: 30,
          projected_health_factor: '1.05',
          liquidation_risk: false,
        },
      ],
      mitigation_options: [
        {
          priority: 1,
          action: 'repay',
          amount: '513.82 USDT',
          amount_usd: '513.82',
          debt_asset: 'USDT',
          funding_asset: 'USDT',
          requires_swap: false,
          feasibility: 'verified',
          expected_health_factor: '1.81',
          reason:
            'The supplied balance contains enough of the borrowed asset for a direct repayment; the amount is rounded up and remains subject to fresh oracle data.',
        },
      ],
      unsigned_action_plan: [
        'Review the highest-priority unsigned mitigation and refresh oracle prices immediately before wallet execution.',
      ],
      assumptions: [
        'Calculations use the complete caller-supplied collateral, debt, availability, constraint, and oracle snapshot fields without wallet hydration.',
        'The mitigation target includes a 0.01 health-factor safety margin above the requested target.',
      ],
      risk_warnings: [
        'Health factor uses the supplied point-in-time prices and liquidation thresholds; oracle movement can change it before execution.',
        'Verify oracle_snapshot_at freshness immediately before mitigation because stale oracle inputs can misstate liquidation risk.',
        'This output is advisory only and does not submit a repayment, collateral supply, approval, swap, or signature.',
        'oracle_snapshot_at is older than five minutes, so the result cannot be classified as safe without a fresh protocol and oracle snapshot.',
      ],
      missing_fields: [],
    },
  },
};

function fixedInputSchema(schema: Record<string, unknown>) {
  const copy = structuredClone(schema) as {
    required?: unknown;
    properties?: Record<string, unknown>;
  };
  if (Array.isArray(copy.required)) {
    copy.required = copy.required.filter((key) => key !== 'objective');
  }
  if (copy.properties) delete copy.properties.objective;
  return copy;
}

function successEnvelopeSchema(outputSchema: Record<string, unknown>) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['agent', 'output', 'invocationId'],
    properties: {
      agent: { type: 'string', description: 'Agent manifest slug.' },
      output: {
        type: 'string',
        contentMediaType: 'application/json',
        contentSchema: outputSchema,
        description:
          'The advisory result encoded as a JSON string. Parse this field once to obtain the agent result object.',
      },
      invocationId: {
        type: 'string',
        description:
          'xAPI request identifier for tracing and billing reconciliation.',
      },
    },
  };
}

export function buildAgentStudioMarketplaceContract(
  manifest: AgentStudioWorkerManifest,
): AgentStudioMarketplaceContract | null {
  if (manifest.schemaVersion !== 2 || !manifest.inputProfile) return null;
  const healthV3 =
    manifest.slug === 'health-factor-monitoring' &&
    manifest.inputProfile.id === HEALTH_ANALYSIS_PROFILE;
  const yieldV3 =
    manifest.slug === 'yield-optimisation' &&
    manifest.inputProfile.id === YIELD_ANALYSIS_PROFILE;
  const gridV3 =
    manifest.slug === 'grid-trading' &&
    manifest.inputProfile.id === GRID_ANALYSIS_PROFILE;
  const liquidityV3 =
    manifest.slug === 'liquidity-rebalancing' &&
    manifest.inputProfile.id === LIQUIDITY_ANALYSIS_PROFILE;
  const definition = liquidityV3
    ? liquidityAnalysisExample()
    : healthV3
      ? healthAnalysisExample()
      : yieldV3
        ? yieldAnalysisExample()
        : gridV3
          ? gridAnalysisExample()
          : EXAMPLES[manifest.slug];
  if (!definition || definition.profileId !== manifest.inputProfile.id) {
    return null;
  }
  const outputSchema = liquidityV3
    ? LIQUIDITY_ANALYSIS_OUTPUT_SCHEMA
    : healthV3
      ? HEALTH_ANALYSIS_OUTPUT_SCHEMA
      : yieldV3
        ? YIELD_ANALYSIS_OUTPUT_SCHEMA
        : gridV3
          ? GRID_ANALYSIS_OUTPUT_SCHEMA
          : OUTPUT_SCHEMAS[manifest.slug];
  if (!outputSchema) return null;
  const { objective, ...input } = definition.input;
  if (typeof objective !== 'string' || !objective.trim()) return null;
  const requestExample = { input, prompt: objective };
  const successExample = {
    agent: manifest.slug,
    output: JSON.stringify(definition.output),
    invocationId: '018f7f9a-4d2b-7c31-9a5e-2f8a0b6c4d10',
  };
  return structuredClone({
    endpointName: `Invoke ${manifest.displayName}`,
    endpointDescription:
      `${manifest.description} This endpoint is stateless and advisory: it returns an unsigned plan and never executes a transaction. ` +
      'Send fixed parameters in input and the user objective in prompt. Wallet-based hydration may still require strategy constraints or an exact position selector.',
    bodySchema: {
      description:
        'Place agent-specific fixed parameters in input and the natural-language objective in prompt.',
      contentType: 'application/json' as const,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['input', 'prompt'],
        properties: {
          input: fixedInputSchema(manifest.inputProfile.inputSchema),
          prompt: {
            type: 'string',
            minLength: 1,
            maxLength: 2_000,
            description:
              'The goal and preferences for this isolated Agent run.',
          },
        },
      },
      example: requestExample,
    },
    responses: [
      ...(healthV3
        ? [
            {
              status_code: 200,
              label: 'completed_analysis',
              type: 'json' as const,
              body: {
                ...successExample,
                output: JSON.stringify({
                  ...definition.output,
                  execution_status: 'completed',
                  debt_status: 'has_debt',
                  position: {
                    wallet_address: definition.input.walletAddress,
                    chain_id: '56',
                    protocol: 'Venus',
                    pool_address: null,
                    collection_id: 'illustrative-collection',
                    supply_assets: [
                      {
                        address: null,
                        symbol: 'BNB',
                        amount: '1',
                        value_usd: '100',
                      },
                    ],
                    borrow_assets: [
                      {
                        address: null,
                        symbol: 'BTCB',
                        amount: '0.001',
                        value_usd: '50',
                      },
                    ],
                  },
                  computed: {
                    supply_usd: '100',
                    collateral_usd: null,
                    debt_usd: '50',
                    net_value_usd: '50',
                    health_factor: '1.52',
                  },
                  evidence_quality: {
                    ...(definition.output.evidence_quality as Record<
                      string,
                      unknown
                    >),
                    health_factor_kind: 'protocol_reported',
                    response_timestamp: '2026-09-09T00:00:00.000Z',
                    response_freshness: 'recent',
                  },
                  liquidation_assessment: {
                    classification: 'reported_hf_above_one',
                    basis: 'api_reported_health_factor',
                    collateral_decline_to_boundary_pct: null,
                    debt_increase_to_boundary_pct: null,
                  },
                  next_steps: [
                    {
                      id: 'review_position',
                      label: 'Review your position on Venus',
                      kind: 'external_link',
                      url: 'https://app.venus.io/',
                    },
                  ],
                  blocking_missing_fields: [],
                  risk_warnings: [
                    'Illustrative values only. A reported HF above 1 does not guarantee safety.',
                  ],
                  evidence_gaps: [
                    'protocol_liquidation_thresholds',
                    'position_as_of',
                    'oracle_as_of',
                    'collateral_eligibility',
                  ],
                  analysis: {
                    overview:
                      'The illustrative Venus position supplies BNB and borrows BTCB. Its API-reported HF is 1.52. Relative asset price moves can affect borrowing risk.',
                    scenario_analysis: null,
                    strategy_comparison: [
                      {
                        id: 'repay_debt',
                        benefit:
                          'Repaying BTCB reduces outstanding debt and borrowed-asset price exposure.',
                        tradeoff:
                          'Repayment uses liquid capital and may require acquiring BTCB.',
                        prerequisite:
                          'Check available BTCB funds and BNB for gas.',
                      },
                      {
                        id: 'add_collateral',
                        benefit:
                          'Eligible collateral can improve HF while retaining borrowing.',
                        tradeoff:
                          'Additional capital remains exposed to the collateral asset and protocol.',
                        prerequisite:
                          'Confirm eligibility and enable the collateral.',
                      },
                    ],
                    generation: {
                      source: 'template',
                      failure: null,
                      numeric_validation: 'code_generated',
                      referenced_fact_ids: [],
                    },
                  },
                }),
              },
              description:
                'Illustrative completed API-based assessment, not live data. No user target or independent HF calculation is required. Suggestions are not executed transactions. HTTP 200 may also contain partial analysis when required data is missing or stale.',
            },
          ]
        : []),
      {
        status_code: healthV3 ? 422 : 200,
        label: healthV3
          ? 'position_selection_required'
          : yieldV3
            ? 'allocation_proposal_or_hold'
            : 'success',
        type: 'json' as const,
        body: successExample,
        description: healthV3
          ? 'Illustrative unresolved position response, not a live snapshot. HTTP 422 carries a needs_input result and is not a successful paid analysis.'
          : 'Successful xAPI envelope. output is a JSON string containing the agent-specific advisory result.',
      },
      {
        status_code: 400,
        label: 'invalid_input',
        type: 'json' as const,
        body: { error: 'invalid_input' },
        description:
          'The request is empty, malformed or fails the input profile.',
      },
      {
        status_code: 502,
        label: 'agent_execution_failed',
        type: 'json' as const,
        body: { error: 'agent_execution_failed' },
        description:
          'The bounded model or read-only tool execution did not complete.',
      },
    ],
    responseSchema: successEnvelopeSchema(outputSchema),
  });
}

function healthAnalysisExample(): AgentExampleDefinition {
  return {
    profileId: HEALTH_ANALYSIS_PROFILE,
    input: {
      chain: 'BNB Smart Chain',
      chainId: '56',
      walletAddress: '0x1111111111111111111111111111111111111111',
      protocol: 'Venus',
      objective:
        'Use current wallet-derived evidence to assess whether this Venus account has debt and, if possible, calculate its health factor and liquidation risk. Do not invent missing protocol parameters.',
    },
    output: {
      schema_version: 3,
      agent: 'health-factor-monitoring',
      execution_status: 'needs_input',
      debt_status: 'unknown',
      position: null,
      computed: {
        supply_usd: null,
        collateral_usd: null,
        debt_usd: null,
        net_value_usd: null,
        health_factor: null,
      },
      evidence_quality: {
        source: 'web3_tool',
        health_factor_kind: 'unavailable',
        liquidation_thresholds: 'missing',
        fetched_at: '2026-09-09T00:00:00.000Z',
        response_timestamp: null,
        position_as_of: null,
        oracle_as_of: null,
        response_freshness: 'unknown',
        balance_coverage: 'not_requested',
        source_paths: { collection: null, health_factor: null },
      },
      liquidation_assessment: {
        classification: 'unknown',
        basis: 'api_reported_health_factor',
        collateral_decline_to_boundary_pct: null,
        debt_increase_to_boundary_pct: null,
      },
      stress_tests: [],
      next_steps: [
        {
          id: 'resolve_position',
          kind: 'input',
          url: null,
          label: 'Check the wallet, protocol and collection selector.',
        },
      ],
      assumptions: [
        'Illustrative response only; supply is not proof of collateral eligibility.',
      ],
      risk_warnings: [
        'No matching collection does not prove absence of debt. Refresh position and oracle evidence before acting.',
      ],
      blocking_missing_fields: ['resolvable_lending_position'],
      evidence_gaps: [
        'protocol_liquidation_thresholds',
        'position_as_of',
        'oracle_as_of',
      ],
      analysis: {
        overview:
          'A unique lending position could not be resolved. Check the wallet, protocol and collection selector.',
        scenario_analysis: null,
        strategy_comparison: [],
        generation: {
          source: 'template',
          failure: null,
          numeric_validation: 'code_generated',
          referenced_fact_ids: [],
        },
      },
    },
  };
}

export function agentStudioAgentCardExamples(
  manifest: AgentStudioWorkerManifest,
): string[] {
  const contract = buildAgentStudioMarketplaceContract(manifest);
  const input = contract?.bodySchema.example.input;
  const prompt = contract?.bodySchema.example.prompt;
  return input && typeof input === 'object' && typeof prompt === 'string'
    ? [JSON.stringify({ ...input, objective: prompt })]
    : [];
}
