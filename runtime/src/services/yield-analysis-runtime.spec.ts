import Decimal from 'decimal.js';
import Ajv from 'ajv';
import { createYieldAnalysisRuntime } from './yield-analysis-runtime';
import captured from './fixtures/yield-usdt-2026-09-09.json';
import {
  YIELD_ANALYSIS_OUTPUT_SCHEMA,
  yieldAnalysisExample,
} from '../agent-studio';

const runtime = createYieldAnalysisRuntime(Decimal);
const input = yieldAnalysisExample().input;
const now = '2026-09-09T10:06:00.000Z';
const analyze = (request = input, fixture = structuredClone(captured)) =>
  runtime.analyze(request, [fixture.list], fixture.details, now);
const lista = (d: typeof captured) =>
  Object.values(d.details).find((r) => r.data.defiProtocolId === 'helio')!.data;

describe('Yield current-quote routing from recorded live evidence', () => {
  it('proposes 60/40 highest-rate allocation without demanding lock or history evidence', () => {
    const result = analyze();
    expect(result.request.constraints).toEqual({ max_protocol_share_pct: 60 });
    expect(result.request.risk_profile).toBe('balanced');
    expect(result.execution_status).toBe('completed');
    expect(result.allocation_status).toBe('proposed');
    expect(result.transactions_executed).toBe(false);
    expect(result.allocation.map((l) => [l.protocol, l.amount])).toEqual([
      ['Lista', '6000'],
      ['Aave V3', '4000'],
    ]);
    expect(result.allocation_summary).toMatchObject({
      rate_type: 'APY',
      weighted_headline_rate_pct: '4.562',
      annual_gross_amount: '456.2',
    });
    expect(result.unallocated_amount).toBe('0');
    expect(result.blocking_missing_fields).toEqual([]);
    expect(result.evidence_gaps).toEqual(
      expect.arrayContaining(['lock_days', 'yield_history']),
    );
    expect(result.candidates[0].lock_days).toBeNull();
    expect(
      new Ajv({ strict: false }).validate(YIELD_ANALYSIS_OUTPUT_SCHEMA, result),
    ).toBe(true);
  });

  it('still honors a newly explicit lock constraint rather than silently discarding it', () => {
    const result = analyze({
      ...input,
      constraints: { max_protocol_share_pct: 60, max_lock_days: 7 },
    });
    expect(result.allocation_status).toBe('hold');
    expect(result.allocation).toEqual([]);
    expect(result.candidates[0].blocking_reasons).toContain(
      'requested_lock_limit_unverified',
    );
    const data = structuredClone(captured);
    (lista(data) as any).lockDays = 30;
    expect(
      analyze(
        {
          ...input,
          constraints: { max_protocol_share_pct: 60, max_lock_days: 7 },
        },
        data,
      ).candidates[0].constraint_violations,
    ).toContain('max_lock_days_exceeded');
  });

  it('uses newer detail quotes rather than outdated list values', () => {
    const data = structuredClone(captured);
    lista(data).apyBps = 500;
    expect(
      analyze(input, data).allocation_summary.weighted_headline_rate_pct,
    ).toBe('4.196');
  });

  it('does not allocate to a matching ticker on a different token contract', () => {
    const data = structuredClone(captured);
    lista(data).assetTokenList[0].tokenAddress =
      '0x1111111111111111111111111111111111111111';
    const result = analyze(input, data);
    expect(result.allocation.map((l) => l.protocol)).toEqual(['Aave V3']);
    expect(result.unallocated_amount).toBe('4000');
  });

  it.each(['binanceChainId', 'investmentId', 'defiProtocolId'])(
    'rejects a mismatched detail %s',
    (key) => {
      const data = structuredClone(captured);
      (lista(data) as any)[key] = 'wrong';
      expect(analyze(input, data).candidates[0].detail_verified).toBe(false);
      expect(
        analyze(input, data).allocation.some((l) => l.protocol === 'Lista'),
      ).toBe(false);
    },
  );

  it('excludes stale or future response snapshots', () => {
    for (const at of ['2026-09-09T12:00:00Z', '2026-09-09T08:00:00Z']) {
      const result = runtime.analyze(
        input,
        [captured.list],
        captured.details,
        at,
      );
      expect(result.allocation).toEqual([]);
      expect(result.evidence_gaps).toContain('fresh_response');
    }
  });

  it('does not rank APR and APY as directly comparable metrics', () => {
    const data = structuredClone(captured);
    lista(data).apyType = 'APR';
    const result = analyze(input, data);
    expect(result.allocation).toEqual([]);
    expect(result.blocking_missing_fields).toContain('comparable_rate_basis');
    Object.values(data.details).forEach((r) => (r.data.apyType = 'APR'));
    expect(analyze(input, data).allocation_summary.rate_type).toBe('APR');
  });

  it('honors explicit TVL, gas and risk constraints without inventing evidence', () => {
    for (const constraint of [
      { min_tvl_usd: 1e9 },
      { gas_budget_usd: 20 },
      { max_risk_score: 50 },
    ]) {
      expect(
        analyze({
          ...input,
          constraints: { max_protocol_share_pct: 60, ...constraint },
        }).allocation,
      ).toEqual([]);
    }
  });

  it('keeps residual capital when eligible protocols cannot fill the concentration limits', () => {
    const result = analyze({
      ...input,
      constraints: { max_protocol_share_pct: 35 },
    });
    expect(result.allocation.map((l) => l.share_pct)).toEqual(['35', '35']);
    expect(result.unallocated_amount).toBe('3000');
    expect(result.allocation_summary).toMatchObject({
      weighted_headline_rate_pct: '3.01',
      annual_gross_amount: '301',
    });
  });

  it('deduplicates products at protocol level and uses the best verified product', () => {
    const data = structuredClone(captured);
    const clone = structuredClone(Object.values(data.details)[0]);
    const row = data.list.data.list.find(
      (r) => r.investmentId === clone.data.investmentId,
    )!;
    clone.data.investmentId = 'a'.repeat(64);
    clone.data.apyBps = 999;
    data.list.data.list.push({
      ...row,
      investmentId: clone.data.investmentId,
      apyBps: 999,
    });
    (data.details as any)[clone.data.investmentId] = clone;
    const result = analyze(input, data);
    expect(
      result.allocation.filter((l) => l.protocol_id === 'helio'),
    ).toHaveLength(1);
    expect(result.allocation[0]).toMatchObject({
      investment_id: 'a'.repeat(64),
      share_pct: '60',
    });
  });

  it('does not value non-principal rewards as USDT without conversion evidence', () => {
    const data = structuredClone(captured);
    lista(data).rewardTokenList[0].tokenAddress =
      '0x1111111111111111111111111111111111111111';
    expect(
      analyze(input, data).allocation.some((l) => l.protocol === 'Lista'),
    ).toBe(false);
  });

  it.each(['investable', 'tvl', 'apyBps'])(
    'rejects unavailable or empty markets by %s',
    (key) => {
      const data = structuredClone(captured);
      (lista(data) as any)[key] = key === 'investable' ? false : 0;
      expect(
        analyze(input, data).allocation.some((l) => l.protocol === 'Lista'),
      ).toBe(false);
    },
  );

  it('holds on failed discovery without presenting fabricated investments', () => {
    const result = runtime.analyze(input, [null, null], {}, now);
    expect(result.allocation_status).toBe('hold');
    expect(result.evidence_gaps).toContain('investment_discovery');
    expect(result.unallocated_amount).toBe('10000');
  });

  it('does not invent a concentration cap and honors a zero cap', () => {
    for (const constraints of [{}, { max_protocol_share_pct: 0 }]) {
      expect(analyze({ ...input, constraints }).allocation).toEqual([]);
    }
  });

  it('rejects invented numerical and unsupported safety claims in model prose', () => {
    const result = analyze();
    const text = {
      overview:
        'The proposal prioritizes Lista for its higher verified quoted yield and assigns the remainder to Aave V3 under the protocol cap.',
      tradeoffs:
        'The proposal retains USDT exposure and limits protocol concentration, while smart-contract and depeg risks remain.',
    };
    expect(
      runtime.parseNarrative(JSON.stringify(text), result)?.generation,
    ).toBe('model_generated');
    for (const append of [
      ' Profit is 999%.',
      ' Use {{made_up}}.',
      ' This is the safest product.',
      ' These pools are more established.',
      ' This relies on less liquid products.',
    ]) {
      expect(
        runtime.parseNarrative(
          JSON.stringify({ ...text, tradeoffs: text.tradeoffs + append }),
          result,
        ),
      ).toBeNull();
    }
  });
});
