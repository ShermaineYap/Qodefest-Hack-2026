import assert from 'node:assert/strict';
import test from 'node:test';
import { analyseUrl, extractFirstUrl } from '../src/link.ts';
import type { Analysis } from '../src/types.ts';

function ok(input: string): Extract<Analysis, { ok: true }> {
  const result = analyseUrl(input);
  assert.equal(result.ok, true, `expected ${input} to analyse`);
  return result as Extract<Analysis, { ok: true }>;
}

function hitNames(input: string): string[] {
  return ok(input).hits.map((hit) => hit.name);
}

test('official Maybank login page is clean', () => {
  const { facts, hits, localScore } = ok('https://www.maybank2u.com.my/login');
  assert.deepEqual(hits, []);
  assert.equal(localScore, 0);
  assert.equal(facts.registrable, 'maybank2u.com.my');
  assert.equal(facts.tld, 'com.my');
  assert.equal(facts.subdomainCount, 1);
  assert.equal(facts.pathShape, '/login');
});

test('deny-listed brand lookalike', () => {
  const { hits, localScore } = ok('https://maybank-secure-login.xyz/login');
  const names = hits.map((hit) => hit.name);
  assert.ok(names.includes('deny_list'));
  assert.ok(names.includes('brand_impersonation'));
  assert.ok(names.includes('credential_harvest'));
  assert.equal(localScore, 95);
});

test('brand token in a subdomain of another domain', () => {
  const { facts, localScore } = ok('https://maybank.com.my.evil.xyz/');
  assert.equal(facts.registrable, 'evil.xyz');
  assert.ok(hitNames('https://maybank.com.my.evil.xyz/').includes('brand_impersonation'));
  assert.ok(localScore >= 85);
});

test('userinfo obfuscation', () => {
  const { facts, hits, localScore } = ok('https://maybank.com.my@evil.xyz/');
  assert.equal(facts.host, 'evil.xyz');
  assert.equal(facts.userinfo, true);
  assert.ok(hits.some((hit) => hit.name === 'userinfo_obfuscation'));
  assert.ok(localScore >= 70);
});

test('IP literal login over http', () => {
  const { facts } = ok('http://192.168.0.1/login');
  assert.equal(facts.ipLiteral, true);
  const names = hitNames('http://192.168.0.1/login');
  assert.ok(names.includes('ip_literal'));
  assert.ok(names.includes('insecure_login'));
});

test('punycode host', () => {
  const { facts, hits, localScore } = ok('https://xn--mynk-9qa.com/');
  assert.equal(facts.punycode, true);
  assert.ok(hits.some((hit) => hit.name === 'lookalike_characters'));
  assert.ok(localScore >= 80);
});

test('Cyrillic homoglyph host', () => {
  const url = 'https://m\u0430ybank.com/';
  const { facts, hits, localScore } = ok(url);
  assert.equal(facts.mixedScript, true);
  assert.equal(facts.homoglyph, true);
  assert.equal(facts.punycode, true);
  assert.ok(hits.some((hit) => hit.name === 'lookalike_characters'));
  assert.ok(localScore >= 80);
});

test('shortener', () => {
  const { facts, localScore } = ok('https://bit.ly/3AbCdEf');
  assert.equal(facts.isShortener, true);
  assert.equal(facts.pathShape, '/other');
  assert.ok(localScore >= 45);
});

test('open redirect parameter', () => {
  const { facts, localScore } = ok('https://example.com/?url=https://evil.xyz');
  assert.equal(facts.hasOpenRedirect, true);
  assert.equal(facts.pathShape, '');
  assert.ok(localScore >= 45);
});

test('official multi-part domain with subdomains', () => {
  const { facts, hits } = ok('https://a.b.cimb.com.my/');
  assert.equal(facts.registrable, 'cimb.com.my');
  assert.equal(facts.tld, 'com.my');
  assert.equal(facts.subdomainCount, 2);
  assert.deepEqual(hits, []);
});

test('scheme is added when missing', () => {
  const { facts } = ok('example.com/login');
  assert.equal(facts.scheme, 'https');
  assert.equal(facts.host, 'example.com');
  assert.equal(facts.pathShape, '/login');
});

test('non-web and empty input are rejected', () => {
  for (const input of ['javascript:alert(1)', '']) {
    const result = analyseUrl(input);
    assert.equal(result.ok, false);
  }
});

test('unparseable input is rejected', () => {
  const result = analyseUrl('http://');
  assert.equal(result.ok, false);
});

test('additive signals are capped', () => {
  const { localScore, hits } = ok('https://a.b.c.d-very-long-host-name.xyz/');
  assert.ok(hits.some((hit) => hit.name === 'suspicious_tld'));
  assert.ok(hits.some((hit) => hit.name === 'many_subdomains'));
  assert.ok(localScore <= 35);
});

test('extractFirstUrl finds explicit URLs', () => {
  const text = 'Hi, check this: https://example.com/offer?id=1. Thanks';
  assert.equal(extractFirstUrl(text), 'https://example.com/offer?id=1');
  assert.equal(extractFirstUrl('Try (http://bad.example/claim)'), 'http://bad.example/claim');
});

test('extractFirstUrl finds bare domains', () => {
  assert.equal(extractFirstUrl('go to maybank-secure-login.xyz/login now'), 'maybank-secure-login.xyz/login');
  assert.equal(extractFirstUrl('visit bit.ly/abc'), 'bit.ly/abc');
});

test('extractFirstUrl returns null without a link', () => {
  assert.equal(extractFirstUrl('no links here, just words'), null);
  assert.equal(extractFirstUrl('email me at alice@example.com'), null);
});
