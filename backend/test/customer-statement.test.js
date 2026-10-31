const test = require("node:test");
const assert = require("node:assert/strict");
const { buildCustomerStatement } = require("../utils/customerStatement");

const date = value => new Date(value);

const client = {
  _id: "customer-1",
  createdAt: date("2026-01-01T00:00:00.000Z"),
  outstanding_balance: 45,
  creditBalance: 17,
  creditBalanceAdjustment: 3,
  creditBalanceHistory: [
    { amount: 5, balanceAfter: 5, effectiveAt: date("2026-01-02T10:00:00.000Z"), reason: "Opening adjustment" },
    { amount: -2, balanceAfter: 3, effectiveAt: date("2026-01-04T10:00:00.000Z"), reason: "Adjustment reversal" }
  ]
};

const order = {
  _id: "invoice-1",
  orderNumber: "INV-001",
  clientId: "customer-1",
  status: "Pending",
  orderDate: date("2026-01-01T09:00:00.000Z"),
  roundOffFinalRevenue: 100,
  totalAmount: 100,
  paidAmount: 40,
  dueAmount: 45,
  payments: [
    {
      _id: "payment-1",
      amount: 30,
      paymentDate: date("2026-01-02T10:00:00.000Z"),
      amountReference: "UPI-001",
      method: "UPI"
    },
    {
      _id: "payment-2",
      amount: 10,
      paymentDate: date("2026-01-04T10:00:00.000Z"),
      amountReference: "UPI-002",
      method: "UPI"
    }
  ]
};

const creditNote = {
  _id: "credit-note-1",
  creditNoteNumber: "CN-001",
  clientId: "customer-1",
  originalOrderId: "invoice-1",
  status: "Posted",
  settlementHistory: [
    {
      eventType: "posted",
      status: "Posted",
      effectiveAt: date("2026-01-03T10:00:00.000Z"),
      adjustmentAmount: 20,
      customerCreditAmount: 10,
      refundAmount: 0
    },
    {
      eventType: "edited",
      status: "Posted",
      effectiveAt: date("2026-01-05T10:00:00.000Z"),
      adjustmentAmount: 15,
      customerCreditAmount: 14,
      refundAmount: 0
    }
  ]
};

test("builds separate invoice and customer-credit running balances for a date range", () => {
  const statement = buildCustomerStatement({
    client,
    orders: [order],
    creditNotes: [creditNote],
    fromDate: date("2026-01-03T00:00:00.000Z"),
    toDate: date("2026-01-04T23:59:59.999Z"),
    now: date("2026-01-06T00:00:00.000Z")
  });

  assert.equal(statement.receivables.openingBalance, 70);
  assert.equal(statement.receivables.totalDebits, 0);
  assert.equal(statement.receivables.totalCredits, 30);
  assert.equal(statement.receivables.closingBalance, 40);
  assert.deepEqual(
    statement.receivables.transactions.map(row => row.balanceAfter),
    [50, 40]
  );

  assert.equal(statement.receivables.currentOutstanding, 45);
  assert.equal(statement.receivables.storedOutstanding, 45);
  assert.equal(statement.receivables.reconcilesWithCustomerSummary, true);

  assert.equal(statement.customerCredit.openingBalance, 5);
  assert.equal(statement.customerCredit.additions, 10);
  assert.equal(statement.customerCredit.deductions, 2);
  assert.equal(statement.customerCredit.closingBalance, 13);
  assert.equal(statement.customerCredit.currentBalance, 17);
  assert.deepEqual(
    statement.customerCredit.transactions.map(row => row.balanceAfter),
    [15, 13]
  );
  assert.equal(statement.warnings.length, 0);
});

test("shows Credit Note adjustment reversals and cancellations as receivable debits", () => {
  const cancelledNote = {
    _id: "credit-note-2",
    creditNoteNumber: "CN-002",
    clientId: "customer-1",
    originalOrderId: "invoice-1",
    status: "Cancelled",
    settlementHistory: [
      {
        eventType: "posted",
        status: "Posted",
        effectiveAt: date("2026-01-02T10:00:00.000Z"),
        adjustmentAmount: 25,
        customerCreditAmount: 0,
        refundAmount: 0
      },
      {
        eventType: "cancelled",
        status: "Cancelled",
        effectiveAt: date("2026-01-04T10:00:00.000Z"),
        adjustmentAmount: 0,
        customerCreditAmount: 0,
        refundAmount: 0
      }
    ]
  };

  const statement = buildCustomerStatement({
    client: { ...client, outstanding_balance: 100, creditBalance: 3, creditBalanceAdjustment: 3, creditBalanceHistory: [] },
    orders: [{ ...order, payments: [] }],
    creditNotes: [cancelledNote],
    fromDate: date("2026-01-01T00:00:00.000Z"),
    toDate: date("2026-01-05T00:00:00.000Z"),
    now: date("2026-01-05T00:00:00.000Z")
  });

  assert.equal(statement.receivables.transactions.length, 3);
  assert.equal(statement.receivables.transactions[1].credit, 25);
  assert.equal(statement.receivables.transactions[2].debit, 25);
  assert.equal(statement.receivables.closingBalance, 100);
  assert.equal(statement.receivables.currentOutstanding, 100);
});

test("flags legacy Credit Notes whose prior settlement edits cannot be reconstructed", () => {
  const legacyNote = {
    _id: "credit-note-legacy",
    creditNoteNumber: "CN-LEGACY",
    clientId: "customer-1",
    originalOrderId: "invoice-1",
    status: "Posted",
    creditNoteDate: date("2026-01-02T10:00:00.000Z"),
    createdAt: date("2026-01-02T10:00:00.000Z"),
    updatedAt: date("2026-01-04T10:00:00.000Z"),
    settlement: { adjustmentAmount: 10, customerCreditAmount: 0, refundAmount: 0 }
  };

  const statement = buildCustomerStatement({
    client: { ...client, outstanding_balance: 90, creditBalance: 3, creditBalanceAdjustment: 3, creditBalanceHistory: [] },
    orders: [{ ...order, payments: [] }],
    creditNotes: [legacyNote],
    fromDate: date("2026-01-01T00:00:00.000Z"),
    toDate: date("2026-01-05T00:00:00.000Z"),
    now: date("2026-01-05T00:00:00.000Z")
  });

  assert.equal(statement.receivables.currentOutstanding, 90);
  assert.equal(statement.receivables.reconcilesWithCustomerSummary, true);
  assert.ok(statement.warnings.some(warning => warning.includes("incomplete settlement history")));
});

test("excludes cancelled invoices from receivables consistently with the customer summary", () => {
  const statement = buildCustomerStatement({
    client: { ...client, outstanding_balance: 0 },
    orders: [{ ...order, status: "Cancelled" }],
    creditNotes: [],
    fromDate: date("2026-01-01T00:00:00.000Z"),
    toDate: date("2026-01-05T00:00:00.000Z"),
    now: date("2026-01-05T00:00:00.000Z")
  });

  assert.equal(statement.receivables.closingBalance, 0);
  assert.equal(statement.excludedCancelledInvoices, 1);
  assert.ok(statement.warnings.some(warning => warning.includes("cancelled invoice")));
});

test("rejects a date range that ends before it starts", () => {
  assert.throws(() => buildCustomerStatement({
    client,
    fromDate: date("2026-01-06T00:00:00.000Z"),
    toDate: date("2026-01-05T00:00:00.000Z")
  }), /start date must be on or before/);
});
