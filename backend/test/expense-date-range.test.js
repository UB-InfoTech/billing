const test = require("node:test");
const assert = require("node:assert/strict");
const { buildExpenseDateRange } = require("../utils/expenseDateRange");

test("supports no date filters and one-sided date filters", () => {
  assert.equal(buildExpenseDateRange({}), null);
  assert.ok(buildExpenseDateRange({ startDate: "2026-10-01" }).$gte instanceof Date);
  assert.ok(buildExpenseDateRange({ endDate: "2026-10-12" }).$lte instanceof Date);
});

test("keeps both boundaries inclusive for local calendar days", () => {
  const range = buildExpenseDateRange({ startDate: "2026-10-01", endDate: "2026-10-12" });
  assert.equal(range.$gte.getHours(), 0);
  assert.equal(range.$lte.getHours(), 23);
  assert.equal(range.$lte.getMinutes(), 59);
  assert.equal(range.$lte.getMilliseconds(), 999);
  assert.equal(range.$gte.getDate(), 1);
  assert.equal(range.$lte.getDate(), 12);
});

test("rejects invalid calendar dates and reversed ranges", () => {
  assert.throws(() => buildExpenseDateRange({ startDate: "2026-02-30" }), error => error.status === 400);
  assert.throws(() => buildExpenseDateRange({ startDate: "2026-10-13", endDate: "2026-10-12" }), error => error.status === 400);
});
