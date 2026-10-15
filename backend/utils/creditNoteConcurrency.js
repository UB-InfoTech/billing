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

/**
 * Only posted Credit Notes belonging to the invoice owner consume available
 * credit value or item quantity. The owner is required to prevent cross-tenant
 * rows from affecting invoice validation.
 */
function buildPreviouslyCreditedFilter({ orderId, createdBy, excludeCreditNoteId = null }) {
  if (!orderId) throw new TypeError("Original invoice ID is required.");
  if (createdBy === undefined || createdBy === null) {
    throw new TypeError("Business ownership is required for Credit Note lookup.");
  }

  const filter = {
    originalOrderId: orderId,
    createdBy,
    status: "Posted"
  };
  if (excludeCreditNoteId) filter._id = { $ne: excludeCreditNoteId };
  return filter;
}

module.exports = { buildInvoiceCreditWriteFilter, buildPreviouslyCreditedFilter };
