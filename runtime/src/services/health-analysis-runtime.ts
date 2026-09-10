import Decimal from 'decimal.js';

/** Pure functions, also bundled into workerd. No I/O or credentials here. */
export function createHealthAnalysisRuntime(DecimalType: typeof Decimal) {
  // Isolated precision configuration; never change the process-wide Decimal.
  const D = DecimalType.clone({
    precision: 80,
    rounding: DecimalType.ROUND_HALF_UP,
  });
  type RecordValue = Record<string, any>;
  const record = (value: unknown): value is RecordValue =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
  function decimal(value: unknown): Decimal | null {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    if (
      typeof value === 'string' &&
      (value.length > 80 || !/^\d+(?:\.\d+)?$/.test(value))
    )
      return null;
    try {
      const number = new D(value);
      return number.isFinite() &&
        number.gte(0) &&
        number.lte(Number.MAX_SAFE_INTEGER)
        ? number
        : null;
    } catch {
      return null;
    }
  }
  const identifier = (value: unknown) =>
    typeof value === 'string'
      ? value.toLowerCase().replace(/[^a-z0-9]/g, '')
      : '';
  const string = (value: unknown): string | null =>
    typeof value === 'string' && value.length > 0 && value.length <= 200
      ? value
      : null;
  function timestamp(value: unknown): string | null {
    if (
      (typeof value !== 'string' && typeof value !== 'number') ||
      value === ''
    )
      return null;
    const numeric =
      typeof value === 'number' ||
      (typeof value === 'string' && /^\d+$/.test(value));
    const ms = numeric
      ? Number(value) * (Number(value) < 10_000_000_000 ? 1000 : 1)
      : Date.parse(String(value));
    return Number.isFinite(ms) && ms > 0 && ms <= 8.64e15
      ? new Date(ms).toISOString()
      : null;
  }
  function assets(positions: any[], keys: string[]) {
    const rows: RecordValue[] = [];
    let total = new D(0);
    let seen = false;
    let valid = true;
    let positiveAmount = false;
    for (const position of positions) {
      if (!record(position) || !record(position.tokenList)) {
        valid = false;
        continue;
      }
      for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(position.tokenList, key))
          continue;
        seen = true;
        const tokens = position.tokenList[key];
        if (!Array.isArray(tokens)) {
          valid = false;
          break;
        }
        for (const token of tokens) {
          if (!record(token)) {
            valid = false;
            continue;
          }
          const amount = decimal(token.tokenAmount);
          const value = decimal(token.tokenValue);
          if (!amount || !value) valid = false;
          if (amount?.gt(0)) positiveAmount = true;
          if (value) total = total.plus(value);
          rows.push({
            address: string(token.tokenAddress ?? token.tokenContractAddress),
            symbol: string(token.tokenSymbol),
            amount: amount?.toFixed() ?? null,
            value_usd: value?.toFixed() ?? null,
          });
        }
        break; // aliases cannot double-count the same token category
      }
    }
    return { rows, total: seen && valid ? total : null, positiveAmount };
  }

  function analyze(response: unknown, input: RecordValue, fetchedAt: string) {
    if (
      !record(response) ||
      !/^0+$/.test(String(response.code)) ||
      response.success === false ||
      !record(response.data) ||
      !Array.isArray(response.data.addressList)
    ) {
      throw new Error('health_positions_unavailable');
    }
    const responseTime = timestamp(response.timestamp);
    const age = responseTime
      ? Date.parse(fetchedAt) - Date.parse(responseTime)
      : null;
    const freshness =
      age === null
        ? 'unknown'
        : age < -300_000
          ? 'future'
          : age > 300_000
            ? 'stale'
            : 'recent';
    const result = {
      schema_version: 3,
      agent: 'health-factor-monitoring',
      execution_status: 'needs_input',
      debt_status: 'unknown',
      position: null as RecordValue | null,
      computed: {
        supply_usd: null as string | null,
        collateral_usd: null as string | null,
        debt_usd: null as string | null,
        net_value_usd: null as string | null,
        health_factor: null as string | null,
      },
      evidence_quality: {
        source: 'web3_tool',
        health_factor_kind: 'unavailable',
        liquidation_thresholds: 'missing',
        fetched_at: fetchedAt,
        response_timestamp: responseTime,
        position_as_of: null,
        oracle_as_of: null,
        response_freshness: freshness,
        balance_coverage: 'not_requested',
        source_paths: {
          collection: null as string | null,
          health_factor: null as string | null,
        },
      },
      liquidation_assessment: {
        classification: 'unknown',
        basis: 'api_reported_health_factor',
        collateral_decline_to_boundary_pct: null as string | null,
        debt_increase_to_boundary_pct: null as string | null,
      },
      next_steps: [] as RecordValue[],
      stress_tests: [] as RecordValue[],
      assumptions: [
        'Supply is not proof that every supplied asset is enabled as collateral.',
        'Health factor and its assessment use the value reported by the xAPI position service.',
        'Response timestamp describes the API response, not a verified position block or oracle update.',
        'No wallet balance lookup or transaction execution was performed.',
      ],
      risk_warnings: [
        'Refresh the position before taking action. Protocol and oracle update times are not supplied by this API.',
        'Collateral and debt prices, interest, depegs, liquidation penalties, gas, slippage and smart-contract failures can change risk. A reported HF above one does not guarantee safety.',
      ],
      blocking_missing_fields: [] as string[],
      evidence_gaps: [
        'protocol_liquidation_thresholds',
        'position_as_of',
        'oracle_as_of',
      ] as string[],
      analysis: {
        overview: '',
        scenario_analysis: null as string | null,
        strategy_comparison: [] as RecordValue[],
        generation: {
          source: 'template',
          failure: null as string | null,
          numeric_validation: 'code_generated',
          referenced_fact_ids: [] as string[],
        },
      },
    };
    if (freshness !== 'recent')
      result.risk_warnings.push(
        `API response freshness is ${freshness}; do not treat its values as current.`,
      );
    const selector = record(input.positionSelector)
      ? input.positionSelector
      : {};
    if (
      selector.protocol &&
      identifier(selector.protocol) !== identifier(input.protocol)
    ) {
      result.blocking_missing_fields.unshift('consistent_protocol_selector');
      return finish(result);
    }
    const candidates: {
      collection: RecordValue;
      pool: RecordValue;
      protocol: RecordValue;
      path: string;
    }[] = [];
    for (const [ai, account] of response.data.addressList.entries()) {
      if (
        !record(account) ||
        typeof account.address !== 'string' ||
        account.address.toLowerCase() !==
          String(input.walletAddress).toLowerCase()
      )
        continue;
      if (!Array.isArray(account.protocolList))
        throw new Error('health_positions_unavailable');
      for (const [pi, protocol] of account.protocolList.entries()) {
        if (
          !record(protocol) ||
          String(protocol.binanceChainId) !== String(input.chainId ?? '56')
        )
          continue;
        if (
          ![protocol.protocolName, protocol.defiProtocolId].some(
            (value) => identifier(value) === identifier(input.protocol),
          )
        )
          continue;
        if (!Array.isArray(protocol.poolList))
          throw new Error('health_positions_unavailable');
        for (const [li, pool] of protocol.poolList.entries()) {
          if (!record(pool) || !Array.isArray(pool.positionCollectionList))
            throw new Error('health_positions_unavailable');
          const poolAddress = pool.poolCa ?? pool.poolAddress;
          if (
            selector.poolAddress &&
            String(poolAddress).toLowerCase() !==
              selector.poolAddress.toLowerCase()
          )
            continue;
          for (const [
            ci,
            collection,
          ] of pool.positionCollectionList.entries()) {
            if (!record(collection) || !Array.isArray(collection.positionList))
              throw new Error('health_positions_unavailable');
            if (
              selector.collectionId &&
              collection.positionCollectionId !== selector.collectionId
            )
              continue;
            if (
              selector.positionId &&
              !collection.positionList.some(
                (p: any) => p?.positionId === selector.positionId,
              )
            )
              continue;
            if (
              selector.investmentId &&
              !collection.positionList.some(
                (p: any) =>
                  Array.isArray(p?.investmentIds) &&
                  p.investmentIds.includes(selector.investmentId),
              )
            )
              continue;
            const hasLendingCategory = collection.positionList.some(
              (p: any) =>
                record(p?.tokenList) &&
                ['borrow', 'debt', 'supply', 'collateral'].some((k) =>
                  Object.prototype.hasOwnProperty.call(p.tokenList, k),
                ),
            );
            if (
              !hasLendingCategory ||
              (typeof pool.poolType === 'string' &&
                !/lend|borrow/i.test(pool.poolType))
            )
              continue;
            candidates.push({
              collection,
              pool,
              protocol,
              path: `data.addressList[${ai}].protocolList[${pi}].poolList[${li}].positionCollectionList[${ci}]`,
            });
          }
        }
      }
    }
    if (candidates.length !== 1) {
      result.blocking_missing_fields.unshift(
        candidates.length > 1
          ? 'positionSelector_for_unique_lending_collection'
          : 'resolvable_lending_position',
      );
      result.risk_warnings.push(
        candidates.length > 1
          ? 'Several matching lending collections exist. Select one; their values and health factors cannot be merged.'
          : 'No matching lending collection was returned. This does not prove the wallet has no debt.',
      );
      return finish(result);
    }
    const { collection, pool, protocol, path } = candidates[0];
    const supply = assets(collection.positionList, ['supply', 'collateral']);
    const collateral = assets(collection.positionList, ['collateral']);
    const debt = assets(collection.positionList, ['borrow', 'debt']);
    const hf = decimal(
      collection.positionCollectionDetail?.healthFactor ??
        collection.positionCollectionDetail?.healthRate,
    );
    result.position = {
      wallet_address: input.walletAddress,
      chain_id: String(input.chainId ?? '56'),
      protocol: String(protocol.protocolName ?? protocol.defiProtocolId),
      pool_address: string(pool.poolCa ?? pool.poolAddress),
      collection_id: string(collection.positionCollectionId),
      supply_assets: supply.rows,
      borrow_assets: debt.rows,
    };
    result.evidence_quality.source_paths.collection = path;
    result.computed.supply_usd = supply.total?.toFixed() ?? null;
    result.computed.collateral_usd = collateral.total?.toFixed() ?? null;
    result.computed.debt_usd = debt.total?.toFixed() ?? null;
    result.computed.net_value_usd =
      supply.total && debt.total
        ? supply.total.minus(debt.total).toFixed()
        : null;
    if (debt.positiveAmount || debt.total?.gt(0))
      result.debt_status = 'has_debt';
    else if (debt.total?.eq(0)) result.debt_status = 'no_reported_debt';
    else
      result.blocking_missing_fields.unshift(
        'explicit_borrow_amounts_and_values',
      );
    if (result.debt_status === 'has_debt' && debt.total === null)
      result.blocking_missing_fields.unshift('borrow_values_usd');
    if (!supply.total) result.blocking_missing_fields.unshift('supply_values');
    if (!collateral.total) result.evidence_gaps.push('collateral_eligibility');
    const net = decimal(collection.positionCollectionTotalValue);
    if (
      net &&
      result.computed.net_value_usd !== null &&
      net.minus(result.computed.net_value_usd).abs().gt('0.02')
    ) {
      result.risk_warnings.push(
        'Upstream collection net value differs from supply minus borrow; reconcile rewards and collection accounting before use.',
      );
    }
    if (hf && result.debt_status === 'has_debt') {
      result.computed.health_factor = hf.toFixed();
      result.evidence_quality.health_factor_kind = 'protocol_reported';
      result.evidence_quality.source_paths.health_factor =
        path +
        '.positionCollectionDetail.' +
        (collection.positionCollectionDetail.healthFactor !== undefined
          ? 'healthFactor'
          : 'healthRate');
      result.liquidation_assessment.classification = hf.lte(1)
        ? 'reported_hf_at_or_below_one'
        : 'reported_hf_above_one';
      result.liquidation_assessment.collateral_decline_to_boundary_pct = hf.gt(
        1,
      )
        ? new D(1).minus(new D(1).div(hf)).mul(100).toDecimalPlaces(6).toFixed()
        : '0';
      result.liquidation_assessment.debt_increase_to_boundary_pct = hf.gt(1)
        ? hf.minus(1).mul(100).toDecimalPlaces(6).toFixed()
        : '0';
      const scenarios: [string, number, number][] = [
        ['collateral_down10', -10, 0],
        ['collateral_down20', -20, 0],
        ['collateral_down30', -30, 0],
        ['debt_up20', 0, 20],
        ['collateral_down20_debt_up20', -20, 20],
        ['collateral_down15_debt_up10', -15, 10],
        ['collateral_down30_debt_up20', -30, 20],
        ['both_down20', -20, -20],
      ];
      result.stress_tests = scenarios.map(
        ([id, collateralChange, debtChange]) => {
          const projected = hf
            .mul(new D(100).plus(collateralChange))
            .div(new D(100).plus(debtChange));
          return {
            id,
            collateral_price_change_pct: collateralChange,
            debt_price_change_pct: debtChange,
            projected_health_factor: projected.toDecimalPlaces(6).toFixed(),
            at_or_below_one: projected.lte(1),
            basis: 'conditional_estimate_from_reported_hf',
          };
        },
      );
      result.assumptions.push(
        'Conditional scenarios scale the reported HF by (1 + collateral valuation change) / (1 + debt valuation change), with unchanged quantities, collateral eligibility and liquidation parameters. They are not price forecasts or independently verified liquidation triggers. HF is rounded to six decimals; threshold flags use unrounded values.',
      );
    } else if (result.debt_status === 'no_reported_debt') {
      result.liquidation_assessment.classification = 'no_reported_debt';
    } else
      result.blocking_missing_fields.push('protocol_reported_health_factor');
    // Completion means the requested API-based assessment is available. It
    // does not require independent protocol arithmetic or a repayment plan.
    const debtAssessmentAvailable =
      result.debt_status === 'no_reported_debt' ||
      (result.debt_status === 'has_debt' && hf !== null);
    result.execution_status =
      debtAssessmentAvailable &&
      supply.total !== null &&
      debt.total !== null &&
      freshness === 'recent'
        ? 'completed'
        : result.debt_status !== 'unknown' || supply.total !== null
          ? 'partial'
          : 'needs_input';
    return finish(result);
  }

  function finish<
    T extends RecordValue & {
      analysis: RecordValue;
      next_steps: RecordValue[];
    },
  >(result: T): T {
    const fresh = result.evidence_quality.response_freshness === 'recent';
    const hf = result.computed.health_factor;
    const debtUsd = decimal(result.computed.debt_usd);
    const protocol = result.position?.protocol ?? 'selected protocol';
    const debtAssets = [
      ...new Set<string>(
        (result.position?.borrow_assets ?? [])
          .map((asset: RecordValue) => string(asset.symbol))
          .filter((symbol: string | null): symbol is string => symbol !== null),
      ),
    ].join(', ');
    const strategies: RecordValue[] = [];
    const nextSteps: RecordValue[] = [];
    let debtSummary: string;
    let assessment: string;
    if (result.execution_status === 'needs_input') {
      debtSummary =
        'A unique lending position could not be resolved from the available data.';
      assessment =
        'Debt and liquidation risk cannot be determined until a lending position is selected with sufficient data.';
      nextSteps.push({
        id: 'resolve_position',
        kind: 'input',
        url: null,
        label:
          'Check the wallet, protocol and collection selector, then request the assessment again.',
      });
    } else {
      debtSummary =
        result.debt_status === 'has_debt'
          ? `Your ${protocol} position reports${debtAssets ? ' ' + debtAssets : ''} borrowing${debtUsd === null ? '' : ' worth approximately $' + debtUsd.toFixed(2)}.`
          : result.debt_status === 'no_reported_debt'
            ? `The selected ${protocol} position reports no outstanding borrowing.`
            : `Borrowing could not be determined for the selected ${protocol} position.`;
      if (hf !== null) {
        assessment = new D(hf).lte(1)
          ? `The API-reported health factor is ${hf}, at or below the usual liquidation boundary of 1. Review the position promptly; liquidation may be possible under the protocol's current rules.`
          : `The API-reported health factor is ${hf}, above the usual liquidation boundary of 1. Falling collateral prices or rising borrowed-asset prices can reduce this buffer.`;
      } else {
        assessment =
          result.debt_status === 'no_reported_debt'
            ? 'No borrowing-related liquidation exposure is indicated for this selected position by the returned data.'
            : 'A usable health factor is unavailable. Review the position to assess its liquidation risk.';
      }
      if (fresh && result.debt_status === 'has_debt' && hf !== null) {
        strategies.push(
          {
            id: 'repay_debt',
            benefit: `Repaying ${debtAssets || 'borrowed assets'} reduces the outstanding debt and its exposure to borrowed-asset price increases.`,
            tradeoff:
              'Repayment consumes liquid funds; acquiring the borrowed asset may incur swap costs.',
            prerequisite: `Check available ${debtAssets || 'borrowed-token'} funds and BNB for gas; wallet funds have not been checked.`,
          },
          {
            id: 'add_collateral',
            benefit:
              'Eligible added collateral can improve the health factor while leaving the borrowing outstanding.',
            tradeoff:
              'More capital remains exposed to the collateral asset and protocol; the debt price exposure remains.',
            prerequisite:
              'Confirm the added asset is eligible and enabled as collateral for the selected position.',
          },
        );
        nextSteps.push({
          id: 'check_repayment_funds',
          kind: 'suggestion',
          url: null,
          label: `Before repayment, check available${debtAssets ? ' ' + debtAssets : ' borrowed-token'} funds and BNB for gas.`,
        });
      }
      // A link is a real next step; suggestions do not claim a balance check,
      // automated monitoring or an executable transaction has been performed.
      if (identifier(protocol) === 'venus')
        nextSteps.unshift({
          id: 'review_position',
          kind: 'external_link',
          label: 'Review your position on Venus',
          url: 'https://app.venus.io/',
        });
    }
    if (!fresh) {
      debtSummary = 'Previously returned position data: ' + debtSummary;
      assessment =
        'API response freshness is ' +
        result.evidence_quality.response_freshness +
        '. ' +
        assessment +
        ' Refresh before relying on these values as current.';
    } else if (result.execution_status === 'partial') {
      assessment +=
        ' Some required valuation or borrowing data is missing; review the position details.';
    }
    result.analysis.overview = debtSummary + ' ' + assessment;
    result.analysis.strategy_comparison = strategies;
    result.next_steps = nextSteps;
    if (result.stress_tests.length) {
      const joint = result.stress_tests.find(
        (s: RecordValue) => s.id === 'collateral_down20_debt_up20',
      );
      const bothDown = result.stress_tests.find(
        (s: RecordValue) => s.id === 'both_down20',
      );
      result.analysis.scenario_analysis = `In the conditional scenarios, collateral falling 20% while debt valuation rises 20% gives an estimated HF of ${joint.projected_health_factor}. If both valuations fall 20%, estimated HF remains ${bothDown.projected_health_factor}; relative price moves matter. These scenarios assume unchanged positions and protocol parameters.`;
    }
    return result;
  }

  function narrativeContext(result: RecordValue) {
    const references: Record<string, string> = {};
    if (result.computed.health_factor !== null)
      references.reported_hf =
        'API-reported HF ' + result.computed.health_factor;
    references.liquidation_boundary = 'the usual liquidation boundary of HF 1';
    const borrowed = (result.position?.borrow_assets ?? [])
      .map((a: RecordValue) => a.symbol || 'unidentified asset')
      .join(', ');
    const supplied = (result.position?.supply_assets ?? [])
      .map((a: RecordValue) => a.symbol || 'unidentified asset')
      .join(', ');
    if (result.computed.debt_usd !== null)
      references.borrow_position = `${borrowed || 'reported'} borrowing valued at approximately $${new D(result.computed.debt_usd).toFixed(2)}`;
    if (result.computed.supply_usd !== null)
      references.supply_position = `${supplied || 'reported'} supply valued at approximately $${new D(result.computed.supply_usd).toFixed(2)}`;
    if (
      result.computed.collateral_usd === null &&
      result.computed.health_factor !== null
    )
      references.collateral_condition = `If the supplied ${supplied || 'assets'} ${supplied.includes(',') ? 'are' : 'is'} eligible and enabled as collateral`;
    for (const scenario of result.stress_tests) {
      const describe = (change: number, side: string) =>
        change === 0
          ? side + ' unchanged'
          : side + (change < 0 ? ' down ' : ' up ') + Math.abs(change) + '%';
      references[scenario.id] =
        `a scenario with ${describe(scenario.collateral_price_change_pct, 'collateral valuation')} and ${describe(scenario.debt_price_change_pct, 'debt valuation')} (estimated HF ${scenario.projected_health_factor})`;
    }

    return {
      protocol: result.position?.protocol ?? null,
      execution_status: result.execution_status,
      debt_status: result.debt_status,
      supplied_assets: result.position?.supply_assets ?? [],
      borrowed_assets: result.position?.borrow_assets ?? [],
      verified_values: result.computed,
      risk_classification: result.liquidation_assessment.classification,
      response_freshness: result.evidence_quality.response_freshness,
      collateral_eligibility:
        result.computed.collateral_usd === null ? 'unconfirmed' : 'reported',
      wallet_funds_checked: false,
      scenarios: result.stress_tests,
      assumptions: result.assumptions,
      limitations: result.risk_warnings,
      blocking_missing_fields: result.blocking_missing_fields,
      evidence_gaps: result.evidence_gaps,
      allowed_strategy_ids: result.analysis.strategy_comparison.map(
        (s: RecordValue) => s.id,
      ),
      references,
    };
  }

  function parseNarrative(
    text: unknown,
    result: RecordValue,
  ): RecordValue | null {
    if (typeof text !== 'string' || text.length > 12_000) return null;
    const trimmed = text.trim();
    const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(trimmed);
    const exactKeys = (value: unknown, keys: string[]) =>
      record(value) &&
      Object.keys(value).length === keys.length &&
      keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
    const context = narrativeContext(result);
    const used = new Set<string>();
    const normalizedTexts = new Set<string>();
    function render(value: unknown, max: number): string | null {
      if (typeof value !== 'string' || value.length < 15 || value.length > max)
        return null;
      let invalidReference = false;
      const bare = value.replace(
        /\{\{([a-z][a-z0-9_]*)\}\}/g,
        (_, id: string) => {
          if (!Object.prototype.hasOwnProperty.call(context.references, id))
            invalidReference = true;
          else used.add(id);
          return '';
        },
      );
      // Numerical facts may enter prose only through code-authored, unit-bound
      // references. Reject invented literals, number words, links and markup.
      if (
        invalidReference ||
        /[{}\p{N}$%<>]|https?:\/\//u.test(bare) ||
        /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|percent)\b/i.test(
          bare,
        )
      )
        return null;
      // This guard rejects known unsupported assertions; it does not purport
      // to prove every natural-language inference made by the model.
      if (
        /\b(guaranteed|risk.free|fully safe|cannot be liquidated|will not be liquidated|no liquidation risk|liquidation price|wallet (has|holds)|funds are sufficient|automatically repay|transaction (executed|submitted)|independently verified)\b/i.test(
          bare,
        )
      )
        return null;
      const normalized = bare.toLowerCase().replace(/\s+/g, ' ').trim();
      if (normalizedTexts.has(normalized)) return null;
      normalizedTexts.add(normalized);
      return value
        .replace(
          /\{\{([a-z][a-z0-9_]*)\}\}/g,
          (_, id: string) => context.references[id],
        )
        .trim()
        .replace(/^[a-z]/, (letter) => letter.toUpperCase());
    }
    try {
      const parsed: unknown = JSON.parse(fenced ? fenced[1] : trimmed);
      if (
        !exactKeys(parsed, [
          'overview',
          'scenario_analysis',
          'strategy_comparison',
        ])
      )
        return null;
      const draft = parsed as RecordValue;
      if (!Array.isArray(draft.strategy_comparison)) return null;
      const overview = render(draft.overview, 1200);
      if (!overview) return null;
      if (
        result.computed.health_factor !== null &&
        !draft.overview.includes('{{reported_hf}}')
      )
        return null;
      if (
        result.debt_status === 'has_debt' &&
        context.references.borrow_position &&
        !draft.overview.includes('{{borrow_position}}')
      )
        return null;
      // The normal position overview must actually use the supplied asset
      // evidence; source mappings remain available in the structured payload.
      if (
        context.references.supply_position &&
        !draft.overview.includes('{{supply_position}}')
      )
        return null;
      if (
        context.references.collateral_condition &&
        !draft.overview.includes('{{collateral_condition}}')
      )
        return null;
      if (
        result.evidence_quality.response_freshness !== 'recent' &&
        !/stale|unknown|future|outdated|refresh|not current/i.test(
          draft.overview,
        )
      )
        return null;
      let scenarioAnalysis: string | null = null;
      if (result.stress_tests.length) {
        scenarioAnalysis = render(draft.scenario_analysis, 1200);
        if (
          !scenarioAnalysis ||
          !draft.scenario_analysis.includes(
            '{{collateral_down20_debt_up20}}',
          ) ||
          !draft.scenario_analysis.includes('{{both_down20}}') ||
          !/assum|conditional|scenario|estimate/i.test(draft.scenario_analysis)
        )
          return null;
      } else if (draft.scenario_analysis !== null) return null;
      const expectedIds = context.allowed_strategy_ids as string[];
      if (draft.strategy_comparison.length !== expectedIds.length) return null;
      const seen = new Set<string>();
      const strategies: RecordValue[] = [];
      for (const option of draft.strategy_comparison) {
        if (
          !exactKeys(option, ['id', 'benefit', 'tradeoff', 'prerequisite']) ||
          !expectedIds.includes(option.id) ||
          seen.has(option.id)
        )
          return null;
        seen.add(option.id);
        const benefit = render(option.benefit, 650);
        const tradeoff = render(option.tradeoff, 650);
        const prerequisite = render(option.prerequisite, 650);
        if (!benefit || !tradeoff || !prerequisite) return null;
        if (
          option.id === 'add_collateral' &&
          !/eligib|enabled|qualif/i.test(prerequisite)
        )
          return null;
        if (
          option.id === 'repay_debt' &&
          !/fund|balance|available|hold/i.test(prerequisite)
        )
          return null;
        strategies.push({ id: option.id, benefit, tradeoff, prerequisite });
      }
      return {
        overview,
        scenario_analysis: scenarioAnalysis,
        strategy_comparison: strategies,
        generation: {
          source: 'model_generated',
          failure: null,
          numeric_validation: 'code_references',
          referenced_fact_ids: [...used].sort(),
        },
      };
    } catch {
      return null;
    }
  }

  return { analyze, narrativeContext, parseNarrative };
}
