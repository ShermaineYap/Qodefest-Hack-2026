import assert from 'node:assert/strict';
import test from 'node:test';
import type { RiskResult } from '../src/messages.ts';
import { elevate, tierForLocalScore } from '../src/verdict.ts';

function result(overrides: Partial<RiskResult> = {}): RiskResult {
  return {
    requestId: 'req_test',
    tier: 'low',
    score: 25,
    headline: 'Nothing unusual about this link.',
    sentences: ['The address did not match any known scam patterns.'],
    checked: ['domain', 'local rules'],
    heldForReview: false,
    ...overrides,
  };
}

test('local score maps to the server thresholds', () => {
  assert.equal(tierForLocalScore(0), 'low');
  assert.equal(tierForLocalScore(44), 'low');
  assert.equal(tierForLocalScore(45), 'medium');
  assert.equal(tierForLocalScore(79), 'medium');
  assert.equal(tierForLocalScore(80), 'high');
  assert.equal(tierForLocalScore(95), 'high');
});

test('a deny-listed local host lifts a LOW server verdict to HIGH', () => {
  const lifted = elevate(result(), 95);
  assert.equal(lifted.tier, 'high');
  assert.equal(lifted.score, 95);
  assert.equal(
    lifted.headline,
    'This looks like a scam link. Do not enter your password or bank details.',
  );
  assert.deepEqual(lifted.sentences, [
    'Your device spotted warning signs on this address.',
    'Do not enter your password or bank details.',
  ]);
  assert.equal(lifted.requestId, 'req_test');
});

test('a shortener lifts LOW to MEDIUM and keeps the checked list unique', () => {
  const lifted = elevate(result({ checked: ['domain'] }), 45);
  assert.equal(lifted.tier, 'medium');
  assert.deepEqual(lifted.checked, ['domain', 'local rules']);
});

test('local score never lowers or rewrites a stronger server verdict', () => {
  const high = result({ tier: 'high', score: 80, headline: 'Server copy', sentences: ['Server evidence.'] });
  assert.equal(elevate(high, 20), high);
  const same = elevate(result({ tier: 'medium', score: 70 }), 45);
  assert.equal(same.tier, 'medium');
  assert.equal(same.score, 70);
  assert.equal(same.headline, 'Nothing unusual about this link.');
});
