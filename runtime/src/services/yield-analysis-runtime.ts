import Decimal from 'decimal.js';

/** Pure evidence mapping; serialized into the Worker, with no host dependencies. */
export function createYieldAnalysisRuntime(DecimalType: typeof Decimal) {
  const D = DecimalType.clone({
    precision: 80,
    rounding: DecimalType.ROUND_DOWN,
  });
  type Row = Record<string, any>;
  const record = (v: unknown): v is Row =>
    v !== null && typeof v === 'object' && !Array.isArray(v);
  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim() : null;
  const lower = (v: unknown) => str(v)?.toLowerCase() ?? '';
  const decimal = (v: unknown): Decimal | null => {
    if (
      (typeof v !== 'string' && typeof v !== 'number') ||
      !/^\d+(?:\.\d+)?$/.test(String(v)) ||
      String(v).length > 80
    )
      return null;
    const n = new D(v);
    return n.isFinite() && n.gte(0) && n.lte(Number.MAX_SAFE_INTEGER)
      ? n
      : null;
  };
  const fmt = (n: Decimal) => n.toDecimalPlaces(12).toFixed();
  const timestamp = (v: unknown) =>
    typeof v === 'number' &&
    Number.isSafeInteger(v) &&
    v > 0 &&
    v < 8640000000000000
      ? new Date(v).toISOString()
      : null;
  const fresh = (v: unknown, now: string) =>
    timestamp(v) !== null && Math.abs(Date.parse(now) - Number(v)) <= 300000;
  const unwrap = (response: unknown): Row | null =>
    record(response) &&
    response.code === 0 &&
    response.success === true &&
    record(response.data)
      ? response
      : null;
  function listing(response: unknown): Row[] {
    const data = unwrap(response)?.data;
    return Array.isArray(data?.list)
      ? data.list.filter(
          (r: unknown) =>
            record(r) &&
            /^[a-f0-9]{64}$/i.test(String(r.investmentId)) &&
            str(r.defiProtocolId),
        )
      : [];
  }
  function shortlist(responses: unknown[], chainId: string): Row[] {
    const all = responses
      .flatMap(listing)
      .filter((r) => String(r.binanceChainId) === chainId);
    const unique = [...new Map(all.map((r) => [r.investmentId, r])).values()];
    // One Earn product per protocol first, then other Earn products, then LP.
    // The discovery order is API headline-rate-descending; it is not a risk ranking.
    const seen = new Set<string>();
    const first = unique
      .filter((r) => r.investType === 'Earn')
      .filter((r) => {
        if (seen.has(lower(r.defiProtocolId))) return false;
        seen.add(lower(r.defiProtocolId));
        return true;
      });
    const firstIds = new Set(first.map((r) => r.investmentId));
    return [
      ...first,
      ...unique.filter(
        (r) => r.investType === 'Earn' && !firstIds.has(r.investmentId),
      ),
      ...unique.filter((r) => r.investType !== 'Earn'),
    ].slice(0, 8);
  }
  function analyze(
    input: Row,
    lists: unknown[],
    details: Record<string, unknown>,
    fetchedAt: string,
  ) {
    if (!decimal(input.amount)?.gt(0)) throw new Error('invalid_input');
    const constraints = record(input.constraints)
      ? { ...input.constraints }
      : {};
    const selected = shortlist(lists, input.chainId);
    const candidates = selected.map((row) => {
      const list = lists
        .map(unwrap)
        .find((r) =>
          listing(r).some((x) => x.investmentId === row.investmentId),
        );
      const detail = unwrap(details[row.investmentId]);
      const value = detail?.data;
      const matched =
        !!value &&
        value.investmentId === row.investmentId &&
        lower(value.defiProtocolId) === lower(row.defiProtocolId) &&
        String(value.binanceChainId) === input.chainId;
      const source = matched ? value : row;
      const assets =
        matched && Array.isArray(value.assetTokenList)
          ? value.assetTokenList
          : [];
      const principalVerified =
        matched &&
        assets.length === 1 &&
        lower(assets[0].tokenAddress) === lower(input.assetTokenAddress) &&
        lower(assets[0].tokenSymbol) === lower(input.asset) &&
        Array.isArray(value.lpTokenList) &&
        value.lpTokenList.length === 0;
      // Known BSC USDT address, not a ticker-only stablecoin classification.
      const stableVerified =
        input.chainId === '56' &&
        lower(input.assetTokenAddress) ===
          '0x55d398326f99059ff775485246999027b3197955' &&
        lower(input.asset) === 'usdt';
      const rateType = ['APY', 'APR'].includes(source.apyType)
        ? source.apyType
        : null;
      const bps = decimal(source.apyBps);
      const rate = rateType && bps !== null ? bps.div(100) : null;
      const tvl = decimal(source.tvl);
      const lock = matched ? decimal(value.lockDays) : null;
      const rewards =
        matched && Array.isArray(value.rewardTokenList)
          ? value.rewardTokenList.map((t: Row) => ({
              address: str(t.tokenAddress),
              symbol: str(t.tokenSymbol),
            }))
          : null;
      const gaps = [
        'yield_history',
        'base_vs_incentive_yield',
        'withdrawal_liquidity',
        'product_as_of',
        'protocol_risk_assessment',
      ];
      const violations: string[] = [];
      if (!matched) gaps.push('investment_detail');
      if (!principalVerified) gaps.push('direct_principal_identity');
      if (input.asset_universe === 'stable_only' && !stableVerified)
        gaps.push('stable_asset_identity');
      if (!rate) gaps.push('typed_yield_rate');
      if (!tvl) gaps.push('tvl_usd');
      if (lock === null) gaps.push('lock_days');
      if (rewards === null) gaps.push('reward_tokens');
      const rewardsInAsset =
        rewards !== null &&
        rewards.every(
          (t: Row) =>
            lower(t.address) === lower(input.assetTokenAddress) &&
            lower(t.symbol) === lower(input.asset),
        );
      if (!rewardsInAsset) gaps.push('reward_valuation');
      if (!matched || typeof value.investable !== 'boolean')
        gaps.push('investability');
      if (
        !fresh(list?.timestamp, fetchedAt) ||
        !fresh(detail?.timestamp, fetchedAt)
      )
        gaps.push('fresh_response');
      if (constraints.max_risk_score !== undefined)
        gaps.push('comparable_risk_score');
      if (constraints.gas_budget_usd !== undefined)
        gaps.push('transaction_gas_estimate');
      if (matched && value.investable === false)
        violations.push('not_investable');
      if (
        lock !== null &&
        constraints.max_lock_days !== undefined &&
        lock.gt(constraints.max_lock_days)
      )
        violations.push('max_lock_days_exceeded');
      if (
        tvl !== null &&
        constraints.min_tvl_usd !== undefined &&
        tvl.lt(constraints.min_tvl_usd)
      )
        violations.push('min_tvl_usd_not_met');
      const blocking = [...violations];
      if (constraints.max_lock_days !== undefined && lock === null)
        blocking.push('requested_lock_limit_unverified');
      if (constraints.max_risk_score !== undefined)
        blocking.push('requested_risk_score_unverified');
      if (constraints.gas_budget_usd !== undefined)
        blocking.push('requested_gas_budget_unverified');
      const comparable =
        matched &&
        principalVerified &&
        source.investType === 'Earn' &&
        rewardsInAsset &&
        value.investable === true &&
        rate !== null &&
        rate.gt(0) &&
        tvl !== null &&
        tvl.gt(0) &&
        violations.length === 0 &&
        !gaps.includes('fresh_response') &&
        !gaps.includes('stable_asset_identity');
      return {
        investment_id: row.investmentId,
        protocol_id: row.defiProtocolId,
        protocol: str(source.protocolName) ?? row.defiProtocolId,
        market: str(source.investmentName) ?? '',
        investment_type: str(source.investType) ?? '',
        rate_type: rateType,
        rate_pct: rate ? fmt(rate) : null,
        tvl_usd: tvl ? fmt(tvl) : null,
        lock_days: lock ? fmt(lock) : null,
        reward_tokens: rewards,
        investable:
          matched && typeof value.investable === 'boolean'
            ? value.investable
            : null,
        principal_verified: principalVerified,
        detail_verified: matched,
        comparable,
        eligible_for_proposal: comparable && blocking.length === 0,
        blocking_reasons: blocking,
        constraint_violations: violations,
        evidence_gaps: gaps,
        evidence: {
          list_response_at: timestamp(list?.timestamp),
          detail_response_at: timestamp(detail?.timestamp),
          product_as_of: null,
        },
      };
    });
    // Greedy allocation maximizes the current same-basis headline quote under
    // one aggregated cap per protocol. No risk score or historical-rate gate.
    const eligible = candidates
      .filter((c) => c.eligible_for_proposal)
      .sort(
        (a, b) =>
          new D(b.rate_pct!).cmp(a.rate_pct!) ||
          a.investment_id.localeCompare(b.investment_id),
      );
    const protocols = new Set<string>();
    const best = eligible.filter((c) => {
      const id = lower(c.protocol_id);
      if (protocols.has(id)) return false;
      protocols.add(id);
      return true;
    });
    const cap = decimal(constraints.max_protocol_share_pct);
    const blocking: string[] = [];
    if (cap === null || cap.gt(100))
      blocking.push('protocol_concentration_limit');
    else if (cap.eq(0)) blocking.push('protocol_concentration_cap_zero');
    const rateTypes = new Set(best.map((c) => c.rate_type));
    if (rateTypes.size > 1) blocking.push('comparable_rate_basis');
    if (best.length === 0) blocking.push('no_verified_eligible_products');
    let remaining = new D(100);
    const allocation: Row[] = [];
    if (blocking.length === 0) {
      for (const c of best) {
        if (remaining.eq(0)) break;
        const share = D.min(cap!, remaining);
        remaining = remaining.minus(share);
        allocation.push({
          investment_id: c.investment_id,
          protocol_id: c.protocol_id,
          protocol: c.protocol,
          asset: input.asset,
          share_pct: share.toFixed(),
          amount: new D(input.amount).mul(share).div(100).toFixed(),
          rate_type: c.rate_type,
          rate_pct: c.rate_pct,
        });
      }
    }
    const annual = allocation.reduce<Decimal>(
      (n, leg) => n.plus(new D(leg.amount).mul(leg.rate_pct).div(100)),
      new D(0),
    );
    const allocated = allocation.reduce<Decimal>(
      (n, leg) => n.plus(leg.amount),
      new D(0),
    );
    const successful = lists.filter((r) => unwrap(r) !== null);
    const found = successful.flatMap(listing);
    const truncated =
      successful.some((r) => {
        const e = unwrap(r)!;
        return Number(e.data.total) > listing(r).length;
      }) || new Set(found.map((r) => r.investmentId)).size > selected.length;
    const gaps = [...new Set(candidates.flatMap((c) => c.evidence_gaps))];
    if (successful.length < 2) gaps.push('discovery_incomplete');
    if (!found.length) gaps.push('investment_discovery');
    if (cap === null) gaps.push('protocol_concentration_limit');
    return {
      schema_version: 3,
      agent: 'yield-optimisation',
      execution_status: allocation.length > 0 ? 'completed' : 'partial',
      allocation_status: allocation.length > 0 ? 'proposed' : 'hold',
      transactions_executed: false,
      request: {
        chain_id: input.chainId,
        asset: input.asset,
        asset_token_address: lower(input.assetTokenAddress),
        amount: input.amount,
        risk_profile: input.risk_profile,
        asset_universe: input.asset_universe ?? null,
        constraints,
      },
      candidates,
      allocation,
      allocation_summary: {
        basis: 'highest_verified_current_quote_with_protocol_cap',
        rate_type: allocation[0]?.rate_type ?? null,
        weighted_headline_rate_pct: allocation.length
          ? fmt(annual.div(input.amount).mul(100))
          : null,
        annual_gross_amount: allocation.length ? fmt(annual) : null,
      },
      unallocated_amount: new D(input.amount).minus(allocated).toFixed(),
      blocking_missing_fields: blocking,
      safety_checks: [
        'exact_chain_and_token_identity',
        'fresh_successful_product_details',
        'api_investable_true',
        'positive_rate_and_product_tvl',
        'direct_same_asset_principal_and_rewards',
        'aggregated_protocol_concentration_cap',
        'explicit_user_constraints',
      ],
      analysis: {
        overview: allocation.length
          ? `The proposal prioritizes ${allocation.map((l) => l.protocol).join(' and ')} by verified current quoted yield within the supplied protocol limit.`
          : 'No allocation proposal satisfies the available evidence and explicit constraints.',
        tradeoffs:
          'Protocol concentration is limited, but smart-contract, token depeg and withdrawal risks remain. Quoted yield can change; product TVL is not a safety rating.',
        generation: 'template',
      },
      coverage: {
        fetched_at: fetchedAt,
        discovery_pages: lists.length,
        discovered_count: found.length,
        details_requested: selected.length,
        truncated,
        scope:
          'First headline-rate-descending page of Earn and LiquidityPool products for the exact token, up to eight details; routing covers direct same-token Earn only; highest means among verified eligible products in this search. Swaps and multi-asset LP strategies are not evaluated.',
      },
      evidence_gaps: [...new Set(gaps)],
      next_steps: [
        'Refresh rates and details, check available wallet funds and transaction costs, then simulate a proposed deposit before signing.',
      ],
      assumptions: [
        'Allocation is an unsigned proposal. Amounts and unallocated capital describe the plan, not a transfer of funds.',
        'Reported APY includes compounding as defined by the provider; APR is not converted to APY. Annual gross amounts assume an unchanged headline rate and asset denomination, before fees, gas and taxes, with no return assigned to unallocated funds.',
        'History and lock evidence are not required unless a corresponding constraint is explicitly supplied. Missing history or lock terms do not block current-yield routing and do not imply stable returns or instant withdrawal.',
      ],
    };
  }
  function narrativeContext(result: ReturnType<typeof analyze>) {
    const references: Record<string, string> = {};
    result.candidates
      .filter((c) => c.comparable)
      .forEach((c, i) => {
        references[`product_${i + 1}`] =
          `${c.protocol} quotes ${c.rate_pct}% ${c.rate_type} with reported TVL of $${c.tvl_usd}`;
      });
    return {
      request: result.request,
      candidates: result.candidates,
      allocation: result.allocation,
      allocation_summary: result.allocation_summary,
      blocking_missing_fields: result.blocking_missing_fields,
      safety_checks: result.safety_checks,
      evidence_gaps: result.evidence_gaps,
      references,
    };
  }
  function parseNarrative(raw: unknown, result: ReturnType<typeof analyze>) {
    if (typeof raw !== 'string') return null;
    let data: Row;
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
    if (
      !record(data) ||
      Object.keys(data).sort().join(',') !== 'overview,tradeoffs'
    )
      return null;
    const refs = narrativeContext(result).references;
    const used = new Set<string>();
    const render = (value: unknown) => {
      if (typeof value !== 'string' || value.length < 30 || value.length > 1800)
        return null;
      let prose: string = value;
      // Canonicalize only an exact repeat of the verified requested lock limit.
      // Other model numbers remain forbidden, including an incorrect lock limit.
      const lockLimit = result.request.constraints.max_lock_days;
      const words = [
        'zero',
        'one',
        'two',
        'three',
        'four',
        'five',
        'six',
        'seven',
        'eight',
        'nine',
        'ten',
      ];
      if (Number.isInteger(lockLimit) && lockLimit >= 0 && lockLimit <= 10) {
        prose = prose
          .split(words[lockLimit] + '-day lock limit')
          .join('requested lock limit');
        prose = prose
          .split(String(lockLimit) + '-day lock limit')
          .join('requested lock limit');
      }
      let invalid = false;
      let stripped = prose.replace(/\{\{([a-z0-9_]+)\}\}/g, (_, key) => {
        if (!refs[key] || used.has(key)) invalid = true;
        used.add(key);
        return '';
      });
      for (const c of result.candidates)
        stripped = stripped.split(c.protocol).join('');
      if (
        invalid ||
        /[0-9%${}]|\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|billion)\b/i.test(
          stripped,
        )
      )
        return null;
      if (
        /\b(guaranteed|risk.free|safest|safe investment|instant withdrawals|no lock|zero lock|execute now|less proven|more proven|established|matur(?:e|ity)|battle.tested|smaller protocol|larger protocol|protocol.s TVL|less liquid|more liquid|higher liquidity|lower liquidity|more secure|less secure|safer|riskier)\b/i.test(
          stripped,
        )
      )
        return null;
      return prose.replace(/\{\{([a-z0-9_]+)\}\}/g, (_, key) => refs[key]);
    };
    const overview = render(data.overview),
      tradeoffs = render(data.tradeoffs);
    if (
      !overview ||
      !tradeoffs ||
      overview.toLowerCase() === tradeoffs.toLowerCase() ||
      (result.candidates.some((c) => c.comparable) &&
        !result.candidates.some(
          (c) => c.comparable && (overview + tradeoffs).includes(c.protocol),
        ))
    )
      return null;
    return { overview, tradeoffs, generation: 'model_generated' };
  }
  return { analyze, listing, shortlist, narrativeContext, parseNarrative };
}
