import { describe, it, expect } from 'vitest';
import { SessionBudget, estimateIngestCostUsd, usageCostUsd } from './budget';
import type { ModelOption } from '@/config/providers';

const model: ModelOption = { id: 'm', label: 'M', inputPerMTokUsd: 3, outputPerMTokUsd: 15 };

describe('cost + budget (PRD §6.10)', () => {
  it('computes usage cost from token counts', () => {
    const cost = usageCostUsd({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, model);
    expect(cost).toBeCloseTo(18, 5);
  });

  it('produces a low/high ingest estimate that scales with pages', () => {
    const one = estimateIngestCostUsd(1, model);
    const ten = estimateIngestCostUsd(10, model);
    expect(one.low).toBeLessThan(one.high);
    expect(ten.high).toBeGreaterThan(one.high);
  });

  it('moves through ok → warn → exceeded', () => {
    const budget = new SessionBudget(0.001); // cap $0.001; warn at 80% => $0.0008
    expect(budget.state()).toBe('ok');
    budget.add({ inputTokens: 300, outputTokens: 0 }, model); // 300/1e6*3 = $0.0009 => warn
    expect(budget.state()).toBe('warn');
    budget.add({ inputTokens: 100, outputTokens: 0 }, model); // +$0.0003 => $0.0012 => exceeded
    expect(budget.state()).toBe('exceeded');
  });
});
