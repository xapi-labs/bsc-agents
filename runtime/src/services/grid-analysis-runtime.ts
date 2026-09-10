import Decimal from 'decimal.js';

/** Pure, self-contained factory shared by Node tests and the generated Worker. */
export function createGridAnalysisRuntime(DecimalType: typeof Decimal) {
  const D = DecimalType.clone({
    precision: 80,
    rounding: DecimalType.ROUND_DOWN,
  });
  type Row = Record<string, any>;
  const HOUR = 3600000,
    HOURS = 168;
  const BASE = '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
    QUOTE = '0x55d398326f99059ff775485246999027b3197955';
  const rec = (v: unknown): v is Row =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  const norm = (v: unknown) =>
    typeof v === 'string' ? v.trim().toLowerCase() : '';
  function dec(v: unknown): Decimal | null {
    if (
      (typeof v !== 'string' && typeof v !== 'number') ||
      String(v).length > 80 ||
      !/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(String(v))
    )
      return null;
    try {
      const n = new D(v);
      return n.isFinite() && n.gte(0) && n.lte(Number.MAX_SAFE_INTEGER)
        ? n
        : null;
    } catch {
      return null;
    }
  }
  const fmt = (v: Decimal) => v.toDecimalPlaces(18).toFixed();
  const iso = (v: unknown) =>
    typeof v === 'number' &&
    Number.isSafeInteger(v) &&
    v > 0 &&
    v < 8640000000000000
      ? new Date(v).toISOString()
      : null;
  const fresh = (v: unknown, now: number, max = 300000) =>
    iso(v) !== null && Number(v) <= now + 60000 && now - Number(v) <= max;
  const payload = (v: unknown): Row | null =>
    rec(v) && v.code === 0 && v.success === true ? v : null;
  function resolve(input: Row) {
    if (
      input.chainId !== '56' ||
      norm(input.baseTokenAddress) !== BASE ||
      norm(input.quoteTokenAddress) !== QUOTE ||
      input.pair !== 'WBNB/USDT' ||
      norm(input.venue) !== 'pancakeswap v3' ||
      input.capital_asset !== 'USDT' ||
      !dec(input.capital_quote)?.gt(0)
    )
      throw new Error('invalid_input');
    const profiles: Row = {
      conservative: [12, 30, 20],
      balanced: [10, 15, 35],
      aggressive: [8, 5, 60],
    };
    const profile = profiles[input.risk_profile];
    if (!profile) throw new Error('invalid_input');
    const count = input.grid_count ?? profile[0],
      reserve = input.constraints?.reserve_quote_pct ?? profile[1],
      slippage = input.slippage_bps ?? profile[2];
    if (
      !Number.isInteger(count) ||
      count < 4 ||
      count > 30 ||
      reserve < 0 ||
      reserve > 100 ||
      slippage < 0 ||
      slippage > 1000
    )
      throw new Error('invalid_input');
    if ((input.lower_price === undefined) !== (input.upper_price === undefined))
      throw new Error('invalid_input');
    return {
      strategy: 'neutral_two_sided',
      horizon_days: 7,
      grid_count: count,
      reserve_quote_pct: reserve,
      slippage_bps: slippage,
      defaults_applied: [
        ...(input.grid_count === undefined ? ['grid_count'] : []),
        ...(input.constraints?.reserve_quote_pct === undefined
          ? ['reserve_quote_pct']
          : []),
        ...(input.slippage_bps === undefined ? ['slippage_bps'] : []),
      ],
    };
  }
  function prices(raw: unknown, input: Row, now: number) {
    const e = payload(raw);
    if (!e || !fresh(e.timestamp, now) || !Array.isArray(e.data)) return null;
    const find = (address: string) =>
      e.data.filter(
        (r: Row) =>
          r.binanceChainId === input.chainId &&
          norm(r.tokenContractAddress) === address,
      );
    const a = find(BASE),
      b = find(QUOTE);
    if (a.length !== 1 || b.length !== 1) return null;
    if (
      !fresh(a[0].time, now) ||
      !fresh(b[0].time, now) ||
      Math.abs(a[0].time - b[0].time) > 60000
    )
      return null;
    const base = dec(a[0].price),
      quote = dec(b[0].price);
    if (!base?.gt(0) || !quote?.gt(0)) return null;
    return {
      base,
      quote,
      current: base.div(quote),
      base_at: a[0].time,
      quote_at: b[0].time,
    };
  }
  function candles(raw: unknown, now: number): Map<number, Row> | null {
    const e = payload(raw);
    if (!e || !fresh(e.timestamp, now) || !Array.isArray(e.data)) return null;
    const result = new Map<number, Row>();
    for (const row of e.data) {
      if (!Array.isArray(row) || row.length < 6) return null;
      const [o, h, l, c] = row.slice(0, 4).map(dec),
        time = row[5];
      if (
        !o?.gt(0) ||
        !h?.gt(0) ||
        !l?.gt(0) ||
        !c?.gt(0) ||
        !iso(time) ||
        time % HOUR !== 0 ||
        l.gt(D.min(o, c)) ||
        h.lt(D.max(o, c)) ||
        result.has(time)
      )
        return null;
      if (time + HOUR > now) continue;
      result.set(time, { open: o, high: h, low: l, close: c, time });
    }
    return result;
  }
  function pairedCandles(base: unknown, quote: unknown, now: number) {
    const a = candles(base, now),
      b = candles(quote, now);
    if (!a || !b) return null;
    const end = Math.floor(now / HOUR) * HOUR,
      start = end - HOURS * HOUR;
    const rows: Row[] = [];
    for (let t = start; t < end; t += HOUR) {
      const x = a.get(t),
        y = b.get(t);
      if (!x || !y) return null;
      rows.push({
        time: t,
        low: x.low.div(y.high),
        high: x.high.div(y.low),
        close: x.close.div(y.close),
      });
    }
    const returns = rows
      .slice(1)
      .map((row, i) => row.close.div(rows[i].close).ln());
    const mean = returns
      .reduce((s, n) => s.plus(n), new D(0))
      .div(returns.length);
    const variance = returns
      .reduce((s, n) => s.plus(n.minus(mean).pow(2)), new D(0))
      .div(returns.length - 1);
    return {
      start,
      end,
      count: rows.length,
      low: D.min(...rows.map((r) => r.low)),
      high: D.max(...rows.map((r) => r.high)),
      sigma: variance.sqrt(),
    };
  }
  function venue(raw: unknown, now: number) {
    const e = payload(raw);
    if (!e || !fresh(e.timestamp, now) || !Array.isArray(e.data)) return null;
    const matches = e.data.filter(
      (r: Row) =>
        norm(r.protocolName) === 'pancakeswap v3' &&
        /^0x[a-f0-9]{40}$/i.test(r.poolAddress) &&
        dec(r.liquidityUsd)?.gt(0) &&
        Array.isArray(r.liquidityAmount) &&
        r.liquidityAmount.length === 2 &&
        new Set(r.liquidityAmount.map((t: Row) => norm(t.tokenContractAddress)))
          .size === 2 &&
        [BASE, QUOTE].every((addr) =>
          r.liquidityAmount.some(
            (t: Row) => norm(t.tokenContractAddress) === addr,
          ),
        ),
    );
    matches.sort(
      (a: Row, b: Row) =>
        new D(b.liquidityUsd).cmp(a.liquidityUsd) ||
        a.poolAddress.localeCompare(b.poolAddress),
    );
    const best = matches[0];
    return best
      ? {
          pool_address: best.poolAddress,
          protocol: best.protocolName,
          liquidity_usd: best.liquidityUsd,
          response_at: iso(e.timestamp)!,
          selection: 'highest_reported_liquidity_among_exact_pair_v3_matches',
        }
      : null;
  }
  function analyze(input: Row, raw: Row, fetchedAt: string) {
    const policy = resolve(input),
      now = Date.parse(fetchedAt);
    if (!Number.isFinite(now)) throw new Error('invalid_input');
    const price = prices(raw.prices, input, now),
      history = pairedCandles(raw.base_candles, raw.quote_candles, now),
      pool = venue(raw.pools, now);
    const blocking: string[] = [];
    if (!price) blocking.push('fresh_exact_base_and_quote_prices');
    if (!history) blocking.push('complete_paired_seven_day_hourly_candles');
    if (!pool) blocking.push('exact_pair_pancakeswap_v3_pool');
    const objective = norm(input.objective);
    const dayMatch = objective.match(
      /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|fourteen|thirty)[ -]days?\b/,
    );
    if (dayMatch && !['7', 'seven'].includes(dayMatch[1]))
      blocking.push('requested_horizon_outside_seven_day_profile');
    if (
      /\b(buy[ -]first|sell[ -]first|short only|long only|delta[ -]neutral)\b/.test(
        objective,
      )
    )
      blocking.push('requested_strategy_outside_two_sided_inventory_grid');
    let grid: Row | null = null,
      funding: Row | null = null;
    const intents: Row[] = [];
    let minimumSpread: Decimal | null = null;
    const fee = input.fee_bps !== undefined ? dec(input.fee_bps) : null;
    if (input.fee_bps !== undefined && (!fee || fee.gt(1000)))
      throw new Error('invalid_input');
    const capital = dec(input.capital_quote)!;
    if (policy.reserve_quote_pct === 100) blocking.push('no_active_capital');
    if (blocking.length === 0 && price && history) {
      const explicit = input.lower_price !== undefined;
      const buffer = D.max(
        price.current.mul(history.sigma).mul(2),
        price.current.mul('0.000001'),
      );
      const lower = explicit
        ? dec(input.lower_price)
        : D.min(history.low, price.current.minus(buffer));
      const upper = explicit
        ? dec(input.upper_price)
        : D.max(history.high, price.current.plus(buffer));
      if (
        !lower?.gt(0) ||
        !upper?.gt(lower) ||
        !lower.lt(price.current) ||
        !upper.gt(price.current)
      )
        blocking.push('bounds_must_straddle_live_quote_price');
      else {
        // Round bounds outwards; display levels are the actual intended triggers.
        const lo = explicit ? lower : lower.toDecimalPlaces(12, D.ROUND_FLOOR),
          hi = explicit ? upper : upper.toDecimalPlaces(12, D.ROUND_CEIL);
        const step = hi.minus(lo).div(policy.grid_count - 1);
        const levels = Array.from({ length: policy.grid_count }, (_, i) =>
          i === 0
            ? lo
            : i === policy.grid_count - 1
              ? hi
              : lo.plus(step.mul(i)).toDecimalPlaces(12),
        );
        if (levels.some((v, i) => i > 0 && v.lte(levels[i - 1])))
          blocking.push('grid_precision_insufficient');
        const buys = levels.filter((v) => v.lt(price.current)),
          sells = levels.filter((v) => v.gt(price.current));
        if (!buys.length || !sells.length)
          blocking.push('two_sided_levels_required');
        const reserve = capital.mul(policy.reserve_quote_pct).div(100),
          active = capital.minus(reserve),
          purchase = active.div(2),
          buyBudget = active.minus(purchase);
        const baseEstimate = purchase
          .div(price.current)
          .toDecimalPlaces(18, D.ROUND_DOWN);
        const buyPerLevel = buyBudget.div(buys.length),
          sellPerLevel = baseEstimate
            .div(sells.length)
            .toDecimalPlaces(18, D.ROUND_DOWN);
        const maxOrder =
          input.constraints?.max_quote_per_order === undefined
            ? null
            : dec(input.constraints.max_quote_per_order);
        if (
          input.constraints?.max_quote_per_order !== undefined &&
          !maxOrder?.gt(0)
        )
          throw new Error('invalid_input');
        let buyNotional = new D(0),
          sellBase = new D(0);
        for (const [side, sideLevels] of [
          ['buy', buys],
          ['sell', sells],
        ] as const) {
          for (const level of sideLevels) {
            const amount =
              side === 'buy'
                ? buyPerLevel.div(level).toDecimalPlaces(18, D.ROUND_DOWN)
                : sellPerLevel;
            const notional = amount.mul(level);
            if (amount.lte(0)) blocking.push('order_amount_below_precision');
            if (maxOrder && notional.gt(maxOrder))
              blocking.push('max_quote_per_order_exceeded');
            if (side === 'buy') buyNotional = buyNotional.plus(notional);
            else sellBase = sellBase.plus(amount);
            intents.push({
              id: side + '_' + intents.length,
              side,
              trigger: side === 'buy' ? 'cross_down' : 'cross_up',
              price_quote: level.toFixed(),
              amount_base: amount.toFixed(),
              notional_quote: notional.toFixed(),
              condition:
                side === 'buy'
                  ? 'After bootstrap and confirmed free quote balance; execute once on a downward crossing after quote simulation.'
                  : 'After bootstrap and confirmed free WBNB inventory; execute once on an upward crossing after quote simulation.',
            });
          }
        }
        minimumSpread = D.min(
          ...levels
            .slice(1)
            .map((level, i) => level.div(levels[i]).minus(1).mul(10000)),
        );
        if (fee && minimumSpread.lte(fee.mul(2).plus(policy.slippage_bps * 2)))
          blocking.push('grid_spacing_does_not_cover_fee_and_slippage_budget');
        grid = {
          mode: 'arithmetic',
          lower: lo.toFixed(),
          upper: hi.toFixed(),
          spacing: fmt(step),
          levels: levels.map((v) => v.toFixed()),
          range_basis: explicit
            ? 'caller_bounds'
            : 'seven_day_paired_candle_envelope_with_volatility_buffer',
          starts_at: fetchedAt,
          expires_at: new Date(now + HOURS * HOUR).toISOString(),
          execution_model: 'external_keeper_conditional_swaps',
        };
        funding = {
          source: 'caller_quote_budget_not_wallet_balance',
          reserve_quote: reserve.toFixed(),
          initial_base_purchase_quote: purchase.toFixed(),
          initial_base_estimate: baseEstimate.toFixed(),
          buy_budget_quote: buyBudget.toFixed(),
          quote_dust: buyBudget.minus(buyNotional).toFixed(),
          base_dust: baseEstimate.minus(sellBase).toFixed(),
          bootstrap_status:
            'requires_reviewed_swap_then_inventory_confirmation',
        };
      }
    }
    if (blocking.length) {
      grid = null;
      funding = null;
      intents.length = 0;
    }
    return {
      schema_version: 3,
      agent: 'grid-trading',
      execution_status: blocking.length ? 'partial' : 'completed',
      plan_status: blocking.length ? 'hold' : 'proposed',
      transactions_executed: false,
      request: {
        chain_id: input.chainId,
        pair: input.pair,
        venue: input.venue,
        capital_quote: input.capital_quote,
        risk_profile: input.risk_profile,
      },
      policy,
      market_evidence: {
        fetched_at: fetchedAt,
        base_reference_price: price?.base.toFixed() ?? null,
        quote_reference_price: price?.quote.toFixed() ?? null,
        current_price_quote: price ? fmt(price.current) : null,
        base_as_of: price ? iso(price.base_at) : null,
        quote_as_of: price ? iso(price.quote_at) : null,
        price_basis: 'base_reference_price_divided_by_quote_reference_price',
        candle_count: history?.count ?? 0,
        candle_start: history ? iso(history.start) : null,
        candle_end_exclusive: history ? iso(history.end) : null,
        observed_low_quote: history ? fmt(history.low) : null,
        observed_high_quote: history ? fmt(history.high) : null,
        hourly_log_return_stddev: history ? fmt(history.sigma) : null,
      },
      venue_evidence: pool,
      grid,
      funding,
      intents,
      cost_assessment: {
        fee_bps: fee?.toFixed() ?? null,
        fee_source: fee ? 'caller' : 'unavailable',
        round_trip_fee_rate_bps: fee ? fee.mul(2).toFixed() : null,
        minimum_adjacent_gross_spread_bps: minimumSpread
          ? fmt(minimumSpread)
          : null,
        gas_cost_quote: null,
        net_profit: null,
      },
      lifecycle: [
        'Review and simulate the initial USDT-to-WBNB purchase; after an actual fill, resize sell intents to confirmed inventory.',
        'Use an external keeper with fresh quotes and an idempotent crossing trigger. These intents are not native order-book orders or LP ticks.',
        'After a confirmed buy, replenish only the adjacent higher sell with the acquired base; after a confirmed sell, replenish only the adjacent lower buy with available quote. Never reuse committed funds.',
        'Stop creating new intents at expiry or when price exits the range; review remaining inventory without automatic liquidation.',
      ],
      analysis: {
        overview: grid
          ? 'The proposed WBNB/USDT grid requires initial WBNB inventory preparation, then supports buys below and sells above the live reference price.'
          : 'A grid cannot yet be proposed because required market or constraint evidence is unresolved.',
        tradeoffs:
          'Balanced two-sided inventory retains directional WBNB exposure. Fees, gas, price gaps and keeper reliability affect outcomes; the range is not a forecast.',
        generation: 'template',
      },
      blocking_missing_fields: [...new Set(blocking)],
      evidence_gaps: [
        'wallet_balances_not_requested',
        'bootstrap_swap_quote_not_requested',
        ...(fee ? [] : ['pool_fee_tier']),
        'gas_per_execution',
        'keeper_configuration',
        'net_profitability',
      ],
      risk_warnings: [
        'Neutral means a two-sided inventory grid, not a delta-neutral hedge.',
        'PancakeSwap v3 pool evidence does not prove that a keeper, executable route, fee tier or token approval is configured.',
        'The current-price ratio and paired-candle envelope are indicative market references, not an executable venue quote. Refresh and simulate each intended swap.',
        'Reserve USDT is not proof of available BNB for gas. Sell capacity must be recalculated after the bootstrap swap, including fees and slippage.',
      ],
      assumptions: [
        'The caller supplied a quote-capital budget, not verified WBNB inventory; active quote capital is split equally between proposed base acquisition and buy capacity.',
        'Prices and candles use the provider common reference currency; base/quote ratios avoid assuming USDT is exactly one reference unit. Paired high/low divisions are a conservative envelope, not synchronized executable extrema.',
        'Seven-day hourly history shapes a proposed seven-day horizon; it does not predict future bounds. The derived range covers observed paired extrema and the current price with a buffer of twice the hourly log-return standard deviation in price units.',
        'Risk-profile defaults are explicitly listed in policy.defaults_applied. No invented pool fee, tick spacing, stop-loss fill or profit estimate.',
      ],
    };
  }
  function parseNarrative(raw: unknown, result: ReturnType<typeof analyze>) {
    if (typeof raw !== 'string') return null;
    let value: Row;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
    if (
      !rec(value) ||
      Object.keys(value).sort().join(',') !== 'overview,tradeoffs'
    )
      return null;
    for (const key of ['overview', 'tradeoffs']) {
      if (
        typeof value[key] !== 'string' ||
        value[key].length < 25 ||
        value[key].length > 1200
      )
        return null;
      const prose = value[key].replace(/PancakeSwap [vV]3/g, 'PancakeSwap');
      if (
        /[0-9%${}]|\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|guaranteed|risk.free|delta.neutral|profitab(?:le|ility)|orders? (?:placed|executed|filled)|tick spacing)\b/i.test(
          prose,
        )
      )
        return null;
    }
    if (result.plan_status === 'proposed' && !/WBNB/.test(value.overview))
      return null;
    return {
      overview: value.overview,
      tradeoffs: value.tradeoffs,
      generation: 'model_generated',
    };
  }
  return { resolve, analyze, parseNarrative };
}
