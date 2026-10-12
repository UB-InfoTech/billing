const test = require("node:test");
const assert = require("node:assert/strict");
const { getInvoiceRevenue } = require("../utils/syncClientData");

test("prefers the rounded invoice total when it exists", () => {
  assert.equal(
    getInvoiceRevenue({ roundOffFinalRevenue: 850, finalRevenue: 849.6, totalAmount: 850 }),
    850
  );
});

test("falls back to finalRevenue when a legacy rounded total is zero", () => {
  assert.equal(
    getInvoiceRevenue({ roundOffFinalRevenue: 0, finalRevenue: 849.6, totalAmount: 850 }),
    849.6
  );
});

test("falls back to totalAmount when the other totals are missing or invalid", () => {
  assert.equal(
    getInvoiceRevenue({ roundOffFinalRevenue: "invalid", finalRevenue: null, totalAmount: "125.50" }),
    125.5
  );
});

test("returns zero rather than propagating invalid or negative revenue", () => {
  assert.equal(
    getInvoiceRevenue({ roundOffFinalRevenue: -10, finalRevenue: "invalid", totalAmount: -5 }),
    0
  );
});

test("rounds fallback invoice totals to currency precision", () => {
  assert.equal(
    getInvoiceRevenue({ roundOffFinalRevenue: 0, finalRevenue: 100.105 }),
    100.11
  );
});
