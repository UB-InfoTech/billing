const test = require("node:test");
const assert = require("node:assert/strict");
const { buildOrderDateRange, parseDateOnly } = require("../utils/orderDateRange");

test("creates an inclusive start/end day range", () => {
  const range = buildOrderDateRange({ startDate: "2026-10-01", endDate: "2026-10-12" });
  assert.ok(range.$gte instanceof Date);
  assert.ok(range.$lte instanceof Date);
  assert.equal(range.$gte.getHours(), 0);
  assert.equal(range.$lte.getHours(), 23);
  assert.equal(range.$lte.getMilliseconds(), 999);
  assert.equal(range.$gte.getDate(), 1);
  assert.equal(range.$lte.getDate(), 12);
});

test("supports legacy from/to query names and a single boundary", () => {
  assert.ok(buildOrderDateRange({ from: "2026-01-20" }).$gte instanceof Date);
  assert.ok(buildOrderDateRange({ to: "2026-01-20" }).$lte instanceof Date);
  assert.equal(buildOrderDateRange({}), null);
});

test("rejects malformed and impossible calendar dates", () => {
  assert.throws(() => parseDateOnly("tomorrow", "start"), error => error.status === 400);
  assert.throws(() => parseDateOnly("2026-02-30", "end"), error => error.status === 400);
  assert.throws(() => parseDateOnly("2026/10/12", "start"), error => error.status === 400);
});

test("rejects a start date later than the end date", () => {
  assert.throws(
    () => buildOrderDateRange({ startDate: "2026-10-13", endDate: "2026-10-12" }),
    error => error.status === 400 && /start date/i.test(error.message)
  );
});
