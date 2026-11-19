import { test } from "node:test";
import assert from "node:assert/strict";
import { clampModel, extractUrls, scoreMessage, scoreUrl, stripUrl, tierFor } from "../lib/rules.ts";

test("brand outside the registrable domain is HIGH (floor 85)", () => {
  const r = scoreUrl("maybank-secure-login.xyz/login");
  assert.equal(r.floor, 85);
  assert.equal(tierFor(r.score), "HIGH");
});

test("official bank domain has no signals and is recognised", () => {
  const r = scoreUrl("https://www.maybank2u.com.my");
  assert.equal(r.signals.length, 0);
  assert.equal(r.officialFor, "Maybank");
  assert.equal(tierFor(r.score), "LOW");
});

test("userinfo trick is caught", () => {
  const r = scoreUrl("https://maybank.com.my@evil.example/login");
  assert.ok(r.signals.some((s) => s.id === "userinfo"));
  assert.ok(r.floor >= 70);
});

test("punycode host is HIGH", () => {
  assert.equal(tierFor(scoreUrl("http://xn--mybnk-8ra.com").score), "HIGH");
});

test("shortener is at least MEDIUM before expansion", () => {
  assert.equal(tierFor(scoreUrl("https://bit.ly/abc").score), "MEDIUM");
});

test("Macau scam message hits the authority + urgency + secrecy floor", () => {
  const r = scoreMessage("Ini Sarjan dari Bukit Aman. Jangan beritahu keluarga. Pindahkan simpanan ke akaun selamat hari ini.");
  assert.ok(r.floor >= 80);
  assert.equal(tierFor(r.score), "HIGH");
});

test("OTP request floor is 85", () => {
  assert.equal(scoreMessage("Please send the TAC we sent you").floor, 85);
});

test("ordinary family message is LOW", () => {
  assert.equal(tierFor(scoreMessage("Ma, I'll come by on Saturday with groceries").score), "LOW");
});

test("the model can never lower the rule score", () => {
  assert.equal(clampModel(85, 85, 5).score, 85);
});

test("the model alone can raise only to MEDIUM", () => {
  const r = clampModel(10, 0, 95);
  assert.equal(r.score, 69);
  assert.equal(tierFor(r.score), "MEDIUM");
});

test("query strings are stripped before anything leaves", () => {
  assert.equal(stripUrl("https://example.com/a?ic=900101-14-5555#x"), "http://example.com/a".replace("http:", "https:"));
});

test("links are extracted from a message", () => {
  assert.deepEqual(extractUrls("Pay here: http://poslaju-my.top/pay now"), ["http://poslaju-my.top/pay"]);
});
