import type { RedactedPayload } from './types.ts';

export type Tier = 'low' | 'medium' | 'high';

export interface RiskResult {
  requestId: string;
  tier: Tier;
  score: number;
  headline: string;
  sentences: string[];
  checked: string[];
  category?: string;
  heldForReview?: boolean;
}

export type ScoreStatus =
  | { status: 'scored'; result: RiskResult }
  | { status: 'not_checked'; reason: string; localSignals: string[] };

export type ExtensionMessage =
  | { type: 'score'; payload: RedactedPayload; localScore: number }
  | { type: 'get-verdict'; url: string }
  | { type: 'go-back' }
  | { type: 'continue'; url: string }
  | { type: 'ask'; text: string; locale: 'en' | 'ms'; image?: string };

export type AssistantTier = 'HIGH' | 'MEDIUM' | 'LOW' | 'NOT_CHECKED';

/** The Lantern Assistant's verdict, trimmed to what the panel renders. */
export interface AssistantResult {
  requestId: string;
  tier: AssistantTier;
  label: string;
  summary: string;
  reasons: string[];
  checked: string[];
  notChecked: string[];
  action: string | null;
  actions: { id: string; label: string }[];
  quickReplies: { id: string; label: string }[];
  subject: string;
  basis: string;
}

export type AskStatus =
  | { status: 'answered'; result: AssistantResult }
  | { status: 'not_checked'; reason: string };

export const TIER_RANK: Record<Tier, number> = { low: 0, medium: 1, high: 2 };

export function worseOf(first: Tier, second: Tier): Tier {
  return TIER_RANK[first] >= TIER_RANK[second] ? first : second;
}
