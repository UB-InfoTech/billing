const test = require("node:test");
const assert = require("node:assert/strict");
const { ratio, pct } = require("../utils/financialMetricMath");

test("returns a real zero when a known numerator is zero", () => {
  assert.equal(ratio(0, 20), 0);
  assert.equal(pct(0, 20), 0);
});

test("returns null when either financial input is missing", () => {
  assert.equal(ratio(null, 20), null);
  assert.equal(ratio(10, undefined), null);
  assert.equal(pct("", 20), null);
  assert.equal(pct(10, null), null);
});

test("returns null for non-finite inputs", () => {
  assert.equal(ratio("not-a-number", 10), null);
  assert.equal(pct(10, Infinity), null);
});

test("avoids divide-by-zero ratios and percentages", () => {
  assert.equal(ratio(10, 0), null);
  assert.equal(pct(10, 0), null);
});

test("calculates and rounds valid ratios and percentages", () => {
  assert.equal(ratio(1, 3), 0.33);
  assert.equal(pct(1, 3), 33.33);
  assert.equal(ratio(12, 4), 3);
  assert.equal(pct(12, 4), 300);
});
