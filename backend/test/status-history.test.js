const test = require("node:test");
const assert = require("node:assert/strict");
const { appendStatusTransition } = require("../utils/statusHistory");

test("adds one status entry for a normal transition", () => {
  const history = [{ status: "Pending", timestamp: new Date("2026-01-01T00:00:00Z") }];
  appendStatusTransition(history, "Pending", "Completed", null, new Date("2026-01-02T00:00:00Z"));
  assert.deepEqual(history.map(entry => entry.status), ["Pending", "Completed"]);
});

test("does not duplicate a final status already added by a workflow", () => {
  const history = [
    { status: "Pending", timestamp: new Date("2026-01-01T00:00:00Z") },
    { status: "In Process", timestamp: new Date("2026-01-02T00:00:00Z") },
    { status: "Completed", timestamp: new Date("2026-01-03T00:00:00Z") }
  ];

  appendStatusTransition(history, "Pending", "Completed", null, new Date("2026-01-04T00:00:00Z"));
  assert.deepEqual(history.map(entry => entry.status), ["Pending", "In Process", "Completed"]);
});

test("seeds legacy history with the previous status before the first transition", () => {
  const history = [];
  appendStatusTransition(
    history,
    "Pending",
    "Dispatched",
    new Date("2026-01-01T00:00:00Z"),
    new Date("2026-01-05T00:00:00Z")
  );

  assert.deepEqual(history.map(entry => entry.status), ["Pending", "Dispatched"]);
  assert.equal(history[0].timestamp.toISOString(), "2026-01-01T00:00:00.000Z");
});

test("does not alter history when status did not change", () => {
  const history = [{ status: "Completed", timestamp: new Date("2026-01-01T00:00:00Z") }];
  const originalTimestamp = history[0].timestamp;
  appendStatusTransition(history, "Completed", "Completed", null, new Date("2026-01-02T00:00:00Z"));
  assert.equal(history.length, 1);
  assert.equal(history[0].timestamp, originalTimestamp);
});
