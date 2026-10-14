const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getAppliedAmountCents,
  hasInvoiceSensitiveChanges,
  wouldReduceTotalBelowApplied
} = require("../utils/orderEditPolicy");

const invoice = overrides => ({
  orderNumber: "INV-00001",
  orderDate: new Date("2026-10-01T00:00:00.000Z"),
  clientId: "aaaaaaaaaaaaaaaaaaaaaaaa",
  companyName: "Example Customer",
  gstNumber: "24ABCDE1234F1Z5",
  Address: "Main Road",
  State: "Gujarat",
  City: "Vadodara",
  pinCode: "390001",
  stateCode: "24",
  paymentTerms: "30",
  taxPercentage: 5,
  discountRate: 0,
  subOrders: [{
    _id: "bbbbbbbbbbbbbbbbbbbbbbbb",
    productId: "cccccccccccccccccccccccc",
    orderName: "Fabric",
    designNumber: "D-1",
    qtyUnit: "PCS",
    quantity: 10,
    cut: 0,
    MTR: 0,
    shortPcs: 0,
    unitPrice: 100
  }],
  payments: [],
  creditAppliedAmount: 0,
  ...overrides
});

test("routine status and note edits do not count as billable invoice changes", () => {
  const before = invoice({ status: "Pending", note: "Before" });
  const after = invoice({ status: "Completed", note: "After" });
  assert.equal(hasInvoiceSensitiveChanges(before, after), false);
});

test("equivalent numeric strings and date values do not trigger false invoice changes", () => {
  const before = invoice();
  const after = invoice({
    orderDate: "2026-10-01",
    taxPercentage: "5",
    discountRate: "0",
    subOrders: [{
      ...before.subOrders[0],
      quantity: "10",
      unitPrice: "100",
      shortPcs: "0"
    }]
  });
  assert.equal(hasInvoiceSensitiveChanges(before, after), false);
});

test("changes to billable items or linked customer are detected", () => {
  const before = invoice();
  const changedPrice = invoice({
    subOrders: [{ ...before.subOrders[0], unitPrice: 90 }]
  });
  const changedCustomer = invoice({ clientId: "dddddddddddddddddddddddd" });
  assert.equal(hasInvoiceSensitiveChanges(before, changedPrice), true);
  assert.equal(hasInvoiceSensitiveChanges(before, changedCustomer), true);
});

test("changes to tax, invoice number or bill date are detected", () => {
  const before = invoice();
  assert.equal(hasInvoiceSensitiveChanges(before, invoice({ taxPercentage: 18 })), true);
  assert.equal(hasInvoiceSensitiveChanges(before, invoice({ orderNumber: "INV-00002" })), true);
  assert.equal(hasInvoiceSensitiveChanges(before, invoice({ orderDate: "2026-10-02" })), true);
});

test("counts payment history and applied customer credit in paise", () => {
  assert.equal(getAppliedAmountCents(invoice({
    payments: [{ amount: 12.34 }, { amount: 50.01 }],
    creditAppliedAmount: 7.65
  })), 7000);
});

test("blocks reducing an invoice below already received money or applied credit", () => {
  const order = invoice({
    payments: [{ amount: 700 }],
    creditAppliedAmount: 150
  });
  assert.equal(wouldReduceTotalBelowApplied(800, 900, order), true);
  assert.equal(wouldReduceTotalBelowApplied(850, 900, order), false);
  assert.equal(wouldReduceTotalBelowApplied(950, 900, order), false);
});

test("does not block a further edit solely because a legacy invoice is already overpaid", () => {
  const order = invoice({ payments: [{ amount: 900 }] });
  assert.equal(wouldReduceTotalBelowApplied(850, 800, order), false);
  assert.equal(wouldReduceTotalBelowApplied(800, 850, order), true);
});
