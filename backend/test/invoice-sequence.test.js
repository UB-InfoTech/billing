const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeInvoiceSequence } = require("../utils/invoiceSequence");

test("accepts whole non-negative invoice sequences", () => {
  assert.equal(normalizeInvoiceSequence(0), 0);
  assert.equal(normalizeInvoiceSequence(1), 1);
  assert.equal(normalizeInvoiceSequence("42"), 42);
});

test("rejects decimals, negatives and invalid values", () => {
  for (const value of [1.5, -1, "not-a-number", Infinity, NaN, ""]) {
    assert.throws(
      () => normalizeInvoiceSequence(value),
      error => error.status === 400
    );
  }
});

test("rejects values above JavaScript's safe integer limit", () => {
  assert.throws(
    () => normalizeInvoiceSequence(Number.MAX_SAFE_INTEGER + 1),
    error => error.status === 400
  );
});
