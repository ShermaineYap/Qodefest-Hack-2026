import assert from 'node:assert/strict';
import test from 'node:test';
import { analyseUrl } from '../src/link.ts';
import { buildPayload, previewLines } from '../src/redact.ts';
import type { Analysis } from '../src/types.ts';

function payloadFor(input: string) {
  const analysis = analyseUrl(input);
  assert.equal(analysis.ok, true);
  return buildPayload(input, analysis as Extract<Analysis, { ok: true }>);
}

test('payload drops private details from a login URL', () => {
  const input = 'https://example.com/user/alice@example.com/login?phone=0123456789&token=abc123';
  const payload = payloadFor(input);
  const json = JSON.stringify(payload);

  assert.ok(!json.includes('alice'));
  assert.ok(!json.includes('0123456789'));
  assert.ok(!json.includes('abc123'));
  assert.ok(!json.includes('user/'));
  assert.equal(payload.v, 1);
  assert.equal(payload.host, 'example.com');
  assert.equal(payload.pathShape, '/login');
  assert.equal(payload.redactions.queryParams, 2);
  assert.equal(payload.redactions.emails, 1);
  assert.equal(payload.redactions.phones, 1);
  assert.equal(payload.redactions.ids, 0);
  assert.equal(payload.redactions.cards, 0);
  assert.equal(payload.redactions.wallets, 0);
  assert.ok(previewLines(payload).includes('Domain: example.com'));
});

test('payload carries flags and signals for short links', () => {
  const payload = payloadFor('https://bit.ly/abc');
  assert.equal(payload.flags.shortener, true);
  assert.deepEqual(payload.localSignals, ['shortener']);
  const lines = previewLines(payload);
  assert.ok(lines.includes('Short link: yes'));
  assert.ok(lines.includes('Path type: /other (not the full path)'));
  assert.ok(lines.includes('Removed before sending: query string, full path and any private details.'));
});

test('preview lists structural warnings and redaction count', () => {
  const input = 'https://maybank.com.my@evil.xyz/login?url=https://evil.xyz/steal?card=4111111111111111';
  const payload = payloadFor(input);
  const lines = previewLines(payload);
  assert.equal(lines[0], 'Domain: evil.xyz');
  assert.ok(!lines.includes('Lookalike characters: yes'));
  assert.ok(lines.includes('Hidden destination before @: yes'));
  assert.ok(lines.includes('Redirect parameter: yes'));
  assert.equal(payload.flags.homoglyph, false);
  assert.ok(lines.some((line) => /^Removed before sending: \d+ private detail\(s\)\.$/.test(line)));
});

test('payload counts phones, ids, cards and wallets', () => {
  const input = 'https://example.test/pay?id=900101-14-5566&tel=012-3456789&acc=4111111111111111&wallet=0x1234567890abcdef1234567890abcdef12345678';
  const payload = payloadFor(input);
  assert.equal(payload.redactions.ids, 1);
  assert.equal(payload.redactions.phones, 1);
  assert.equal(payload.redactions.cards, 1);
  assert.equal(payload.redactions.wallets, 1);
});
