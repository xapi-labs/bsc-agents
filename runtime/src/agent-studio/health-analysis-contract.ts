// A new contract: v1/v2 profiles and their historical digests stay unchanged.
export const HEALTH_ANALYSIS_PROFILE = 'bnb-health-factor-v3';
export const HEALTH_ANALYSIS_RUNTIME = 'agent-studio-worker-v7';

const text = { type: 'string' };
const nullableText = { oneOf: [{ type: 'string' }, { type: 'null' }] };
const strings = { type: 'array', items: text };
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const asset = object({
  address: nullableText,
  symbol: nullableText,
  amount: nullableText,
  value_usd: nullableText,
});

export const HEALTH_ANALYSIS_OUTPUT_SCHEMA = object({
  schema_version: { const: 3 },
  agent: { const: 'health-factor-monitoring' },
  execution_status: { enum: ['completed', 'partial', 'needs_input'] },
  debt_status: { enum: ['has_debt', 'no_reported_debt', 'unknown'] },
  position: {
    oneOf: [
      { type: 'null' },
      object({
        wallet_address: text,
        chain_id: text,
        protocol: text,
        pool_address: nullableText,
        collection_id: nullableText,
        supply_assets: { type: 'array', items: asset },
        borrow_assets: { type: 'array', items: asset },
      }),
    ],
  },
  computed: object({
    supply_usd: nullableText,
    collateral_usd: nullableText,
    debt_usd: nullableText,
    net_value_usd: nullableText,
    health_factor: nullableText,
  }),
  evidence_quality: object({
    source: { const: 'web3_tool' },
    health_factor_kind: { enum: ['protocol_reported', 'unavailable'] },
    liquidation_thresholds: { const: 'missing' },
    fetched_at: text,
    response_timestamp: nullableText,
    position_as_of: { type: 'null' },
    oracle_as_of: { type: 'null' },
    response_freshness: { enum: ['recent', 'stale', 'unknown', 'future'] },
    balance_coverage: { const: 'not_requested' },
    source_paths: object({
      collection: nullableText,
      health_factor: nullableText,
    }),
  }),
  liquidation_assessment: object({
    classification: {
      enum: [
        'reported_hf_at_or_below_one',
        'reported_hf_above_one',
        'no_reported_debt',
        'unknown',
      ],
    },
    basis: { const: 'api_reported_health_factor' },
    collateral_decline_to_boundary_pct: nullableText,
    debt_increase_to_boundary_pct: nullableText,
  }),
  stress_tests: {
    type: 'array',
    items: object({
      id: text,
      collateral_price_change_pct: { enum: [-30, -20, -15, -10, 0] },
      debt_price_change_pct: { enum: [-20, 0, 10, 20] },
      projected_health_factor: text,
      at_or_below_one: { type: 'boolean' },
      basis: { const: 'conditional_estimate_from_reported_hf' },
    }),
  },
  next_steps: {
    type: 'array',
    items: object({
      id: text,
      label: text,
      kind: { enum: ['external_link', 'suggestion', 'input'] },
      url: nullableText,
    }),
  },
  assumptions: strings,
  risk_warnings: strings,
  blocking_missing_fields: strings,
  evidence_gaps: strings,
  analysis: object({
    overview: text,
    scenario_analysis: nullableText,
    strategy_comparison: {
      type: 'array',
      maxItems: 2,
      items: object({
        id: { enum: ['repay_debt', 'add_collateral'] },
        benefit: text,
        tradeoff: text,
        prerequisite: text,
      }),
    },
    generation: object({
      source: { enum: ['template', 'model_generated', 'template_fallback'] },
      failure: nullableText,
      numeric_validation: { enum: ['code_generated', 'code_references'] },
      referenced_fact_ids: strings,
    }),
  }),
});

export const HEALTH_ANALYSIS_INPUT_SCHEMA = object({
  chain: { type: 'string', maxLength: 64 },
  chainId: { type: 'string', enum: ['56'], default: '56' },
  walletAddress: { type: 'string', pattern: '^0x[A-Fa-f0-9]{40}$' },
  protocol: { type: 'string', minLength: 1, maxLength: 120 },
  objective: { type: 'string', minLength: 1, maxLength: 2000 },
  positionSelector: {
    ...object({
      protocol: { type: 'string', minLength: 1, maxLength: 120 },
      poolAddress: { type: 'string', pattern: '^0x[A-Fa-f0-9]{40}$' },
      collectionId: { type: 'string', minLength: 1, maxLength: 128 },
      positionId: { type: 'string', minLength: 1, maxLength: 128 },
      investmentId: { type: 'string', minLength: 1, maxLength: 128 },
    }),
    required: [],
  },
  includeExplanation: { type: 'boolean', default: true },
});
HEALTH_ANALYSIS_INPUT_SCHEMA.required = [
  'walletAddress',
  'protocol',
  'objective',
];
