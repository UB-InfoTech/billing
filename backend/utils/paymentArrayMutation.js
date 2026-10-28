/**
 * Build a compare-and-swap update for an invoice's payment history.
 *
 * Match the invoice revision and due balance before replacing its embedded
 * payment array. Using updatedAt for current records avoids fragile exact BSON
 * array equality while still preventing a stale edit from removing a concurrent
 * payment. Older records without a timestamp retain the legacy array guard.
 */
function buildPaymentArrayMutationOperation({
  orderId,
  createdBy,
  expectedDueAmount,
  expectedPayments,
  expectedUpdatedAt,
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

  const filter = {
    _id: orderId,
    createdBy,
    dueAmount: expectedDueAmount === undefined
      ? { $exists: false }
      : expectedDueAmount
  };
  const hasUpdatedAt = expectedUpdatedAt instanceof Date
    && !Number.isNaN(expectedUpdatedAt.getTime());

  if (hasUpdatedAt) {
    filter.updatedAt = expectedUpdatedAt;
  } else {
    // Legacy documents may not have timestamps. Retain the original history
    // guard for those records rather than making the update unguarded.
    filter.payments = expectedPayments === undefined
      ? { $exists: false }
      : expectedPayments;
  }

  return {
    filter,
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
