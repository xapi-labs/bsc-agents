import Decimal from 'decimal.js';

/** Self-contained factory: the exact same Decimal code runs in Node and Worker. */
export function createLiquidityAnalysisRuntime(DecimalType: typeof Decimal) {
  const D = DecimalType.clone({
    precision: 80,
    rounding: DecimalType.ROUND_DOWN,
  });
  type Row = Record<string, any>;
  const BASE = '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c';
  const QUOTE = '0x55d398326f99059ff775485246999027b3197955';
  const norm = (v: unknown) =>
    typeof v === 'string' ? v.toLowerCase().trim() : '';
  const rec = (v: unknown): v is Row =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  const arr = (v: unknown): Row[] => (Array.isArray(v) ? v.filter(rec) : []);
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
  function dec(v: unknown): Decimal | null {
    if (
      (typeof v !== 'string' && typeof v !== 'number') ||
      String(v).length > 80 ||
      !/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(String(v))
    )
      return null;
    try {
      const d = new D(v);
      return d.isFinite() && d.gte(0) && d.lte(Number.MAX_SAFE_INTEGER)
        ? d
        : null;
    } catch {
      return null;
    }
  }
  const fmt = (v: Decimal) => v.toDecimalPlaces(18).toFixed();
  const numberText = (v: unknown) => {
    const n = dec(v);
    return n ? fmt(n) : null;
  };
  const iso = (v: unknown) =>
    typeof v === 'number' &&
    Number.isSafeInteger(v) &&
    v > 0 &&
    v < 8640000000000000
      ? new Date(v).toISOString()
      : null;
  const fresh = (v: unknown, now: number) =>
    iso(v) !== null && Number(v) <= now + 60000 && now - Number(v) <= 300000;
  const valid = (v: unknown, now: number): v is Row =>
    rec(v) && v.code === 0 && v.success === true && fresh(v.timestamp, now);
  function resolve(input: Row) {
    if (
      input.chainId !== '56' ||
      !/^0x[0-9a-f]{40}$/.test(norm(input.walletAddress)) ||
      (input.protocol !== undefined &&
        norm(input.protocol) !== 'pancakeswap v3') ||
      (input.pool !== undefined && input.pool !== 'WBNB/USDT')
    )
      throw new Error('invalid_input');
    return {
      chain_id: '56',
      wallet_address: input.walletAddress,
      protocol: 'PancakeSwap v3',
      pair: 'WBNB/USDT',
    };
  }
  function select(input: Row, raw: unknown, now: number) {
    resolve(input);
    const unavailable = { status: 'unavailable', matches: [] as Row[] };
    if (
      !valid(raw, now) ||
      !rec(raw.data) ||
      !Array.isArray(raw.data.addressList)
    )
      return unavailable;
    const addresses = raw.data.addressList.filter(
      (v: Row) => rec(v) && norm(v.address) === norm(input.walletAddress),
    );
    if (addresses.length !== 1 || !Array.isArray(addresses[0].protocolList))
      return unavailable;
    const matches: Row[] = [];
    const selector = input.positionSelector ?? {};
    for (const protocol of addresses[0].protocolList) {
      if (!rec(protocol)) return unavailable;
      if (
        String(protocol.binanceChainId) !== '56' ||
        norm(protocol.defiProtocolId) !== 'pancakeswap3'
      )
        continue;
      if (!Array.isArray(protocol.poolList)) return unavailable;
      for (const pool of protocol.poolList) {
        if (!rec(pool) || !Array.isArray(pool.positionCollectionList))
          return unavailable;
        if (pool.poolType !== 'Liquidity Pool') continue;
        if (!/^0x[0-9a-f]{40}$/.test(norm(pool.poolCa))) return unavailable;
        for (const collection of pool.positionCollectionList) {
          if (!rec(collection) || !Array.isArray(collection.positionList))
            return unavailable;
          for (const pos of collection.positionList) {
            if (!rec(pos)) return unavailable;
            const tokens = arr(pos.tokenList?.supply);
            // Contract addresses, never pair labels or native-BNB aliases, select this LP.
            if (
              tokens.length !== 2 ||
              ![BASE, QUOTE].every(
                (a) =>
                  tokens.filter((t) => norm(t.tokenAddress) === a).length === 1,
              )
            )
              continue;
            if (!str(pos.positionId)) return unavailable;
            const nftId =
              str(pos.positionDetail?.positionIndex) ??
              str(pos.positionDetail?.nftId)?.replace(/^#/, '') ??
              null;
            const ids: string[] = Array.isArray(pos.investmentIds)
              ? pos.investmentIds.filter(
                  (v: unknown) =>
                    typeof v === 'string' && /^[0-9a-f]{64}$/i.test(v),
                )
              : [];
            if (
              selector.poolAddress &&
              norm(selector.poolAddress) !== norm(pool.poolCa)
            )
              continue;
            if (selector.positionId && selector.positionId !== pos.positionId)
              continue;
            if (selector.nftId && selector.nftId.replace(/^#/, '') !== nftId)
              continue;
            if (
              selector.investmentId &&
              !ids.some((id) => norm(id) === norm(selector.investmentId))
            )
              continue;
            matches.push({ pool, pos, tokens, nftId, ids });
          }
        }
      }
    }
    return {
      status:
        matches.length === 1
          ? 'matched'
          : matches.length
            ? 'ambiguous'
            : 'no_match_reported',
      matches,
    };
  }
  function rangeAtTicks(low: unknown, high: unknown, token0: Row, token1: Row) {
    const tick = (v: unknown) =>
      (typeof v === 'string' && /^-?\d{1,6}$/.test(v)) ||
      (typeof v === 'number' && Number.isInteger(v));
    if (
      !tick(low) ||
      !tick(high) ||
      Number(low) < -887272 ||
      Number(high) > 887272 ||
      Number(low) >= Number(high)
    )
      return null;
    const decimals0 = Number(token0.tokenDecimals),
      decimals1 = Number(token1.tokenDecimals);
    if (
      token0.tokenDecimals == null ||
      token1.tokenDecimals == null ||
      !Number.isInteger(decimals0) ||
      !Number.isInteger(decimals1) ||
      decimals0 < 0 ||
      decimals0 > 36 ||
      decimals1 < 0 ||
      decimals1 > 36
    )
      return null;
    const factor = new D(10).pow(decimals0 - decimals1);
    const lowerRatio = new D('1.0001').pow(Number(low)).mul(factor);
    const upperRatio = new D('1.0001').pow(Number(high)).mul(factor);
    // Factory sorts token addresses: this pair is USDT(token0)/WBNB(token1).
    if (
      norm(token0.tokenAddress) !== QUOTE ||
      norm(token1.tokenAddress) !== BASE
    )
      return null;
    const lower = fmt(new D(1).div(upperRatio)),
      upper = fmt(new D(1).div(lowerRatio));
    return new D(lower).gt(0) && new D(upper).gt(lower)
      ? { lower, upper, unit: 'USDT_per_WBNB' }
      : null;
  }
  const state = (price: Decimal, range: Row) =>
    price.lte(range.lower)
      ? 'below_range'
      : price.gt(range.upper)
        ? 'above_range'
        : 'in_range';
  function analyze(input: Row, raw: Row, fetchedAt: string): Row {
    const now = Date.parse(fetchedAt);
    const selection = select(input, raw.positions, now);
    const identity = (m: Row) => ({
      pool_address: norm(m.pool.poolCa),
      position_id: m.pos.positionId,
      nft_id: m.nftId,
    });
    const result: Row = {
      schema_version: 3,
      agent: 'liquidity-rebalancing',
      execution_status: 'partial',
      decision: 'insufficient_evidence',
      transactions_executed: false,
      request: resolve(input),
      selection: {
        status: selection.status,
        candidates:
          selection.status === 'ambiguous'
            ? selection.matches.map(identity)
            : [],
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
        summary: 'The existing position cannot yet be assessed reliably.',
        comparison: {
          keep_range: 'Wait for usable position evidence.',
          recenter:
            'Do not reset or create a position based on missing evidence.',
        },
        generation: 'template',
      },
      evidence: {
        fetched_at: fetchedAt,
        positions_response_at: iso(raw.positions?.timestamp),
        position_as_of: null,
        pool_state_as_of: null,
      },
      blocking_missing_fields: [] as string[],
      evidence_gaps: [
        'position_snapshot_time',
        'pool_spot_and_snapshot_time',
        'position_fee_earnings_history',
        'reset_transaction_gas_and_swap_quote',
      ],
      execution_prerequisites: [
        'Refresh the NFT ownership, liquidity, pool slot0 and tick spacing at a common block.',
        'Simulate removal, fee collection, any inventory swap and mint with actual slippage and gas limits.',
        'Confirm wallet gas balance and explicit transaction authorization.',
      ],
      next_steps: [] as string[],
    };
    if (selection.status !== 'matched') {
      if (selection.status === 'no_match_reported') {
        result.execution_status = 'completed';
        result.decision = 'no_matching_position';
        result.assessment.reason = 'no_exact_position_in_provider_response';
        result.analysis.summary =
          'The provider response reports no matching PancakeSwap v3 WBNB/USDT position for this wallet and selector.';
        result.evidence_gaps.push(
          'provider_coverage_is_not_proof_of_onchain_absence',
        );
        result.next_steps.push(
          'Verify the wallet or selector and provider coverage if a position is expected; no new position is proposed.',
        );
      } else if (selection.status === 'ambiguous') {
        result.execution_status = 'needs_input';
        result.decision = 'select_position';
        result.assessment.reason = 'multiple_exact_pair_positions';
        result.blocking_missing_fields.push('positionSelector');
        result.analysis.summary =
          'Multiple matching liquidity positions were returned; select the NFT or position to assess.';
        result.next_steps.push(
          'Choose a listed nft_id or position_id in positionSelector.',
        );
      } else {
        result.blocking_missing_fields.push('live_position_evidence');
        result.next_steps.push(
          'Retry the live position lookup; a failed response does not mean the wallet has no position.',
        );
      }
      return result;
    }
    const m = selection.matches[0];
    const sorted = [...m.tokens].sort((a, b) =>
      norm(a.tokenAddress).localeCompare(norm(b.tokenAddress)),
    );
    const range = rangeAtTicks(
      m.pos.positionDetail?.tickLower,
      m.pos.positionDetail?.tickUpper,
      sorted[0],
      sorted[1],
    );
    const values = m.tokens.map((t: Row) => dec(t.tokenValue));
    const total = values.every((v: Decimal | null) => v !== null)
      ? values.reduce((a: Decimal, b: Decimal) => a.plus(b), new D(0))
      : null;
    result.position = {
      ...identity(m),
      investment_ids: m.ids,
      reported_value_usd: numberText(m.pos.positionValue),
      tokens: m.tokens.map((t: Row) => ({
        address: norm(t.tokenAddress),
        symbol: norm(t.tokenAddress) === BASE ? 'WBNB' : 'USDT',
        amount: numberText(t.tokenAmount) ?? '',
        reported_value_usd: numberText(t.tokenValue),
        share_of_reported_supply_pct:
          total?.gt(0) && dec(t.tokenValue)
            ? fmt(dec(t.tokenValue)!.div(total).mul(100))
            : null,
      })),
      reported_unclaimed_rewards: arr(m.pos.tokenList?.reward).map((t) => ({
        address: norm(t.tokenAddress),
        symbol: str(t.tokenSymbol) ?? 'unknown',
        amount: numberText(t.tokenAmount),
        reported_value_usd: numberText(t.tokenValue),
      })),
      api_active:
        typeof m.pos.positionDetail?.active === 'boolean'
          ? m.pos.positionDetail.active
          : null,
      tick_lower: range ? Number(m.pos.positionDetail.tickLower) : null,
      tick_upper: range ? Number(m.pos.positionDetail.tickUpper) : null,
      token0_address: norm(sorted[0].tokenAddress),
      token1_address: norm(sorted[1].tokenAddress),
      range,
    };
    if (!range)
      result.blocking_missing_fields.push(
        'valid_position_ticks_and_token_decimals',
      );
    if (result.position.tokens.some((t: Row) => !t.amount) || !total?.gt(0))
      result.blocking_missing_fields.push('valid_position_inventory');
    const rewardValues = arr(m.pos.tokenList?.reward).map((t) =>
      dec(t.tokenValue),
    );
    const rewards = rewardValues.every((v) => v !== null)
      ? rewardValues.reduce(
          (a: Decimal, b: Decimal | null) => a.plus(b!),
          new D(0),
        )
      : null;
    if (total && dec(m.pos.positionValue)) {
      const principalDifference = total.minus(m.pos.positionValue).abs();
      const combinedDifference = rewards
        ? total.plus(rewards).minus(m.pos.positionValue).abs()
        : principalDifference;
      if (
        D.min(principalDifference, combinedDifference).gt(
          D.max('0.01', total.mul('0.001')),
        )
      )
        result.blocking_missing_fields.push('consistent_position_valuation');
    }
    const priceRows =
      valid(raw.prices, now) && Array.isArray(raw.prices.data)
        ? raw.prices.data
        : [];
    const prices = [BASE, QUOTE].map((a) =>
      priceRows.filter(
        (p: Row) =>
          rec(p) &&
          String(p.binanceChainId) === '56' &&
          norm(p.tokenContractAddress) === a,
      ),
    );
    let price: Decimal | null = null;
    if (
      prices.every(
        (p) =>
          p.length === 1 && dec(p[0].price)?.gt(0) && fresh(p[0].time, now),
      ) &&
      Math.abs(prices[0][0].time - prices[1][0].time) <= 60000
    ) {
      price = dec(prices[0][0].price)!.div(dec(prices[1][0].price)!);
      result.assessment.reference_price_quote = fmt(price);
      result.assessment.reference_as_of = iso(
        Math.min(prices[0][0].time, prices[1][0].time),
      );
    } else
      result.blocking_missing_fields.push('fresh_exact_pair_reference_prices');
    const detail =
      valid(raw.detail, now) && rec(raw.detail.data) ? raw.detail.data : null;
    if (
      detail &&
      String(detail.binanceChainId) === '56' &&
      norm(detail.defiProtocolId) === 'pancakeswap3' &&
      detail.investType === 'LiquidityPool' &&
      norm(detail.poolAddress) === norm(m.pool.poolCa) &&
      m.ids.includes(detail.investmentId)
    ) {
      const fee = dec(detail.feeRate);
      const positionFee = dec(m.pool.poolDetail?.feeTier);
      if (fee && positionFee && !fee.eq(positionFee.div(1000000)))
        result.blocking_missing_fields.push('consistent_pool_fee_evidence');
      const spacing = Number(m.pool.poolDetail?.tickSpacing);
      result.pool_evidence = {
        investment_id: detail.investmentId,
        pool_address: norm(detail.poolAddress),
        tvl_usd: numberText(detail.tvl),
        fee_rate: fee && fee.lt(1) ? fmt(fee) : null,
        fee_bps: fee && fee.lt(1) ? fmt(fee.mul(10000)) : null,
        product_rate_type: ['APR', 'APY'].includes(detail.apyType)
          ? detail.apyType
          : null,
        product_rate_pct:
          ['APR', 'APY'].includes(detail.apyType) && dec(detail.apyBps)
            ? fmt(dec(detail.apyBps)!.div(100))
            : null,
        rate_scope: 'product_level_not_this_nft_realized_return',
        tick_spacing:
          Number.isInteger(spacing) && spacing > 0 && spacing <= 16384
            ? spacing
            : null,
        tick_spacing_source: 'position_api_or_unavailable',
        detail_response_at: iso(raw.detail.timestamp),
      };
      if (!result.pool_evidence.tick_spacing)
        result.evidence_gaps.push('pool_tick_spacing');
      if (
        range &&
        result.pool_evidence.tick_spacing &&
        (Number(m.pos.positionDetail.tickLower) % spacing !== 0 ||
          Number(m.pos.positionDetail.tickUpper) % spacing !== 0)
      )
        result.blocking_missing_fields.push(
          'position_tick_spacing_consistency',
        );
    } else result.evidence_gaps.push('exact_pool_investment_detail');
    if (!result.pool_evidence?.fee_rate)
      result.evidence_gaps.push('verified_pool_fee_rate');
    if (price && range) {
      const a = result.assessment;
      a.range_state = state(price, range);
      if (a.range_state === 'in_range') {
        a.downside_to_lower_pct = fmt(
          price.minus(range.lower).div(price).mul(100),
        );
        a.upside_to_upper_pct = fmt(
          new D(range.upper).minus(price).div(price).mul(100),
        );
        a.nearest_boundary_distance_pct = fmt(
          D.min(a.downside_to_lower_pct, a.upside_to_upper_pct),
        );
      }
      for (const [base, quote] of [
        [-10, 0],
        [10, 0],
        [-10, 5],
      ]) {
        const shocked = price
          .mul(new D(1).plus(new D(base).div(100)))
          .div(new D(1).plus(new D(quote).div(100)));
        result.scenarios.push({
          base_change_pct: String(base),
          quote_change_pct: String(quote),
          reference_price_quote: fmt(shocked),
          range_state: state(shocked, range),
        });
      }
      if (!result.blocking_missing_fields.length) {
        result.execution_status = 'completed';
        const review =
          a.range_state !== 'in_range' ||
          new D(a.nearest_boundary_distance_pct).lte(a.boundary_review_pct);
        result.decision = review ? 'review_rebalance' : 'keep_range';
        a.reason = review
          ? 'reference_outside_or_near_existing_boundary'
          : 'reference_inside_range_and_reset_benefit_unproven';
        if (review) {
          const factor = new D(range.upper).div(range.lower).sqrt();
          result.conditional_rebalance = {
            range: {
              lower: fmt(price.div(factor)),
              upper: fmt(price.mul(factor)),
              unit: 'USDT_per_WBNB',
            },
            range_basis: 'recenter_preserving_existing_log_width',
            target_tick_lower: null,
            target_tick_upper: null,
            executable: false,
          };
        }
        result.analysis = {
          summary: review
            ? 'The reference price is outside or near the existing range boundary; review a reset after checking the pool state and transaction costs.'
            : 'Retain the current range for now: the reference price remains inside it and there is no verified incremental benefit from paying to reset.',
          comparison: {
            keep_range:
              'Avoids reset costs and preserves the existing inventory; range exit would stop active fee earning until the pool price returns.',
            recenter:
              'Moves exposure around the reference price and may require an inventory swap; it changes directional exposure without proving higher net fee income.',
          },
          generation: 'template',
        };
        result.next_steps.push(
          review
            ? 'Check pool spot and compare simulated reset costs before deciding whether to rebalance.'
            : 'Reassess when the reference price approaches either boundary; a review threshold is not an automatic trading trigger.',
        );
      }
    }
    if (result.blocking_missing_fields.length) {
      result.assessment.reason = 'required_evidence_missing_or_conflicting';
      result.next_steps.push(
        'Refresh or reconcile the listed evidence before choosing a range action.',
      );
    }
    return result;
  }
  function parseNarrative(content: unknown, result: Row): Row | null {
    if (typeof content !== 'string') return null;
    let value: Row;
    try {
      value = JSON.parse(content);
    } catch {
      return null;
    }
    if (
      !rec(value) ||
      Object.keys(value).sort().join(',') !== 'comparison,summary' ||
      !rec(value.comparison) ||
      Object.keys(value.comparison).sort().join(',') !== 'keep_range,recenter'
    )
      return null;
    const fields = [
      value.summary,
      value.comparison.keep_range,
      value.comparison.recenter,
    ];
    if (
      fields.some(
        (v) => typeof v !== 'string' || v.length < 20 || v.length > 1000,
      )
    )
      return null;
    const prose = fields
      .join(' ')
      .replace(/PancakeSwap v3/g, 'PancakeSwap')
      .replace(/\b(upper|lower) one\b/gi, '$1 boundary')
      .replace(/\bnot guaranteed\b/gi, 'uncertain');
    if (
      /\d|%|\b(?:one|two|three|four|five|ten|fifty|hundred|guaranteed|optimal|maximi[sz]e|executed|approved|risk.free|delta.neutral)\b/i.test(
        prose,
      )
    )
      return null;
    if (
      result.decision === 'keep_range' &&
      /\b(?:must|should|immediately)\s+(?:rebalance|reset|recenter)/i.test(
        prose,
      )
    )
      return null;
    if (new Set(fields.map((v) => v.trim().toLowerCase())).size !== 3)
      return null;
    return { ...value, generation: 'model_generated' };
  }
  return { resolve, select, rangeAtTicks, analyze, parseNarrative };
}
