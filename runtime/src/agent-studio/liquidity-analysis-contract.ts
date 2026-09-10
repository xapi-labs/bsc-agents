export const LIQUIDITY_ANALYSIS_PROFILE = 'bnb-liquidity-rebalancing-v3';
export const LIQUIDITY_ANALYSIS_RUNTIME = 'agent-studio-worker-v10';
const text = { type: 'string' };
const strings = { type: 'array', items: text };
const nullable = (schema: unknown) => ({ oneOf: [schema, { type: 'null' }] });
const nt = nullable(text);
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const address = { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' };
export const LIQUIDITY_ANALYSIS_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['chainId', 'walletAddress', 'objective'],
  properties: {
    chain: text,
    chainId: { const: '56' },
    walletAddress: address,
    protocol: { type: 'string', pattern: '^[Pp]ancake[Ss]wap [vV]3$' },
    pool: { const: 'WBNB/USDT' },
    risk_profile: { enum: ['conservative', 'balanced', 'aggressive'] },
    positionSelector: {
      type: 'object',
      additionalProperties: false,
      minProperties: 1,
      properties: {
        poolAddress: address,
        positionId: text,
        nftId: { type: 'string', pattern: '^#?\\d+$' },
        investmentId: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
      },
    },
    includeExplanation: { type: 'boolean' },
    objective: { type: 'string', minLength: 1, maxLength: 2000 },
  },
};
const identity = { pool_address: text, position_id: text, nft_id: nt };
const token = obj({
  address: text,
  symbol: text,
  amount: text,
  reported_value_usd: nt,
  share_of_reported_supply_pct: nt,
});
const priceRange = obj({
  lower: text,
  upper: text,
  unit: { const: 'USDT_per_WBNB' },
});
export const LIQUIDITY_ANALYSIS_OUTPUT_SCHEMA = obj({
  schema_version: { const: 3 },
  agent: { const: 'liquidity-rebalancing' },
  execution_status: { enum: ['completed', 'partial', 'needs_input'] },
  decision: {
    enum: [
      'keep_range',
      'review_rebalance',
      'no_matching_position',
      'select_position',
      'insufficient_evidence',
    ],
  },
  transactions_executed: { const: false },
  request: obj({
    chain_id: text,
    wallet_address: text,
    protocol: text,
    pair: text,
  }),
  selection: obj({
    status: {
      enum: ['matched', 'no_match_reported', 'ambiguous', 'unavailable'],
    },
    candidates: { type: 'array', items: obj(identity) },
    source: { const: 'xapi_getDeFiPositions' },
  }),
  position: nullable(
    obj({
      ...identity,
      investment_ids: strings,
      reported_value_usd: nt,
      tokens: { type: 'array', items: token },
      reported_unclaimed_rewards: {
        type: 'array',
        items: obj({
          address: text,
          symbol: text,
          amount: nt,
          reported_value_usd: nt,
        }),
      },
      api_active: nullable({ type: 'boolean' }),
      tick_lower: nullable({ type: 'integer' }),
      tick_upper: nullable({ type: 'integer' }),
      token0_address: text,
      token1_address: text,
      range: nullable(priceRange),
    }),
  ),
  assessment: obj({
    reference_price_quote: nt,
    reference_as_of: nt,
    range_state: {
      enum: ['in_range', 'below_range', 'above_range', 'unknown'],
    },
    downside_to_lower_pct: nt,
    upside_to_upper_pct: nt,
    nearest_boundary_distance_pct: nt,
    boundary_review_pct: text,
    policy_source: { const: 'platform_review_heuristic_not_execution_trigger' },
    price_basis: {
      const: 'base_reference_usd_divided_by_quote_reference_usd_not_pool_spot',
    },
    reason: text,
  }),
  pool_evidence: nullable(
    obj({
      investment_id: text,
      pool_address: text,
      tvl_usd: nt,
      fee_rate: nt,
      fee_bps: nt,
      product_rate_type: nt,
      product_rate_pct: nt,
      rate_scope: { const: 'product_level_not_this_nft_realized_return' },
      tick_spacing: nullable({ type: 'integer' }),
      tick_spacing_source: { const: 'position_api_or_unavailable' },
      detail_response_at: nt,
    }),
  ),
  conditional_rebalance: nullable(
    obj({
      range: priceRange,
      range_basis: { const: 'recenter_preserving_existing_log_width' },
      target_tick_lower: { type: 'null' },
      target_tick_upper: { type: 'null' },
      executable: { const: false },
    }),
  ),
  scenarios: {
    type: 'array',
    items: obj({
      base_change_pct: text,
      quote_change_pct: text,
      reference_price_quote: text,
      range_state: { enum: ['in_range', 'below_range', 'above_range'] },
    }),
  },
  cost_assessment: obj({
    reset_gas_usd: { type: 'null' },
    swap_slippage_usd: { type: 'null' },
    incremental_fee_income_usd: { type: 'null' },
    net_rebalance_benefit_usd: { type: 'null' },
  }),
  analysis: obj({
    summary: text,
    comparison: obj({ keep_range: text, recenter: text }),
    generation: { enum: ['model_generated', 'template', 'template_fallback'] },
  }),
  evidence: obj({
    fetched_at: text,
    positions_response_at: nt,
    position_as_of: { type: 'null' },
    pool_state_as_of: { type: 'null' },
  }),
  blocking_missing_fields: strings,
  evidence_gaps: strings,
  execution_prerequisites: strings,
  next_steps: strings,
});
export function liquidityAnalysisExample(): {
  profileId: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
} {
  return {
    profileId: LIQUIDITY_ANALYSIS_PROFILE,
    input: {
      chainId: '56',
      walletAddress: '0x8d5624fA29526C879a1cA7560961E4c5a08089AE',
      objective:
        'Assess my existing PancakeSwap v3 WBNB/USDT LP position without executing transactions.',
    },
    output: {
      schema_version: 3,
      agent: 'liquidity-rebalancing',
      execution_status: 'partial',
      decision: 'insufficient_evidence',
      transactions_executed: false,
      request: {
        chain_id: '56',
        wallet_address: '0x8d5624fA29526C879a1cA7560961E4c5a08089AE',
        protocol: 'PancakeSwap v3',
        pair: 'WBNB/USDT',
      },
      selection: {
        status: 'unavailable',
        candidates: [],
        source: 'xapi_getDeFiPositions',
      },
      position: null,
      assessment: {
        reference_price_quote: null,
        reference_as_of: null,
        range_state: 'unknown',
        downside_to_lower_pct: null,
        upside_to_upper_pct: null,
        nearest_boundary_distance_pct: null,
        boundary_review_pct: '5',
        policy_source: 'platform_review_heuristic_not_execution_trigger',
        price_basis:
          'base_reference_usd_divided_by_quote_reference_usd_not_pool_spot',
        reason: 'position_evidence_unavailable',
      },
      pool_evidence: null,
      conditional_rebalance: null,
      scenarios: [],
      cost_assessment: {
        reset_gas_usd: null,
        swap_slippage_usd: null,
        incremental_fee_income_usd: null,
        net_rebalance_benefit_usd: null,
      },
      analysis: {
        summary: 'Live position evidence is required.',
        comparison: {
          keep_range: 'No decision without evidence.',
          recenter: 'No reset proposed without evidence.',
        },
        generation: 'template',
      },
      evidence: {
        fetched_at: '2026-09-09T18:00:00.000Z',
        positions_response_at: null,
        position_as_of: null,
        pool_state_as_of: null,
      },
      blocking_missing_fields: ['live_position_evidence'],
      evidence_gaps: ['Illustrative contract example; not a live response.'],
      execution_prerequisites: [],
      next_steps: ['Retry the live position lookup.'],
    },
  };
}
