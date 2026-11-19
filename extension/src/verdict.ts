import type { RiskResult, Tier } from './messages.ts';
import { TIER_RANK } from './messages.ts';

const HIGH_FLOOR = 80;
const MEDIUM_FLOOR = 45;

const ELEVATED_COPY: Record<'medium' | 'high', { headline: string; sentences: string[] }> = {
  medium: {
    headline: 'This link looks off. Open it only if you were expecting it.',
    sentences: [
      'Your device spotted unusual details on this address.',
      'Open it only if you were expecting it.',
    ],
  },
  high: {
    headline: 'This looks like a scam link. Do not enter your password or bank details.',
    sentences: [
      'Your device spotted warning signs on this address.',
      'Do not enter your password or bank details.',
    ],
  },
};

export function tierForLocalScore(score: number): Tier {
  if (score >= HIGH_FLOOR) return 'high';
  if (score >= MEDIUM_FLOOR) return 'medium';
  return 'low';
}

// The server only knows the redacted flags; on-device rules (deny list, brand
// impersonation) can be stronger. Keep the worse tier, never lower the server's.
export function elevate(result: RiskResult, localScore: number): RiskResult {
  const tier = tierForLocalScore(localScore);
  if (tier === 'low' || TIER_RANK[tier] <= TIER_RANK[result.tier]) return result;
  const copy = ELEVATED_COPY[tier];
  const checked = result.checked.includes('local rules')
    ? result.checked
    : [...result.checked, 'local rules'];
  return {
    ...result,
    tier,
    score: Math.max(result.score, localScore),
    headline: copy.headline,
    sentences: [...copy.sentences],
    checked,
  };
}
