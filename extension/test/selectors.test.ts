import assert from 'node:assert/strict';
import test from 'node:test';
import { SITES, matchSite } from '../src/selectors.ts';

test('matchSite resolves chat hostnames', () => {
  assert.equal(matchSite('web.whatsapp.com')?.id, 'whatsapp');
  assert.equal(matchSite('web.telegram.org')?.id, 'telegram');
  assert.equal(matchSite('www.messenger.com')?.id, 'messenger');
});

test('matchSite is case-insensitive', () => {
  assert.equal(matchSite('WEB.WHATSAPP.COM')?.id, 'whatsapp');
});

test('matchSite returns null for unknown hosts', () => {
  assert.equal(matchSite('example.com'), null);
  assert.equal(matchSite(''), null);
});

test('every site has a message selector', () => {
  for (const site of SITES) {
    assert.ok(site.messageSelector.length > 0);
    assert.ok(site.hostnames.length > 0);
  }
});
