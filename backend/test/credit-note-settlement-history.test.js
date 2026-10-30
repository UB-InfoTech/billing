const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSettlementHistoryEvent,
  appendSettlementHistoryEvent,
  getCreditAppliedAmountAt
} = require("../utils/creditNoteSettlementHistory");

const event = (eventType, effectiveAt, status, adjustmentAmount) =>
  createSettlementHistoryEvent({
    eventType,
    effectiveAt,
    status,
    settlement: { adjustmentAmount }
  });

test("credit applications affect balances only from their effective date", () => {
  const notes = [{
    settlementHistory: [
      event("posted", "2026-10-16T09:00:00.000Z", "Posted", 20)
    ]
  }];

  assert.deepEqual(getCreditAppliedAmountAt(notes, "2026-10-15T09:00:00.000Z"), {
    amount: 0,
    reliable: true
  });
  assert.deepEqual(getCreditAppliedAmountAt(notes, "2026-10-17T09:00:00.000Z"), {
    amount: 20,
    reliable: true
  });
});

test("editing a Credit Note preserves the previous settlement for earlier payments", () => {
  const note = {
    status: "Posted",
    createdAt: new Date("2026-10-10T09:00:00.000Z"),
    updatedAt: new Date("2026-10-10T09:00:00.000Z"),
    settlement: { adjustmentAmount: 20 },
    settlementHistory: [event("posted", "2026-10-10T09:00:00.000Z", "Posted", 20)]
  };
  note.settlementHistory = appendSettlementHistoryEvent(note, {
    eventType: "edited",
    effectiveAt: "2026-10-20T09:00:00.000Z",
    status: "Posted",
    settlement: { adjustmentAmount: 35 }
  });

  assert.equal(getCreditAppliedAmountAt([note], "2026-10-15T09:00:00.000Z").amount, 20);
  assert.equal(getCreditAppliedAmountAt([note], "2026-10-21T09:00:00.000Z").amount, 35);
});

test("cancellation reverses a Credit Note only from the cancellation date", () => {
  const note = {
    settlementHistory: [
      event("posted", "2026-10-10T09:00:00.000Z", "Posted", 20),
      event("cancelled", "2026-10-20T09:00:00.000Z", "Cancelled", 0)
    ]
  };

  assert.equal(getCreditAppliedAmountAt([note], "2026-10-15T09:00:00.000Z").amount, 20);
  assert.equal(getCreditAppliedAmountAt([note], "2026-10-21T09:00:00.000Z").amount, 0);
});

test("legacy Credit Notes that may have been edited are marked as estimates", () => {
  const note = {
    status: "Posted",
    creditNoteDate: new Date("2026-10-10T09:00:00.000Z"),
    createdAt: new Date("2026-10-10T09:00:00.000Z"),
    updatedAt: new Date("2026-10-12T09:00:00.000Z"),
    settlement: { adjustmentAmount: 25 }
  };

  const result = getCreditAppliedAmountAt([note], "2026-10-13T09:00:00.000Z");
  assert.equal(result.amount, 25);
  assert.equal(result.reliable, false);
});
