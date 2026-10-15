/**
 * Compare-and-swap filter for changes that post, edit, or cancel a Credit Note.
 * Both timestamp and credit fields are matched so concurrent financial writes
 * cannot silently reuse an invoice snapshot.
 */
function buildInvoiceCreditWriteFilter(order, createdBy) {
  if (!order?._id || createdBy === undefined || createdBy === null) {
    throw new TypeError("Invoice ID and business ownership are required.");
  }

  const filter = { _id: order._id, createdBy };
  const clauses = [];

  if (order.updatedAt instanceof Date && !Number.isNaN(order.updatedAt.getTime())) {
    filter.updatedAt = order.updatedAt;
  } else {
    clauses.push({
      $or: [
        { updatedAt: { $exists: false } },
        { updatedAt: null }
      ]
    });
  }

  const creditNoteCount = Number(order.creditNoteCount || 0);
  if (!Number.isFinite(creditNoteCount) || creditNoteCount < 0) {
    throw new TypeError("Invoice Credit Note count is invalid.");
  }
  if (creditNoteCount === 0) {
    clauses.push({
      $or: [
        { creditNoteCount: 0 },
        { creditNoteCount: { $exists: false } },
        { creditNoteCount: null }
      ]
    });
  } else {
    filter.creditNoteCount = creditNoteCount;
  }

  const creditAppliedAmount = Number(order.creditAppliedAmount || 0);
  if (!Number.isFinite(creditAppliedAmount) || creditAppliedAmount < 0) {
    throw new TypeError("Invoice applied credit amount is invalid.");
  }
  if (creditAppliedAmount === 0) {
    clauses.push({
      $or: [
        { creditAppliedAmount: 0 },
        { creditAppliedAmount: { $exists: false } },
        { creditAppliedAmount: null }
      ]
    });
  } else {
    filter.creditAppliedAmount = creditAppliedAmount;
  }

  if (clauses.length) filter.$and = clauses;
  return filter;
}

module.exports = { buildInvoiceCreditWriteFilter };
