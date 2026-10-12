const test = require("node:test");
const assert = require("node:assert/strict");
const Order = require("../models/Order2");

const calculate = Order.calculateFinancials;

test("calculates piece quantities, discount, tax, rounding and due balance", () => {
  const result = calculate({
    subOrders: [{
      qtyUnit: "PCS",
      quantity: 10,
      shortPcs: 2,
      unitPrice: 100
    }],
    discountRate: 10,
    taxPercentage: 18,
    payments: []
  });

  assert.equal(result.discountAmount, 80);
  assert.equal(result.totalCost, 720);
  assert.equal(result.taxAmount, 129.6);
  assert.equal(result.finalRevenue, 849.6);
  assert.equal(result.roundOffFinalRevenue, 850);
  assert.equal(result.roundOff, 0.4);
  assert.equal(result.paidAmount, 0);
  assert.equal(result.dueAmount, 850);
  assert.equal(result.paymentStatus, "Unpaid");
});

test("calculates metre quantities and treats recorded payments as partial", () => {
  const result = calculate({
    subOrders: [{
      qtyUnit: "MTR",
      MTR: 12,
      shortPcs: 2,
      quantity: 0,
      unitPrice: 25
    }],
    discountRate: 0,
    taxPercentage: 5,
    payments: [{ amount: 63 }]
  });

  assert.equal(result.totalCost, 250);
  assert.equal(result.taxAmount, 12.5);
  assert.equal(result.roundOffFinalRevenue, 263);
  assert.equal(result.paidAmount, 63);
  assert.equal(result.dueAmount, 200);
  assert.equal(result.paymentStatus, "Partial");
});

test("combines payment and applied customer credit without a negative due", () => {
  const result = calculate({
    subOrders: [{ qtyUnit: "PCS", quantity: 1, shortPcs: 0, unitPrice: 100 }],
    discountRate: 0,
    taxPercentage: 0,
    payments: [{ amount: 40 }],
    creditAppliedAmount: 10
  });

  assert.equal(result.paidAmount, 40);
  assert.equal(result.dueAmount, 50);
  assert.equal(result.paymentStatus, "Partial");
});

test("marks an exactly settled invoice as paid", () => {
  const result = calculate({
    subOrders: [{ qtyUnit: "PCS", quantity: 2, shortPcs: 0, unitPrice: 50 }],
    discountRate: 0,
    taxPercentage: 0,
    payments: [{ amount: 100 }]
  });

  assert.equal(result.roundOffFinalRevenue, 100);
  assert.equal(result.paidAmount, 100);
  assert.equal(result.dueAmount, 0);
  assert.equal(result.paymentStatus, "Paid");
});

test("does not bill negative quantity after short pieces are deducted", () => {
  const result = calculate({
    subOrders: [{ qtyUnit: "PCS", quantity: 2, shortPcs: 5, unitPrice: 100 }],
    discountRate: 0,
    taxPercentage: 0,
    payments: []
  });

  assert.equal(result.totalCost, 0);
  assert.equal(result.dueAmount, 0);
  assert.equal(result.roundOffFinalRevenue, 0);
});
