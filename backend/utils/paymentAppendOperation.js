/**
 * Build an atomic invoice payment append.
 *
 * Match the due balance observed during validation exactly. That makes a
 * competing payment or credit adjustment fail this write instead of letting
 * a pre-update snapshot overwrite the invoice's calculated financial totals.
 */
function buildPaymentAppendOperation({
  orderId,
  createdBy,
  amount,
  expectedDueAmount,
  payment,
  paymentDate,
  paymentHistoryEvent
}) {
  const normalizedAmount = Number(amount);
  const expectedDue = Number(expectedDueAmount);

  if (!orderId || createdBy === undefined || createdBy === null) {
    throw new TypeError("Invoice ID and business ownership are required.");
  }
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new TypeError("Payment amount must be a finite number greater than zero.");
  }
  if (!Number.isFinite(expectedDue) || expectedDue < 0) {
    throw new TypeError("Expected invoice balance must be a valid non-negative number.");
  }
  if (Math.round(normalizedAmount * 100) > Math.round(expectedDue * 100)) {
    throw new TypeError("Payment amount exceeds the expected invoice balance.");
  }
  if (!payment || typeof payment !== "object" || Array.isArray(payment)) {
    throw new TypeError("A payment record is required.");
  }

  const paymentAmount = Number(payment.amount);
  if (
    !Number.isFinite(paymentAmount) ||
    Math.round(paymentAmount * 100) !== Math.round(normalizedAmount * 100)
  ) {
    throw new TypeError("Payment record amount must match the allocation amount.");
  }

  return {
    filter: {
      _id: orderId,
      createdBy,
      status: { $ne: "Cancelled" },
      // Exact-match the balance observed by the caller. A stale write returns
      // no document, allowing the route to report a retryable conflict.
      dueAmount: expectedDue
    },
    update: {
      $push: paymentHistoryEvent
        ? { payments: payment, paymentHistory: paymentHistoryEvent }
        : { payments: payment },
      $set: { lastPaymentDate: paymentDate ?? payment.paymentDate }
    },
    options: { new: true, runValidators: true }
  };
}

module.exports = { buildPaymentAppendOperation };
