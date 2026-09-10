import Ajv from 'ajv';
import DecimalJs from 'decimal.js';
const Decimal = DecimalJs.clone({ precision: 80 });
import { GRID_ANALYSIS_OUTPUT_SCHEMA } from '../agent-studio';
import captured from './fixtures/grid-wbnb-usdt-2026-09-09.json';
import { createGridAnalysisRuntime } from './grid-analysis-runtime';
const runtime = createGridAnalysisRuntime(Decimal);
const request = {
  ...captured.request,
  objective:
    'Build a neutral seven-day grid using live market evidence and do not place any orders.',
};
const analyze = (
  input: Record<string, any> = request,
  raw = structuredClone(captured.raw),
  at = captured.fetched_at,
) => runtime.analyze(input, raw, at);

describe('Grid v3 verified market planning', () => {
  it('preserves the quote budget and proposes a neutral inventory bootstrap rather than inventing WBNB', () => {
    const r = analyze();
    expect(r.plan_status).toBe('proposed');
    expect(r.transactions_executed).toBe(false);
    expect(r.request.capital_quote).toBe('3000');
    expect(r.policy).toMatchObject({
      grid_count: 10,
      reserve_quote_pct: 15,
      slippage_bps: 35,
      horizon_days: 7,
      strategy: 'neutral_two_sided',
    });
    expect(r.funding).toMatchObject({
      reserve_quote: '450',
      initial_base_purchase_quote: '1275',
      buy_budget_quote: '1275',
      bootstrap_status: 'requires_reviewed_swap_then_inventory_confirmation',
    });
    expect(r.intents.some((i) => i.side === 'sell')).toBe(true);
    expect(r.intents.some((i) => i.side === 'buy')).toBe(true);
    expect(r.cost_assessment.fee_bps).toBeNull();
    expect(r.cost_assessment.net_profit).toBeNull();
    expect(
      new Ajv({ strict: false }).validate(GRID_ANALYSIS_OUTPUT_SCHEMA, r),
    ).toBe(true);
  });
  it('divides base and quote reference prices instead of assuming USDT is exactly one', () => {
    const r = analyze(),
      m = r.market_evidence;
    const expected = new Decimal(m.base_reference_price!).div(
      m.quote_reference_price!,
    );
    expect(
      new Decimal(m.current_price_quote!)
        .minus(expected)
        .abs()
        .lt('0.000000000001'),
    ).toBe(true);
    expect(m.current_price_quote).not.toBe(m.base_reference_price);
    expect(m.base_as_of).toMatch(/^2026-09-09/);
  });
  it('covers exactly 168 consecutive completed paired hours and all observed extrema', () => {
    const r = analyze(),
      m = r.market_evidence;
    expect(m.candle_count).toBe(168);
    expect(
      Date.parse(m.candle_end_exclusive!) - Date.parse(m.candle_start!),
    ).toBe(7 * 24 * 3600000);
    expect(new Decimal(r.grid!.lower).lte(m.observed_low_quote!)).toBe(true);
    expect(new Decimal(r.grid!.upper).gte(m.observed_high_quote!)).toBe(true);
    expect(Date.parse(r.grid!.expires_at) - Date.parse(r.grid!.starts_at)).toBe(
      7 * 24 * 3600000,
    );
  });
  it('maintains grid endpoints, arithmetic spacing, sidedness and exact order notionals', () => {
    const r = analyze(),
      g = r.grid!,
      m = r.market_evidence;
    expect(g.levels).toHaveLength(10);
    expect(g.levels[0]).toBe(g.lower);
    expect(g.levels.at(-1)).toBe(g.upper);
    const step = new Decimal(g.upper).minus(g.lower).div(9);
    g.levels.forEach((v: string, i: number) =>
      expect(
        new Decimal(v)
          .minus(new Decimal(g.lower).plus(step.mul(i)))
          .abs()
          .lte('0.000000000002'),
      ).toBe(true),
    );
    for (const intent of r.intents) {
      expect(g.levels).toContain(intent.price_quote);
      expect(
        new Decimal(intent.price_quote)
          .mul(intent.amount_base)
          .eq(intent.notional_quote),
      ).toBe(true);
      expect(
        intent.side === 'buy'
          ? new Decimal(intent.price_quote).lt(m.current_price_quote!)
          : new Decimal(intent.price_quote).gt(m.current_price_quote!),
      ).toBe(true);
    }
  });
  it('conserves quote funds and limits sell quantities to proposed inventory with explicit dust', () => {
    const r = analyze(),
      f = r.funding!;
    const buys = r.intents
      .filter((i) => i.side === 'buy')
      .reduce((s, i) => s.plus(i.notional_quote), new Decimal(0));
    const sells = r.intents
      .filter((i) => i.side === 'sell')
      .reduce((s, i) => s.plus(i.amount_base), new Decimal(0));
    expect(buys.plus(f.quote_dust).eq(f.buy_budget_quote)).toBe(true);
    expect(sells.plus(f.base_dust).eq(f.initial_base_estimate)).toBe(true);
    expect(
      new Decimal(f.reserve_quote)
        .plus(f.initial_base_purchase_quote)
        .plus(f.buy_budget_quote)
        .eq('3000'),
    ).toBe(true);
  });
  it('does not select the larger V2 pool for a V3 request', () => {
    expect(analyze().venue_evidence?.protocol).toBe('PancakeSwap V3');
    const raw = structuredClone(captured.raw);
    raw.pools.data = raw.pools.data.filter(
      (r) => r.protocolName === 'PancakeSwap',
    );
    expect(analyze(request, raw).blocking_missing_fields).toContain(
      'exact_pair_pancakeswap_v3_pool',
    );
  });
  it('rejects a pool with a mismatched quote contract', () => {
    const raw = structuredClone(captured.raw);
    raw.pools.data.forEach(
      (r) =>
        (r.liquidityAmount[1].tokenContractAddress =
          '0x1111111111111111111111111111111111111111'),
    );
    expect(analyze(request, raw).venue_evidence).toBeNull();
  });
  it.each(['base_candles', 'quote_candles'] as const)(
    'holds if %s has a missing required hour',
    (key) => {
      const raw = structuredClone(captured.raw);
      raw[key].data.splice(30, 1);
      const r = analyze(request, raw);
      expect(r.blocking_missing_fields).toContain(
        'complete_paired_seven_day_hourly_candles',
      );
      expect(r.intents).toEqual([]);
    },
  );
  it('rejects duplicate and malformed candle records without deduplicating conflicting evidence', () => {
    for (const kind of ['duplicate', 'invalid']) {
      const raw = structuredClone(captured.raw);
      if (kind === 'duplicate')
        raw.base_candles.data.push(raw.base_candles.data[0]);
      else raw.base_candles.data[30][1] = 0;
      expect(analyze(request, raw).plan_status).toBe('hold');
    }
  });
  it('rejects stale, wrong-chain and duplicated current-price evidence', () => {
    for (const kind of ['stale', 'chain', 'duplicate']) {
      const raw = structuredClone(captured.raw);
      if (kind === 'stale') raw.prices.data[0].time -= 3600000;
      if (kind === 'chain') raw.prices.data[0].binanceChainId = '1';
      if (kind === 'duplicate') raw.prices.data.push(raw.prices.data[0]);
      expect(analyze(request, raw).blocking_missing_fields).toContain(
        'fresh_exact_base_and_quote_prices',
      );
    }
  });
  it('does not treat fresh response time as fresh price observations', () => {
    const r = analyze(request, captured.raw, '2026-09-09T12:00:00.000Z');
    expect(r.plan_status).toBe('hold');
    expect(r.grid).toBeNull();
  });
  it('respects exact caller bounds without rounding or replacing them', () => {
    const r = analyze({
      ...request,
      lower_price: '700.000000000000001',
      upper_price: '800.000000000000009',
    });
    expect(r.grid?.lower).toBe('700.000000000000001');
    expect(r.grid?.upper).toBe('800.000000000000009');
    expect(r.grid?.levels[0]).toBe(r.grid?.lower);
    expect(
      analyze({ ...request, lower_price: '800', upper_price: '850' })
        .plan_status,
    ).toBe('hold');
  });
  it('honors explicit capital limits and rejects a fee/slippage budget exceeding grid spread', () => {
    expect(
      analyze({ ...request, constraints: { max_quote_per_order: '10' } })
        .blocking_missing_fields,
    ).toContain('max_quote_per_order_exceeded');
    expect(
      analyze({ ...request, constraints: { reserve_quote_pct: 100 } }).intents,
    ).toEqual([]);
    const highFee = analyze({ ...request, fee_bps: '1000' });
    expect(highFee.blocking_missing_fields).toContain(
      'grid_spacing_does_not_cover_fee_and_slippage_budget',
    );
    expect(highFee.cost_assessment.round_trip_fee_rate_bps).toBe('2000');
  });
  it('does not silently change a different horizon or a requested hedge into this strategy', () => {
    for (const objective of [
      'Build a three-day neutral grid',
      'Build a delta-neutral hedge',
    ])
      expect(analyze({ ...request, objective }).plan_status).toBe('hold');
    expect(() =>
      analyze({
        ...request,
        baseTokenAddress: '0x1111111111111111111111111111111111111111',
      }),
    ).toThrow('invalid_input');
  });
  it('rejects model-invented prices, fills and hedge claims while accepting qualitative explanation', () => {
    const r = analyze();
    const prose = {
      overview:
        'WBNB inventory must be prepared before the proposed sell intents can be used; buy intents use the remaining USDT budget.',
      tradeoffs:
        'Price gaps and directional inventory exposure remain, and unknown transaction costs require review.',
    };
    expect(runtime.parseNarrative(JSON.stringify(prose), r)?.generation).toBe(
      'model_generated',
    );
    for (const extra of [
      ' Profit is 5%.',
      ' Orders filled.',
      ' This is delta-neutral.',
    ])
      expect(
        runtime.parseNarrative(
          JSON.stringify({ ...prose, tradeoffs: prose.tradeoffs + extra }),
          r,
        ),
      ).toBeNull();
  });
});
