const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildPaymentArrayMutationOperation
} = require("../utils/paymentArrayMutation");

test("payment edits match the prior payment history and due balance", () => {
  const oldDate = new Date("2026-10-12T10:00:00.000Z");
  const newDate = new Date("2026-10-14T10:00:00.000Z");
  const previousPayments = [{
    _id: "payment-1",
    amount: 100,
    paymentDate: oldDate,
    method: "Cash",
    amountReference: "RCPT-1"
  }];
  const nextPayments = [{
    ...previousPayments[0],
    amount: 125,
    paymentDate: newDate,
    method: "UPI"
  }];

  const operation = buildPaymentArrayMutationOperation({
    orderId: "invoice-1",
    createdBy: "business-1",
    expectedDueAmount: 400,
    expectedPayments: previousPayments,
    nextPayments,
    lastPaymentDate: newDate
  });

  assert.deepEqual(operation.filter, {
    _id: "invoice-1",
    createdBy: "business-1",
    dueAmount: 400,
    payments: previousPayments
  });
  assert.deepEqual(operation.update, {
    $set: { payments: nextPayments, lastPaymentDate: newDate }
  });
  assert.deepEqual(operation.options, { new: true, runValidators: true });
});

test("payment history mutations support legacy invoices without stored fields", () => {
  const operation = buildPaymentArrayMutationOperation({
    orderId: "invoice-1",
    createdBy: "business-1",
    expectedDueAmount: undefined,
    expectedPayments: undefined,
    nextPayments: [],
    lastPaymentDate: null
  });

  assert.deepEqual(operation.filter.dueAmount, { $exists: false });
  assert.deepEqual(operation.filter.payments, { $exists: false });
  assert.deepEqual(operation.update.$set, { payments: [], lastPaymentDate: null });
});

test("payment history mutation builder rejects invalid inputs", () => {
  const base = {
    orderId: "invoice-1",
    createdBy: "business-1",
    expectedDueAmount: 10,
    expectedPayments: [],
    nextPayments: [],
    lastPaymentDate: null
  };

  assert.throws(
    () => buildPaymentArrayMutationOperation({ ...base, createdBy: null }),
    /ownership are required/
  );
  assert.throws(
    () => buildPaymentArrayMutationOperation({ ...base, expectedPayments: {} }),
    /must be an array or null/
  );
  assert.throws(
    () => buildPaymentArrayMutationOperation({ ...base, nextPayments: {} }),
    /must be an array/
  );
  assert.throws(
    () => buildPaymentArrayMutationOperation({ ...base, lastPaymentDate: "not-a-date" }),
    /valid date or null/
  );
});
