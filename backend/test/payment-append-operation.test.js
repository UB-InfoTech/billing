const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPaymentAppendOperation } = require("../utils/paymentAppendOperation");

test("payment append rechecks invoice ownership, status, and due balance atomically", () => {
  const paymentDate = new Date("2026-10-14T10:30:00.000Z");
  const payment = {
    amount: 125.5,
    amountReference: "BULK-100",
    paymentDate,
    method: "UPI"
  };

  const operation = buildPaymentAppendOperation({
    orderId: "invoice-1",
    createdBy: "business-1",
    amount: 125.5,
    expectedDueAmount: 200,
    payment,
    paymentDate
  });

  assert.deepEqual(operation.filter, {
    _id: "invoice-1",
    createdBy: "business-1",
    status: { $ne: "Cancelled" },
    dueAmount: 200
  });
  assert.deepEqual(operation.update, {
    $push: { payments: payment },
    $set: { lastPaymentDate: paymentDate }
  });
  assert.deepEqual(operation.options, { new: true, runValidators: true });
});

test("payment append rejects invalid amounts and mismatched payment records", () => {
  const base = {
    orderId: "invoice-1",
    createdBy: "business-1",
    amount: 50,
    expectedDueAmount: 75,
    payment: { amount: 50 },
    paymentDate: new Date("2026-10-14T10:30:00.000Z")
  };

  assert.throws(() => buildPaymentAppendOperation({ ...base, amount: 0 }), /greater than zero/);
  assert.throws(() => buildPaymentAppendOperation({ ...base, amount: Infinity }), /finite number/);
  assert.throws(() => buildPaymentAppendOperation({ ...base, amount: 76 }), /exceeds the expected invoice balance/);
  assert.throws(
    () => buildPaymentAppendOperation({ ...base, payment: { amount: 49.99 } }),
    /must match the allocation amount/
  );
  assert.throws(() => buildPaymentAppendOperation({ ...base, createdBy: null }), /ownership are required/);
});
