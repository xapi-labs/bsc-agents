export const GRID_ANALYSIS_PROFILE = 'bnb-grid-trading-v3';
export const GRID_ANALYSIS_RUNTIME = 'agent-studio-worker-v9';
const text = { type: 'string' };
const nt = { oneOf: [text, { type: 'null' }] };
const strings = { type: 'array', items: text };
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const nullable = (schema: unknown) => ({ oneOf: [schema, { type: 'null' }] });
const decimal = {
  type: 'string',
  pattern: '^\\d+(?:\\.\\d+)?$',
  maxLength: 60,
};
export const GRID_ANALYSIS_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'chainId',
    'venue',
    'pair',
    'baseTokenAddress',
    'quoteTokenAddress',
    'capital_asset',
    'capital_quote',
    'risk_profile',
    'objective',
  ],
  properties: {
    chain: text,
    chainId: { const: '56' },
    venue: { type: 'string', pattern: '^[Pp]ancake[Ss]wap [vV]3$' },
    pair: { const: 'WBNB/USDT' },
    baseTokenAddress: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
    quoteTokenAddress: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
    capital_asset: { const: 'USDT' },
    capital_quote: decimal,
    risk_profile: { enum: ['conservative', 'balanced', 'aggressive'] },
    horizon_days: { const: 7 },
    grid_count: { type: 'integer', minimum: 4, maximum: 30 },
    lower_price: decimal,
    upper_price: decimal,
    fee_bps: decimal,
    slippage_bps: { type: 'number', minimum: 0, maximum: 1000 },
    constraints: {
      type: 'object',
      additionalProperties: false,
      properties: {
        reserve_quote_pct: { type: 'number', minimum: 0, maximum: 100 },
        max_quote_per_order: decimal,
      },
    },
    includeExplanation: { type: 'boolean' },
    objective: { type: 'string', minLength: 1, maxLength: 2000 },
  },
};
const intent = obj({
  id: text,
  side: { enum: ['buy', 'sell'] },
  trigger: { enum: ['cross_down', 'cross_up'] },
  price_quote: text,
  amount_base: text,
  notional_quote: text,
  condition: text,
});
export const GRID_ANALYSIS_OUTPUT_SCHEMA = obj({
  schema_version: { const: 3 },
  agent: { const: 'grid-trading' },
  execution_status: { enum: ['completed', 'partial'] },
  plan_status: { enum: ['proposed', 'hold'] },
  transactions_executed: { const: false },
  request: obj({
    chain_id: text,
    pair: text,
    venue: text,
    capital_quote: text,
    risk_profile: text,
  }),
  policy: obj({
    strategy: { const: 'neutral_two_sided' },
    horizon_days: { const: 7 },
    grid_count: { type: 'integer' },
    reserve_quote_pct: { type: 'number' },
    slippage_bps: { type: 'number' },
    defaults_applied: strings,
  }),
  market_evidence: obj({
    fetched_at: text,
    base_reference_price: nt,
    quote_reference_price: nt,
    current_price_quote: nt,
    base_as_of: nt,
    quote_as_of: nt,
    price_basis: {
      const: 'base_reference_price_divided_by_quote_reference_price',
    },
    candle_count: { type: 'integer' },
    candle_start: nt,
    candle_end_exclusive: nt,
    observed_low_quote: nt,
    observed_high_quote: nt,
    hourly_log_return_stddev: nt,
  }),
  venue_evidence: nullable(
    obj({
      pool_address: text,
      protocol: text,
      liquidity_usd: text,
      response_at: text,
      selection: {
        const: 'highest_reported_liquidity_among_exact_pair_v3_matches',
      },
    }),
  ),
  grid: nullable(
    obj({
      mode: { const: 'arithmetic' },
      lower: text,
      upper: text,
      spacing: text,
      levels: { type: 'array', items: text },
      range_basis: {
        enum: [
          'caller_bounds',
          'seven_day_paired_candle_envelope_with_volatility_buffer',
        ],
      },
      starts_at: text,
      expires_at: text,
      execution_model: { const: 'external_keeper_conditional_swaps' },
    }),
  ),
  funding: nullable(
    obj({
      source: { const: 'caller_quote_budget_not_wallet_balance' },
      reserve_quote: text,
      initial_base_purchase_quote: text,
      initial_base_estimate: text,
      buy_budget_quote: text,
      quote_dust: text,
      base_dust: text,
      bootstrap_status: {
        const: 'requires_reviewed_swap_then_inventory_confirmation',
      },
    }),
  ),
  intents: { type: 'array', items: intent },
  cost_assessment: obj({
    fee_bps: nt,
    fee_source: { enum: ['caller', 'unavailable'] },
    round_trip_fee_rate_bps: nt,
    minimum_adjacent_gross_spread_bps: nt,
    gas_cost_quote: { type: 'null' },
    net_profit: { type: 'null' },
  }),
  lifecycle: strings,
  analysis: obj({
    overview: text,
    tradeoffs: text,
    generation: { enum: ['model_generated', 'template', 'template_fallback'] },
  }),
  blocking_missing_fields: strings,
  evidence_gaps: strings,
  risk_warnings: strings,
  assumptions: strings,
});
export function gridAnalysisExample(): {
  profileId: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
} {
  return {
    profileId: GRID_ANALYSIS_PROFILE,
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
      schema_version: 3,
      agent: 'grid-trading',
      execution_status: 'partial',
      plan_status: 'hold',
      transactions_executed: false,
      request: {
        chain_id: '56',
        pair: 'WBNB/USDT',
        venue: 'PancakeSwap v3',
        capital_quote: '3000',
        risk_profile: 'balanced',
      },
      policy: {
        strategy: 'neutral_two_sided',
        horizon_days: 7,
        grid_count: 10,
        reserve_quote_pct: 15,
        slippage_bps: 35,
        defaults_applied: ['grid_count', 'reserve_quote_pct', 'slippage_bps'],
      },
      market_evidence: {
        fetched_at: '2026-09-09T00:00:00.000Z',
        base_reference_price: null,
        quote_reference_price: null,
        current_price_quote: null,
        base_as_of: null,
        quote_as_of: null,
        price_basis: 'base_reference_price_divided_by_quote_reference_price',
        candle_count: 0,
        candle_start: null,
        candle_end_exclusive: null,
        observed_low_quote: null,
        observed_high_quote: null,
        hourly_log_return_stddev: null,
      },
      venue_evidence: null,
      grid: null,
      funding: null,
      intents: [],
      cost_assessment: {
        fee_bps: null,
        fee_source: 'unavailable',
        round_trip_fee_rate_bps: null,
        minimum_adjacent_gross_spread_bps: null,
        gas_cost_quote: null,
        net_profit: null,
      },
      lifecycle: [],
      analysis: {
        overview: 'Live evidence is required to construct the proposed grid.',
        tradeoffs:
          'The supplied capital is a budget, not a verified wallet balance.',
        generation: 'template',
      },
      blocking_missing_fields: ['live_market_evidence'],
      evidence_gaps: [],
      risk_warnings: [],
      assumptions: ['Illustrative schema example, not a live quote.'],
    },
  };
}
