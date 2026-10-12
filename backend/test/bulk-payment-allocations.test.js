const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizePaymentUpdates } = require("../utils/bulkPaymentAllocations");

const isObjectId = value => /^[a-f0-9]{24}$/i.test(value);
const invoiceA = "aaaaaaaaaaaaaaaaaaaaaaaa";
const invoiceB = "bbbbbbbbbbbbbbbbbbbbbbbb";

test("normalizes invoice IDs and preserves zero allocations for proportional splits", () => {
  assert.deepEqual(
    normalizePaymentUpdates(
      [{ orderId: invoiceA }, { orderId: invoiceB, amount: "12.50" }],
      isObjectId
    ),
    [
      { orderId: invoiceA, amount: 0 },
      { orderId: invoiceB, amount: 12.5 }
    ]
  );
});

test("combines duplicate invoice entries to cents precision", () => {
  assert.deepEqual(
    normalizePaymentUpdates(
      [
        { orderId: invoiceA, amount: 2.15 },
        { orderId: invoiceA, amount: 3.1 }
      ],
      isObjectId
    ),
    [{ orderId: invoiceA, amount: 5.25 }]
  );
});

test("rejects invalid invoice IDs instead of silently ignoring them", () => {
  assert.throws(
    () => normalizePaymentUpdates([{ orderId: "not-an-id", amount: 5 }], isObjectId),
    /invalid ID/i
  );
});

test("rejects negative and non-finite allocations", () => {
  assert.throws(
    () => normalizePaymentUpdates([{ orderId: invoiceA, amount: -1 }], isObjectId),
    /cannot be negative/i
  );
  assert.throws(
    () => normalizePaymentUpdates([{ orderId: invoiceA, amount: "NaN" }], isObjectId),
    /valid number/i
  );
});

test("requires a non-empty list of invoice selections", () => {
  assert.throws(() => normalizePaymentUpdates([], isObjectId), /updates\[\]/i);
});
