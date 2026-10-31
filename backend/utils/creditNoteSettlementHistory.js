const round2 = value =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

function toValidDate(value, fallback) {
  const date = value ? new Date(value) : new Date(fallback || Date.now());
  return Number.isNaN(date.getTime()) ? null : date;
}

function createSettlementHistoryEvent({
  eventType,
  effectiveAt,
  status,
  settlement = {},
  reconstructed = false
} = {}) {
  const effectiveDate = toValidDate(effectiveAt);
  if (!effectiveDate) throw new TypeError("A valid Credit Note settlement event date is required.");

  return {
    eventType: String(eventType || "edited"),
    effectiveAt: effectiveDate,
    recordedAt: new Date(),
    status: status === "Cancelled" ? "Cancelled" : "Posted",
    adjustmentAmount: round2(settlement.adjustmentAmount),
    customerCreditAmount: round2(settlement.customerCreditAmount),
    refundAmount: round2(settlement.refundAmount),
    reconstructed: Boolean(reconstructed)
  };
}

function getLegacySettlementHistory(note = {}) {
  const createdAt = toValidDate(note.creditNoteDate || note.createdAt || note.updatedAt);
  const updatedAt = toValidDate(note.updatedAt);
  const originalCreatedAt = toValidDate(note.createdAt);
  const mayHaveBeenEdited = Boolean(
    updatedAt
    && originalCreatedAt
    && updatedAt.getTime() - originalCreatedAt.getTime() > 1000
  );
  const events = [];

  if (note.status !== "Draft" && createdAt) {
    events.push(createSettlementHistoryEvent({
      eventType: "legacy-snapshot",
      effectiveAt: createdAt,
      status: "Posted",
      settlement: note.settlement,
      reconstructed: mayHaveBeenEdited
    }));
  }

  if (note.status === "Cancelled") {
    const cancelledAt = toValidDate(note.cancelledAt || note.updatedAt);
    if (cancelledAt) {
      events.push(createSettlementHistoryEvent({
        eventType: "cancelled",
        effectiveAt: cancelledAt,
        status: "Cancelled",
        settlement: {},
        reconstructed: mayHaveBeenEdited
      }));
    } else if (events.length) {
      events[events.length - 1] = {
        ...events[events.length - 1],
        status: "Cancelled",
        reconstructed: true
      };
    }
  }

  return events;
}

function appendSettlementHistoryEvent(note, event) {
  const existing = Array.isArray(note?.settlementHistory)
    ? note.settlementHistory.map(item =>
        typeof item?.toObject === "function" ? item.toObject() : { ...item }
      )
    : [];
  const base = existing.length ? existing : getLegacySettlementHistory(note);
  return [...base, createSettlementHistoryEvent(event)];
}

/**
 * Rebuild invoice credit effective by a payment date.
 * Old documents without recorded history are estimated from saved fields. When
 * timestamps show a legacy edit may have occurred, reliable is false so the
 * printed receipt can disclose this limitation.
 */
function getCreditAppliedAmountAt(notes = [], asOfDate) {
  const asOf = toValidDate(asOfDate);
  if (!asOf) return { amount: 0, reliable: false };

  let amount = 0;
  let reliable = true;

  for (const note of Array.isArray(notes) ? notes : []) {
    const hasHistory = Array.isArray(note?.settlementHistory)
      && note.settlementHistory.length > 0;
    const events = hasHistory
      ? note.settlementHistory.map((item, index) => ({
          ...(typeof item?.toObject === "function" ? item.toObject() : item),
          _index: index
        }))
      : getLegacySettlementHistory(note).map((item, index) => ({ ...item, _index: index }));

    if (events.some(event => event.reconstructed)) reliable = false;

    const applicable = events
      .filter(event => {
        const time = toValidDate(event.effectiveAt)?.getTime();
        return Number.isFinite(time) && time <= asOf.getTime();
      })
      .sort((left, right) =>
        new Date(left.effectiveAt).getTime() - new Date(right.effectiveAt).getTime()
        || left._index - right._index
      )
      .at(-1);

    if (applicable?.status === "Posted") {
      amount += Math.max(0, Number(applicable.adjustmentAmount || 0));
    }
  }

  return { amount: round2(amount), reliable };
}

module.exports = {
  createSettlementHistoryEvent,
  appendSettlementHistoryEvent,
  getLegacySettlementHistory,
  getCreditAppliedAmountAt
};
