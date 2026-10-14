/**
 * Build an atomic invoice payment append.
 *
 * The balance check belongs in the database write filter, not only in the
 * earlier invoice read: another request may have changed the due balance
 * while a bulk payment was being allocated.
 */
function buildPaymentAppendOperation({ orderId, createdBy, amount, payment, paymentDate }) {
  const normalizedAmount = Number(amount);

  if (!orderId || createdBy === undefined || createdBy === null) {
    throw new TypeError("Invoice ID and business ownership are required.");
  }
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new TypeError("Payment amount must be a finite number greater than zero.");
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
      dueAmount: { $gte: normalizedAmount }
    },
    update: {
      $push: { payments: payment },
      $set: { lastPaymentDate: paymentDate ?? payment.paymentDate }
    },
    options: { new: true, runValidators: true }
  };
}

module.exports = { buildPaymentAppendOperation };
