const test = require("node:test");
const assert = require("node:assert/strict");
const { buildInvoiceLedger } = require("../utils/customerStatement");

const date = value => new Date(value);
const snapshot = (invoiceTotal, orderDate = "2026-01-01T09:00:00.000Z", clientId = "customer-1") => ({
  invoiceTotal,
  clientId,
  orderDate: date(orderDate),
  orderNumber: "INV-001"
});

test("invoice history shows invoice edits, payment changes and Credit Note settlement deltas in balance order", () => {
  const order = {
    _id: "invoice-1",
    orderNumber: "INV-001",
    clientId: "customer-1",
    orderDate: date("2026-01-01T09:00:00.000Z"),
    createdAt: date("2026-01-01T09:00:00.000Z"),
    roundOffFinalRevenue: 120,
    totalAmount: 120,
    paidAmount: 30,
    creditAppliedAmount: 0,
    dueAmount: 90,
    financialHistory: [
      {
        eventType: "created",
        effectiveAt: date("2026-01-01T09:00:00.000Z"),
        next: snapshot(100)
      },
      {
        eventType: "edited",
        effectiveAt: date("2026-01-05T09:00:00.000Z"),
        recordedAt: date("2026-01-05T09:00:00.000Z"),
        previous: snapshot(100),
        next: snapshot(120)
      }
    ],
    payments: [
      {
        _id: "payment-1",
        amount: 30,
        paymentDate: date("2026-01-02T09:00:00.000Z"),
        method: "UPI"
      }
    ],
    paymentHistory: [
      {
        action: "added",
        paymentId: "payment-1",
        effectiveAt: date("2026-01-02T09:00:00.000Z"),
        recordedAt: date("2026-01-02T09:00:00.000Z"),
        after: { amount: 40, paymentDate: date("2026-01-02T09:00:00.000Z"), method: "UPI" }
      },
      {
        action: "edited",
        paymentId: "payment-1",
        effectiveAt: date("2026-01-03T09:00:00.000Z"),
        recordedAt: date("2026-01-03T09:00:00.000Z"),
        before: { amount: 40, paymentDate: date("2026-01-02T09:00:00.000Z"), method: "UPI" },
        after: { amount: 30, paymentDate: date("2026-01-02T09:00:00.000Z"), method: "UPI" }
      },
      {
        action: "added",
        paymentId: "payment-2",
        effectiveAt: date("2026-01-04T09:00:00.000Z"),
        recordedAt: date("2026-01-04T09:00:00.000Z"),
        after: { amount: 10, paymentDate: date("2026-01-04T09:00:00.000Z"), method: "Cash" }
      },
      {
        action: "deleted",
        paymentId: "payment-2",
        effectiveAt: date("2026-01-05T10:00:00.000Z"),
        recordedAt: date("2026-01-05T10:00:00.000Z"),
        before: { amount: 10, paymentDate: date("2026-01-04T09:00:00.000Z"), method: "Cash" }
      }
    ]
  };
  const creditNotes = [{
    _id: "credit-note-1",
    creditNoteNumber: "CN-001",
    status: "Cancelled",
    settlementHistory: [
      {
        eventType: "posted",
        effectiveAt: date("2026-01-06T09:00:00.000Z"),
        status: "Posted",
        adjustmentAmount: 15,
        customerCreditAmount: 5,
        refundAmount: 3
      },
      {
        eventType: "edited",
        effectiveAt: date("2026-01-07T09:00:00.000Z"),
        status: "Posted",
        adjustmentAmount: 20,
        customerCreditAmount: 7,
        refundAmount: 4
      },
      {
        eventType: "cancelled",
        effectiveAt: date("2026-01-08T09:00:00.000Z"),
        status: "Cancelled",
        adjustmentAmount: 0,
        customerCreditAmount: 0,
        refundAmount: 0
      }
    ]
  }];

  const ledger = buildInvoiceLedger({ order, creditNotes });
  const types = ledger.transactions.map(row => row.type);
  assert.deepEqual(types.filter(type => type === "Invoice"), ["Invoice"]);
  assert.equal(types.filter(type => type === "Invoice adjustment").length, 1);
  assert.equal(types.filter(type => type === "Payment").length, 2);
  assert.equal(types.filter(type => type === "Payment adjustment").length, 1);
  assert.equal(types.filter(type => type === "Payment reversal").length, 1);
  assert.equal(types.filter(type => type === "Credit Note").length, 3);

  const postedCredit = ledger.transactions.find(row =>
    row.type === "Credit Note" && row.description.includes("Credit Note issued")
  );
  assert.equal(postedCredit.credit, 15);
  assert.equal(postedCredit.description.includes("Refund recorded ₹3.00"), true);
  assert.equal(postedCredit.balanceAfter, 75);

  assert.equal(ledger.summary.invoiceTotal, 120);
  assert.equal(ledger.summary.paidAmount, 30);
  assert.equal(ledger.summary.ledgerBalance, 90);
  assert.equal(ledger.summary.savedDueAmount, 90);
  assert.equal(ledger.summary.reconcilesWithSavedDue, true);
  assert.equal(ledger.warnings.length, 0);
});

test("legacy invoices and unaudited payments disclose reconstructed history", () => {
  const ledger = buildInvoiceLedger({
    order: {
      _id: "legacy-invoice",
      orderNumber: "OLD-001",
      clientId: "customer-1",
      orderDate: date("2025-01-01T09:00:00.000Z"),
      roundOffFinalRevenue: 100,
      paidAmount: 20,
      creditAppliedAmount: 0,
      dueAmount: 80,
      payments: [{
        _id: "legacy-payment",
        amount: 20,
        paymentDate: date("2025-01-02T09:00:00.000Z"),
        method: "Cash"
      }],
      paymentHistory: [],
      financialHistory: []
    },
    creditNotes: []
  });

  assert.equal(ledger.summary.ledgerBalance, 80);
  assert.equal(ledger.summary.reconcilesWithSavedDue, true);
  assert.equal(ledger.warnings.length, 2);
  assert.match(ledger.warnings[0], /no detailed total-change history/);
  assert.match(ledger.warnings[1], /no detailed change history/);
});

test("invoice total edits after a customer transfer remain visible without changing the invoice balance on transfer", () => {
  const order = {
    _id: "transferred-invoice",
    orderNumber: "INV-TRANSFER",
    clientId: "customer-2",
    orderDate: date("2026-02-01T09:00:00.000Z"),
    roundOffFinalRevenue: 110,
    paidAmount: 0,
    dueAmount: 110,
    financialHistory: [
      {
        eventType: "created",
        effectiveAt: date("2026-02-01T09:00:00.000Z"),
        next: snapshot(100, "2026-02-01T09:00:00.000Z", "customer-1")
      },
      {
        eventType: "edited",
        effectiveAt: date("2026-02-03T09:00:00.000Z"),
        recordedAt: date("2026-02-03T09:00:00.000Z"),
        previous: snapshot(100, "2026-02-01T09:00:00.000Z", "customer-1"),
        next: snapshot(100, "2026-02-01T09:00:00.000Z", "customer-2")
      },
      {
        eventType: "edited",
        effectiveAt: date("2026-02-04T09:00:00.000Z"),
        recordedAt: date("2026-02-04T09:00:00.000Z"),
        previous: snapshot(100, "2026-02-01T09:00:00.000Z", "customer-2"),
        next: snapshot(110, "2026-02-01T09:00:00.000Z", "customer-2")
      }
    ],
    payments: [],
    paymentHistory: []
  };

  const ledger = buildInvoiceLedger({ order, creditNotes: [] });
  assert.deepEqual(ledger.transactions.map(row => row.type), ["Invoice", "Invoice adjustment"]);
  assert.equal(ledger.summary.ledgerBalance, 110);
  assert.equal(ledger.summary.reconcilesWithSavedDue, true);
});
