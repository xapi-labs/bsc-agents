import Decimal from 'decimal.js';
import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHealthAnalysisRuntime } from './health-analysis-runtime';
import { HEALTH_ANALYSIS_OUTPUT_SCHEMA } from '../agent-studio';

// A captured real xAPI response, used only to test pure mapping/arithmetic.
// Live acceptance is performed separately through the real xAPI gateways.
const captured = JSON.parse(
  readFileSync(
    join(__dirname, 'fixtures/health-venus-2026-09-09.json'),
    'utf8',
  ),
);
const runtime = createHealthAnalysisRuntime(Decimal);
const input = {
  walletAddress: '0x8d5624fa29526c879a1ca7560961e4c5a08089ae',
  chainId: '56',
  protocol: 'Venus',
};
const capturedAt = new Date(captured.timestamp).toISOString();
const analyze = (
  data = captured,
  request: Record<string, unknown> = input,
  at = capturedAt,
) => runtime.analyze(data, request, at);
const collection = (data: typeof captured) =>
  data.data.addressList[0].protocolList[0].poolList[0]
    .positionCollectionList[0];

describe('Health v3 real-evidence mapping and arithmetic', () => {
  it('maps only the selected Venus collection and preserves exact decimal net value', () => {
    const result = analyze();
    expect(result.execution_status).toBe('completed');
    expect(result.debt_status).toBe('has_debt');
    expect(result.computed).toEqual({
      supply_usd: '755.00480592',
      collateral_usd: null,
      debt_usd: '397.65615997',
      net_value_usd: '357.34864595',
      health_factor: '1.52',
    });
    expect(
      result.position?.borrow_assets.map((asset: { symbol: string }) => asset.symbol),
    ).toEqual(
      ['BTCB'],
    );
    expect(result.position?.pool_address).toBe(
      '0xfd36e2c2a6789db23113685031d7f16329158384',
    );
    expect(result.evidence_quality).toMatchObject({
      health_factor_kind: 'protocol_reported',
      response_timestamp: capturedAt,
      position_as_of: null,
      oracle_as_of: null,
      balance_coverage: 'not_requested',
    });
    expect(result.risk_warnings.join(' ')).not.toContain('net value differs');
    expect(
      new Ajv({ strict: false }).validate(
        HEALTH_ANALYSIS_OUTPUT_SCHEMA,
        result,
      ),
    ).toBe(true);
  });

  it('gives a complete API-based assessment and suggestions without a target or independent HF', () => {
    const result = analyze();
    expect(result.execution_status).toBe('completed');
    expect(result.analysis.overview).toContain('1.52');
    expect(result.analysis.overview).toContain('$397.66');
    expect(result.analysis.overview).not.toContain('1.8');
    expect(result.computed).not.toHaveProperty(
      'independently_computed_health_factor',
    );
    expect(result).not.toHaveProperty('risk');
    expect(result).not.toHaveProperty('repayment_feasibility');
    expect(result.blocking_missing_fields).toEqual([]);
    expect(result.evidence_gaps).toContain('collateral_eligibility');
    expect(result).not.toHaveProperty('summary');
    expect(result).not.toHaveProperty('explanation');
    expect(result).not.toHaveProperty('recommendations');
    expect(result.liquidation_assessment).not.toHaveProperty('summary');
    expect(result.liquidation_assessment.classification).toBe(
      'reported_hf_above_one',
    );
    expect(result.analysis.strategy_comparison.map((r) => r.id)).toEqual([
      'repay_debt',
      'add_collateral',
    ]);
    expect(result.next_steps).toContainEqual(
      expect.objectContaining({
        id: 'check_repayment_funds',
        kind: 'suggestion',
        url: null,
      }),
    );
    expect(result.next_steps).toContainEqual(
      expect.objectContaining({
        kind: 'external_link',
        url: 'https://app.venus.io/',
      }),
    );
  });

  it.each(['0.9', '1', '1.0001'])(
    'uses the liquidation boundary, not an invented safety target, for HF %s',
    (hf) => {
      const data = structuredClone(captured);
      collection(data).positionCollectionDetail.healthFactor = hf;
      const result = analyze(data);
      expect(result.execution_status).toBe('completed');
      if (new Decimal(hf).lte(1)) {
        expect(result.liquidation_assessment.classification).toBe(
          'reported_hf_at_or_below_one',
        );
        expect(result.analysis.overview).toContain(
          'Review the position promptly',
        );
      } else
        expect(result.liquidation_assessment.classification).toBe(
          'reported_hf_above_one',
        );
    },
  );

  it('keeps missing HF partial and does not invent a liquidation assessment', () => {
    const data = structuredClone(captured);
    delete collection(data).positionCollectionDetail.healthFactor;
    delete collection(data).positionCollectionDetail.healthRate;
    const result = analyze(data);
    expect(result.execution_status).toBe('partial');
    expect(result.liquidation_assessment.classification).toBe('unknown');
    expect(result.analysis.overview).toContain('health factor is unavailable');
    expect(result.analysis.strategy_comparison.map((r) => r.id)).not.toContain(
      'repay_debt',
    );
  });

  it('computes conditional stress exactly, without back-derived independent verification', () => {
    const result = analyze();
    expect(
      result.stress_tests.map((item) => item.projected_health_factor),
    ).toEqual([
      '1.368',
      '1.216',
      '1.064',
      '1.266667',
      '1.013333',
      '1.174545',
      '0.886667',
      '1.52',
    ]);
    expect(
      result.stress_tests
        .filter((item) => item.at_or_below_one)
        .map((item) => item.id),
    ).toEqual(['collateral_down30_debt_up20']);
    expect(
      result.liquidation_assessment.collateral_decline_to_boundary_pct,
    ).toBe('34.210526');
    expect(result.liquidation_assessment.debt_increase_to_boundary_pct).toBe(
      '52',
    );
    expect(result).not.toHaveProperty('mitigation_options');
    expect(result.assumptions.join(' ')).toContain('unchanged quantities');
  });

  it.each(['stale', 'future', 'unknown'])(
    'distinguishes %s response time from unknown protocol time',
    (kind) => {
      const data = structuredClone(captured);
      data.timestamp =
        kind === 'unknown'
          ? null
          : captured.timestamp + (kind === 'future' ? 600000 : -600000);
      const result = analyze(data);
      expect(result.evidence_quality.response_freshness).toBe(kind);
      expect(result.evidence_quality.position_as_of).toBeNull();
      expect(result.execution_status).toBe('partial');
      expect(result.analysis.overview).toContain('Refresh before relying');
      expect(result.analysis.strategy_comparison).toEqual([]);
    },
  );

  it('requires a unique collection and honors poolCa plus collectionId selection', () => {
    const data = structuredClone(captured);
    const pools = data.data.addressList[0].protocolList[0].poolList;
    const other = structuredClone(pools[0]);
    other.positionCollectionList[0].positionCollectionId = 'second-collection';
    other.positionCollectionList[0].positionCollectionDetail.healthFactor =
      '0.9';
    pools.push(other);
    expect(analyze(data).computed.health_factor).toBeNull();
    const selected = analyze(data, {
      ...input,
      positionSelector: {
        poolAddress: pools[0].poolCa,
        collectionId: 'second-collection',
      },
    });
    expect(selected.computed.health_factor).toBe('0.9');
    expect(selected.liquidation_assessment.classification).toBe(
      'reported_hf_at_or_below_one',
    );
  });

  it.each([
    { ...input, protocol: 'not-Venus' },
    { ...input, walletAddress: '0x1111111111111111111111111111111111111111' },
    { ...input, chainId: '1' },
    { ...input, positionSelector: { protocol: 'Lista' } },
  ])('does not borrow evidence from another requested identity', (request) => {
    const result = analyze(captured, request);
    expect(result.execution_status).toBe('needs_input');
    expect(result.debt_status).toBe('unknown');
    expect(result.computed.health_factor).toBeNull();
  });

  it('does not convert a missing borrow field into zero debt', () => {
    const data = structuredClone(captured);
    delete collection(data).positionList[1].tokenList.borrow;
    expect(analyze(data).debt_status).toBe('unknown');
  });

  it('reports an explicit zero borrow as no reported debt without claiming safety', () => {
    const data = structuredClone(captured);
    const token = collection(data).positionList[1].tokenList.borrow[0];
    token.tokenAmount = '0';
    token.tokenValue = '0';
    const result = analyze(data);
    expect(result.debt_status).toBe('no_reported_debt');
    expect(result.computed.health_factor).toBeNull();
    expect(result.execution_status).toBe('completed');
    expect(result.analysis.strategy_comparison).toEqual([]);
    expect(result.next_steps.map((r) => r.id)).not.toContain(
      'check_repayment_funds',
    );
  });

  it('preserves evidence of a token debt when its USD valuation is missing', () => {
    const data = structuredClone(captured);
    collection(data).positionList[1].tokenList.borrow[0].tokenValue = '';
    const result = analyze(data);
    expect(result.debt_status).toBe('has_debt');
    expect(result.computed.debt_usd).toBeNull();
    expect(result.computed.net_value_usd).toBeNull();
  });

  it.each([
    { code: 50000, success: false, data: null },
    { code: 0, success: false, data: {} },
    { code: 0, data: {} },
  ])('rejects unavailable/malformed core data', (data) => {
    expect(() => analyze(data)).toThrow('health_positions_unavailable');
  });

  it('never changes global Decimal precision or mutates the captured response', () => {
    const before = JSON.stringify(captured);
    const precision = Decimal.precision;
    analyze();
    expect(JSON.stringify(captured)).toBe(before);
    expect(Decimal.precision).toBe(precision);
  });
});

const validDraft = () => ({
  overview:
    'The Venus position combines {{supply_position}} with {{borrow_position}} and {{reported_hf}}. {{collateral_condition}}, weakness against BTCB can narrow the buffer.',
  scenario_analysis:
    'Under the conditional assumptions, {{collateral_down20_debt_up20}}. In contrast, {{both_down20}}, illustrating relative-price exposure rather than a price forecast.',
  strategy_comparison: [
    {
      id: 'repay_debt',
      benefit: 'Repaying BTCB reduces the borrowed-asset exposure directly.',
      tradeoff: 'This consumes liquid funds and may require a BTCB purchase.',
      prerequisite: 'Check available BTCB funds and BNB gas before repayment.',
    },
    {
      id: 'add_collateral',
      benefit:
        'Adding eligible collateral can preserve the BTCB borrowing while improving the buffer.',
      tradeoff:
        'Additional capital remains exposed to the collateral asset and the protocol.',
      prerequisite:
        'Confirm eligibility and enable the collateral for this position.',
    },
  ],
});

describe('Health generated narrative and numerical boundary', () => {
  it.each([false, true])(
    'accepts generated prose with code-bound numerical references (fence=%s)',
    (fenced) => {
      const text = JSON.stringify(validDraft());
      const result = analyze();
      const parsed = runtime.parseNarrative(
        fenced ? '```json\n' + text + '\n```' : text,
        result,
      )!;
      expect(parsed).not.toBeNull();
      expect(parsed.generation.source).toBe('model_generated');
      expect(parsed.overview).toContain('$397.66');
      expect(parsed.overview).toContain('API-reported HF 1.52');
      expect(parsed.scenario_analysis).toContain('1.013333');
      expect(parsed.overview).not.toContain('{{');
      expect(parsed.strategy_comparison[0].tradeoff).toContain('BTCB purchase');
      expect(
        new Ajv({ strict: false }).validate(HEALTH_ANALYSIS_OUTPUT_SCHEMA, {
          ...result,
          analysis: parsed,
        }),
      ).toBe(true);
    },
  );

  it.each([
    (d: any) => {
      d.overview += ' Repay $99 now.';
    },
    (d: any) => {
      d.overview += ' The price will rise twenty percent.';
    },
    (d: any) => {
      d.overview += ' {{fabricated_price}}';
    },
    (d: any) => {
      d.overview += ' Funds are sufficient.';
    },
    (d: any) => {
      d.overview += ' This is guaranteed.';
    },
    (d: any) => {
      d.overview += ' HF is １.５２.';
    },
    (d: any) => {
      d.overview += ' More at https://example.com';
    },
    (d: any) => {
      d.strategy_comparison[1].id = 'repay_debt';
    },
    (d: any) => {
      d.strategy_comparison[1].prerequisite =
        'No additional checks are needed.';
    },
    (d: any) => {
      d.strategy_comparison[0].tradeoff = d.strategy_comparison[0].benefit;
    },
    (d: any) => {
      d.scenario_analysis =
        'A general market decline might reduce the health factor.';
    },
    (d: any) => {
      d.health_factor = '99';
    },
  ])(
    'rejects unsupported figures, claims, references or comparison shape',
    (change) => {
      const draft = validDraft();
      change(draft);
      expect(
        runtime.parseNarrative(JSON.stringify(draft), analyze()),
      ).toBeNull();
    },
  );

  it('requires the code-bound collateral eligibility condition', () => {
    const draft = validDraft();
    draft.overview = draft.overview.replace(
      '{{collateral_condition}},',
      'Since BNB is supplied,',
    );
    expect(runtime.parseNarrative(JSON.stringify(draft), analyze())).toBeNull();
  });

  it('requires stale evidence to remain explicit in generated prose', () => {
    const data = structuredClone(captured);
    data.timestamp -= 600000;
    const result = analyze(data);
    const draft = { ...validDraft(), strategy_comparison: [] };
    expect(runtime.parseNarrative(JSON.stringify(draft), result)).toBeNull();
    draft.overview = 'Stale evidence: ' + draft.overview;
    expect(
      runtime.parseNarrative(JSON.stringify(draft), result),
    ).not.toBeNull();
  });

  it.each(['Here is the answer: ', ''])(
    'rejects wrapped/multiple JSON or truncation',
    (prefix) => {
      const text = JSON.stringify(validDraft());
      expect(
        runtime.parseNarrative(prefix + text + '{}', analyze()),
      ).toBeNull();
      expect(runtime.parseNarrative(text.slice(0, -2), analyze())).toBeNull();
    },
  );

  it('never applies the debt strategy draft to a no-debt position', () => {
    const data = structuredClone(captured);
    const token = collection(data).positionList[1].tokenList.borrow[0];
    token.tokenAmount = '0';
    token.tokenValue = '0';
    expect(
      runtime.parseNarrative(JSON.stringify(validDraft()), analyze(data)),
    ).toBeNull();
  });
});
