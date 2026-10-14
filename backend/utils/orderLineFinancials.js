const numberOrZero = value => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const round2 = value =>
  Math.round((numberOrZero(value) + Number.EPSILON) * 100) / 100;

/**
 * Use the same billable quantity rule as Order2.calculateFinancials:
 * MTR items use MTR, other items use piece quantity, short quantity is
 * subtracted, and the result cannot fall below zero.
 */
function getBillableQuantity(item = {}) {
  const unit = item.qtyUnit || "PCS";
  const quantity = numberOrZero(unit === "MTR" ? item.MTR : item.quantity);
  const shortQuantity = numberOrZero(item.shortPcs);
  return round2(Math.max(0, quantity - shortQuantity));
}

function getLineRevenue(item = {}) {
  const price = Math.max(0, numberOrZero(item.unitPrice));
  return round2(getBillableQuantity(item) * price);
}

/**
 * Mongo aggregation equivalent of getBillableQuantity, for use after
 * unwinding the $subOrders array in analytics/report pipelines.
 */
function buildMongoBillableQuantityExpression(prefix = "$subOrders") {
  const field = name => `${prefix}.${name}`;
  const quantity = {
    $cond: [
      { $eq: [{ $ifNull: [field("qtyUnit"), "PCS"] }, "MTR"] },
      { $ifNull: [field("MTR"), 0] },
      { $ifNull: [field("quantity"), 0] }
    ]
  };

  return {
    $max: [
      0,
      {
        $subtract: [
          quantity,
          { $ifNull: [field("shortPcs"), 0] }
        ]
      }
    ]
  };
}

module.exports = {
  getBillableQuantity,
  getLineRevenue,
  buildMongoBillableQuantityExpression
};
