const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getBillableQuantity,
  getLineRevenue,
  buildMongoBillableQuantityExpression
} = require("../utils/orderLineFinancials");

test("piece-based items deduct short pieces without going negative", () => {
  assert.equal(getBillableQuantity({
    qtyUnit: "PCS",
    quantity: 10,
    shortPcs: 2
  }), 8);
  assert.equal(getBillableQuantity({
    qtyUnit: "PCS",
    quantity: 2,
    shortPcs: 5
  }), 0);
});

test("metre-based items bill from MTR rather than piece quantity", () => {
  assert.equal(getBillableQuantity({
    qtyUnit: "MTR",
    quantity: 1,
    MTR: 12,
    shortPcs: 2
  }), 10);
});

test("line revenue uses billable quantity and never a negative rate", () => {
  assert.equal(getLineRevenue({
    qtyUnit: "MTR",
    MTR: 10,
    shortPcs: 1,
    unitPrice: 25
  }), 225);
  assert.equal(getLineRevenue({
    qtyUnit: "PCS",
    quantity: 5,
    shortPcs: 5,
    unitPrice: 100
  }), 0);
  assert.equal(getLineRevenue({
    qtyUnit: "PCS",
    quantity: 2,
    unitPrice: -10
  }), 0);
});

test("Mongo analytics expression switches quantity field by unit and clamps at zero", () => {
  const expression = buildMongoBillableQuantityExpression();
  assert.deepEqual(expression, {
    $max: [
      0,
      {
        $subtract: [
          {
            $cond: [
              { $eq: [{ $ifNull: ["$subOrders.qtyUnit", "PCS"] }, "MTR"] },
              { $ifNull: ["$subOrders.MTR", 0] },
              { $ifNull: ["$subOrders.quantity", 0] }
            ]
          },
          { $ifNull: ["$subOrders.shortPcs", 0] }
        ]
      }
    ]
  });
});
