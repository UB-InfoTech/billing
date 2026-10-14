const cents = value => {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.round((number + Number.EPSILON) * 100)
    : 0;
};

const normalizedNumber = value => {
  if (value === null || value === undefined || value === "") return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const normalizedDate = value => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toISOString().slice(0, 10);
};

/**
 * Invoice identity and billable details must stay consistent with posted
 * Credit Notes. Display-only data, status, notes and payment history are
 * deliberately omitted so routine maintenance remains possible.
 */
function getInvoiceSensitiveSnapshot(order = {}) {
  const subOrders = Array.isArray(order.subOrders) ? order.subOrders : [];
  return {
    orderNumber: String(order.orderNumber || "").trim(),
    orderDate: normalizedDate(order.orderDate),
    clientId: String(order.clientId?._id || order.clientId || ""),
    companyName: String(order.companyName || "").trim(),
    gstNumber: String(order.gstNumber || "").trim().toUpperCase(),
    address: String(order.Address || "").trim(),
    state: String(order.State || "").trim(),
    city: String(order.City || "").trim(),
    pinCode: String(order.pinCode || "").trim(),
    stateCode: String(order.stateCode || "").trim(),
    paymentTerms: String(order.paymentTerms || "").trim(),
    taxPercentage: normalizedNumber(order.taxPercentage),
    discountRate: normalizedNumber(order.discountRate),
    subOrders: subOrders.map(item => ({
      id: String(item?._id || item?.id || ""),
      productId: String(item?.productId?._id || item?.productId || ""),
      designNumber: String(item?.designNumber || "").trim(),
      orderName: String(item?.orderName || "").trim(),
      hsnCode: item?.hsnCode === null || item?.hsnCode === undefined || item?.hsnCode === ""
        ? ""
        : String(item.hsnCode),
      qtyUnit: String(item?.qtyUnit || "PCS").trim().toUpperCase(),
      quantity: normalizedNumber(item?.quantity),
      cut: normalizedNumber(item?.cut),
      MTR: normalizedNumber(item?.MTR),
      shortPcs: normalizedNumber(item?.shortPcs),
      unitPrice: normalizedNumber(item?.unitPrice)
    }))
  };
}

function hasInvoiceSensitiveChanges(before, after) {
  return JSON.stringify(getInvoiceSensitiveSnapshot(before))
    !== JSON.stringify(getInvoiceSensitiveSnapshot(after));
}

function getAppliedAmountCents(order = {}) {
  const payments = Array.isArray(order.payments) ? order.payments : [];
  const paymentCents = payments.reduce((sum, payment) => sum + cents(payment?.amount), 0);
  return paymentCents + cents(order.creditAppliedAmount);
}

/**
 * Reject a reduction that would leave previously received money or applied
 * customer credit greater than the revised invoice. Existing legacy
 * overpayments are not made harder to edit unless a further reduction is
 * proposed.
 */
function wouldReduceTotalBelowApplied(nextInvoiceTotal, previousInvoiceTotal, order = {}) {
  const nextCents = cents(nextInvoiceTotal);
  const previousCents = cents(previousInvoiceTotal);
  const appliedCents = getAppliedAmountCents(order);
  return nextCents < appliedCents && nextCents < previousCents;
}

module.exports = {
  getInvoiceSensitiveSnapshot,
  hasInvoiceSensitiveChanges,
  getAppliedAmountCents,
  wouldReduceTotalBelowApplied
};
