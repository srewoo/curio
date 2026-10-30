import type { ModelOption } from '@/config/providers';
import type { LlmUsage } from '@/types/messages';
import { COST } from '@/config/constants';

// Cost estimation + per-session soft budget (PRD §6.10). All figures are coarse
// (±50%, TRD §11) and used only to warn/pause — never to bill.

export function usageCostUsd(usage: LlmUsage, model: ModelOption): number {
  return (
    (usage.inputTokens / 1_000_000) * model.inputPerMTokUsd +
    (usage.outputTokens / 1_000_000) * model.outputPerMTokUsd
  );
}

// Pre-ingest estimate: vision reads ~1 image (≈1.2k tok in) + markdown out per
// page (PRD §6.10). Returns a low/high USD range.
export function estimateIngestCostUsd(pageCount: number, visionModel: ModelOption): { low: number; high: number } {
  const inPerPage = 1_500;
  const outPerPage = 700;
  const perPage = usageCostUsd({ inputTokens: inPerPage, outputTokens: outPerPage }, visionModel);
  const mid = perPage * pageCount;
  return { low: +(mid * 0.6).toFixed(3), high: +(mid * 1.6).toFixed(3) };
}

export type BudgetState = 'ok' | 'warn' | 'exceeded';

export class SessionBudget {
  private spent = 0;
  constructor(
    private readonly capUsd: number = COST.defaultSessionBudgetUsd,
    initialSpentUsd: number = 0
  ) {
    this.spent = initialSpentUsd;
  }

  get spentUsd(): number {
    return this.spent;
  }

  // Flat fees not expressed in tokens (e.g. per-search charges).
  addUsd(usd: number): void {
    this.spent += usd;
  }

  add(usage: LlmUsage, model: ModelOption): void {
    this.spent += usageCostUsd(usage, model);
  }

  state(): BudgetState {
    if (this.spent >= this.capUsd) return 'exceeded';
    if (this.spent >= this.capUsd * COST.warnAtFraction) return 'warn';
    return 'ok';
  }
}
