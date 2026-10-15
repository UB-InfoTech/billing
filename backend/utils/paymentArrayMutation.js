/**
 * Build a compare-and-swap update for an invoice's payment history.
 *
 * Replacing a payment array from a stale document can otherwise remove another
 * user's concurrent payment. Match both the persisted payment snapshot and
 * current due balance before replacing the array.
 */
function buildPaymentArrayMutationOperation({
  orderId,
  createdBy,
  expectedDueAmount,
  expectedPayments,
  nextPayments,
  lastPaymentDate
}) {
  if (!orderId || createdBy === undefined || createdBy === null) {
    throw new TypeError("Invoice ID and business ownership are required.");
  }
  if (expectedDueAmount !== undefined && expectedDueAmount !== null &&
      (!Number.isFinite(Number(expectedDueAmount)) || Number(expectedDueAmount) < 0)) {
    throw new TypeError("Expected invoice balance must be a valid non-negative number.");
  }
  if (expectedPayments !== undefined && !Array.isArray(expectedPayments) && expectedPayments !== null) {
    throw new TypeError("Expected payment history must be an array or null.");
  }
  if (!Array.isArray(nextPayments)) {
    throw new TypeError("Updated payment history must be an array.");
  }
  if (lastPaymentDate !== null && lastPaymentDate !== undefined &&
      (!(lastPaymentDate instanceof Date) || Number.isNaN(lastPaymentDate.getTime()))) {
    throw new TypeError("Last payment date must be a valid date or null.");
  }

  return {
    filter: {
      _id: orderId,
      createdBy,
      dueAmount: expectedDueAmount === undefined
        ? { $exists: false }
        : expectedDueAmount,
      payments: expectedPayments === undefined
        ? { $exists: false }
        : expectedPayments
    },
    update: {
      $set: {
        payments: nextPayments,
        lastPaymentDate: lastPaymentDate ?? null
      }
    },
    options: { new: true, runValidators: true }
  };
}

module.exports = { buildPaymentArrayMutationOperation };
