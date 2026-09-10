export const YIELD_ANALYSIS_PROFILE = 'bnb-yield-optimisation-v3';
export const YIELD_ANALYSIS_RUNTIME = 'agent-studio-worker-v8';
const text = { type: 'string' };
const nullableText = { oneOf: [text, { type: 'null' }] };
const strings = { type: 'array', items: text };
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const rateType = { enum: ['APY', 'APR', null] };
const constraints = {
  type: 'object',
  additionalProperties: false,
  properties: {
    max_protocol_share_pct: { type: 'number', minimum: 0, maximum: 100 },
    max_lock_days: { type: 'number', minimum: 0, maximum: 36500 },
    max_risk_score: { type: 'number', minimum: 0, maximum: 100 },
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
};
export const YIELD_ANALYSIS_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'chainId',
    'asset',
    'assetTokenAddress',
    'amount',
    'risk_profile',
    'objective',
  ],
  properties: {
    chain: { type: 'string', enum: ['BNB Smart Chain', 'BSC', 'BNB Chain'] },
    chainId: { const: '56' },
    asset: { type: 'string', minLength: 1, maxLength: 32 },
    assetTokenAddress: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
    amount: {
      type: 'string',
      pattern: '^(?=.*[1-9])\\d+(?:\\.\\d+)?$',
      maxLength: 60,
    },
    risk_profile: { enum: ['conservative', 'balanced', 'aggressive'] },
    asset_universe: {
      enum: ['stable_only', 'bluechip_allowed', 'any_supported_asset'],
    },
    constraints,
    objective: { type: 'string', minLength: 1, maxLength: 2000 },
    includeExplanation: { type: 'boolean' },
  },
};
export const YIELD_ANALYSIS_OUTPUT_SCHEMA = object({
  schema_version: { const: 3 },
  agent: { const: 'yield-optimisation' },
  execution_status: { enum: ['completed', 'partial'] },
  allocation_status: { enum: ['proposed', 'hold'] },
  transactions_executed: { const: false },
  request: object({
    chain_id: text,
    asset: text,
    asset_token_address: text,
    amount: text,
    risk_profile: text,
    asset_universe: nullableText,
    constraints,
  }),
  candidates: {
    type: 'array',
    items: object({
      investment_id: text,
      protocol_id: text,
      protocol: text,
      market: text,
      investment_type: text,
      rate_type: rateType,
      rate_pct: nullableText,
      tvl_usd: nullableText,
      lock_days: nullableText,
      reward_tokens: {
        oneOf: [
          {
            type: 'array',
            items: object({ address: nullableText, symbol: nullableText }),
          },
          { type: 'null' },
        ],
      },
      investable: { enum: [true, false, null] },
      principal_verified: { type: 'boolean' },
      detail_verified: { type: 'boolean' },
      comparable: { type: 'boolean' },
      eligible_for_proposal: { type: 'boolean' },
      blocking_reasons: strings,
      constraint_violations: strings,
      evidence_gaps: strings,
      evidence: object({
        list_response_at: nullableText,
        detail_response_at: nullableText,
        product_as_of: { type: 'null' },
      }),
    }),
  },
  allocation: {
    type: 'array',
    items: object({
      investment_id: text,
      protocol_id: text,
      protocol: text,
      asset: text,
      share_pct: text,
      amount: text,
      rate_type: { enum: ['APY', 'APR'] },
      rate_pct: text,
    }),
  },
  allocation_summary: object({
    basis: { const: 'highest_verified_current_quote_with_protocol_cap' },
    rate_type: rateType,
    weighted_headline_rate_pct: nullableText,
    annual_gross_amount: nullableText,
  }),
  blocking_missing_fields: strings,
  safety_checks: strings,

  unallocated_amount: text,
  analysis: object({
    overview: text,
    tradeoffs: text,
    generation: { enum: ['model_generated', 'template', 'template_fallback'] },
  }),
  coverage: object({
    fetched_at: text,
    discovery_pages: { type: 'integer', minimum: 0 },
    discovered_count: { type: 'integer', minimum: 0 },
    details_requested: { type: 'integer', minimum: 0 },
    truncated: { type: 'boolean' },
    scope: text,
  }),
  evidence_gaps: strings,
  next_steps: strings,
  assumptions: strings,
});

export function yieldAnalysisExample(): {
  profileId: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
} {
  return {
    profileId: YIELD_ANALYSIS_PROFILE,
    input: {
      chain: 'BNB Smart Chain',
      chainId: '56',
      asset: 'USDT',
      assetTokenAddress: '0x55d398326f99059fF775485246999027B3197955',
      amount: '10000',
      risk_profile: 'balanced',
      asset_universe: 'stable_only',
      constraints: { max_protocol_share_pct: 60 },
      objective:
        'Route liquidity to the highest currently available quoted yield while respecting safety constraints.',
    },
    output: {
      schema_version: 3,
      agent: 'yield-optimisation',
      execution_status: 'partial',
      allocation_status: 'hold',
      transactions_executed: false,
      request: {
        chain_id: '56',
        asset: 'USDT',
        asset_token_address: '0x55d398326f99059ff775485246999027b3197955',
        amount: '10000',
        risk_profile: 'balanced',
        asset_universe: 'stable_only',
        constraints: { max_protocol_share_pct: 60 },
      },
      candidates: [],
      allocation_summary: {
        basis: 'highest_verified_current_quote_with_protocol_cap',
        rate_type: null,
        weighted_headline_rate_pct: null,
        annual_gross_amount: null,
      },
      blocking_missing_fields: ['investment_discovery'],
      safety_checks: [],
      allocation: [],
      unallocated_amount: '10000',
      analysis: {
        overview: 'Product evidence is unavailable.',
        tradeoffs: 'Refresh investment discovery before comparing products.',
        generation: 'template',
      },
      coverage: {
        fetched_at: '2026-09-09T00:00:00.000Z',
        discovery_pages: 0,
        discovered_count: 0,
        details_requested: 0,
        truncated: false,
        scope: 'Bounded discovery; direct same-token Earn routing only.',
      },
      evidence_gaps: ['investment_discovery'],
      next_steps: ['Retry live discovery.'],
      assumptions: [
        'Illustrative contract shape; contains no live product quotes.',
      ],
    },
  };
}
