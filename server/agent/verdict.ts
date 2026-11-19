// Code owns the number. Models may raise it; nothing may lower it below the
// deterministic floor, and a missing model never turns a LOW into a green.

import type { Signal, Tier } from "./contract.ts";

export const HIGH_MIN = 70;
export const MEDIUM_MIN = 45;

export function tierFor(score: number): Tier {
  if (score >= HIGH_MIN) return "HIGH";
  if (score >= MEDIUM_MIN) return "MEDIUM";
  return "LOW";
}

/**
 * Apply a model-proposed risk bump. Negative deltas are ignored entirely.
 * A model alone can never reach HIGH: without a rule floor at HIGH level the
 * highest it can raise a score to is HIGH_MIN - 1. This is flag 6.
 */
export function applyModelRaise(score: number, floor: number, delta: number): number {
  const bump = Math.max(0, Math.min(20, Math.round(Number.isFinite(delta) ? delta : 0)));
  if (bump === 0) return score;
  const raised = Math.min(100, score + bump);
  if (floor >= HIGH_MIN) return raised;
  return Math.min(raised, HIGH_MIN - 1);
}

export interface DeterministicEvidence {
  score: number;
  floor: number;
  signals: Signal[];
}

/** Merge several tool results: worst wins. */
export function mergeEvidence(parts: DeterministicEvidence[]): DeterministicEvidence {
  let score = 0;
  let floor = 0;
  const seen = new Set<string>();
  const signals: Signal[] = [];
  for (const part of parts) {
    score = Math.max(score, part.score);
    floor = Math.max(floor, part.floor);
    for (const signal of part.signals) {
      const key = `${signal.id}:${JSON.stringify(signal.detail ?? {})}`;
      if (seen.has(key)) continue;
      seen.add(key);
      signals.push(signal);
    }
  }
  return { score: Math.max(score, floor), floor, signals };
}

export interface ResolutionInput {
  scoringOk: boolean;
  evidence: DeterministicEvidence | null;
  mode: "model" | "mock";
  modelOk: boolean;
  timedOut: boolean;
}

export interface Resolution {
  tier: Tier;
  score: number | null;
  basis: "rules+model" | "rules_only" | "not_checked";
}

/**
 * Fail-closed matrix (design section 3):
 *   scoring failed                    -> NOT_CHECKED
 *   mock mode (no key configured)     -> rules verdict at any tier
 *   model ok                          -> rules+model
 *   model failed, rules >= MEDIUM     -> keep tier, rules_only
 *   model failed, rules == LOW        -> NOT_CHECKED
 *   deadline hit with evidence        -> keep tier, rules_only
 */
export function resolveVerdict(input: ResolutionInput): Resolution {
  if (!input.scoringOk || input.evidence === null) {
    return { tier: "NOT_CHECKED", score: null, basis: "not_checked" };
  }
  const base = Math.max(input.evidence.score, input.evidence.floor);
  const tier = tierFor(base);

  if (input.timedOut) return { tier, score: base, basis: "rules_only" };
  if (input.mode === "mock") return { tier, score: base, basis: "rules_only" };
  if (input.modelOk) return { tier, score: base, basis: "rules+model" };
  if (tier === "HIGH" || tier === "MEDIUM") {
    return { tier, score: base, basis: "rules_only" };
  }
  return { tier: "NOT_CHECKED", score: null, basis: "not_checked" };
}

/** Reasons shown to the user: highest weight first, never more than three. */
export function topSignals(signals: Signal[], limit = 3): Signal[] {
  return [...signals].sort((a, b) => b.weight - a.weight).slice(0, limit);
}
