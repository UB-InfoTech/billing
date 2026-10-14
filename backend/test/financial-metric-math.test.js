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

test("counts both selected dates inclusively", () => {
  const now = new Date(2026, 9, 14, 12, 0, 0);
  assert.equal(require("../utils/financialMetricMath").getPeriodDayCount("2026-10-01", "2026-10-12", now), 12);
});

test("uses elapsed calendar days when only a start date is selected", () => {
  const now = new Date(2026, 9, 14, 12, 0, 0);
  assert.equal(require("../utils/financialMetricMath").getPeriodDayCount("2026-10-01", "", now), 14);
});

test("uses a 365-day window ending on the selected end date when start is omitted", () => {
  const now = new Date(2026, 9, 14, 12, 0, 0);
  assert.equal(require("../utils/financialMetricMath").getPeriodDayCount("", "2026-10-12", now), 365);
});

test("uses the trailing 365 calendar days when no dates are selected", () => {
  const now = new Date(2026, 9, 14, 12, 0, 0);
  assert.equal(require("../utils/financialMetricMath").getPeriodDayCount("", "", now), 365);
});
