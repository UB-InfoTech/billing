const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeCalendarEventInput } = require("../utils/calendarEventInput");

test("normalizes valid event title and dates", () => {
  const result = normalizeCalendarEventInput({
    title: "  Follow up  ",
    start: "2026-10-13T09:00:00.000Z",
    end: "2026-10-13T10:00:00.000Z"
  });
  assert.equal(result.title, "Follow up");
  assert.equal(result.start.toISOString(), "2026-10-13T09:00:00.000Z");
  assert.equal(result.end.toISOString(), "2026-10-13T10:00:00.000Z");
});

test("uses start as end when an event has no end", () => {
  const result = normalizeCalendarEventInput({
    title: "Reminder",
    start: "2026-10-13T09:00:00.000Z"
  });
  assert.equal(result.end.getTime(), result.start.getTime());
});

test("rejects missing event title or invalid dates", () => {
  assert.throws(
    () => normalizeCalendarEventInput({ title: " ", start: "2026-10-13", end: "2026-10-13" }),
    error => error.status === 400 && /title is required/i.test(error.message)
  );
  assert.throws(
    () => normalizeCalendarEventInput({ title: "Reminder", start: "bad-date", end: "2026-10-13" }),
    error => error.status === 400 && /valid event dates/i.test(error.message)
  );
});

test("rejects an event end before its start", () => {
  assert.throws(
    () => normalizeCalendarEventInput({
      title: "Reminder",
      start: "2026-10-13T10:00:00.000Z",
      end: "2026-10-13T09:00:00.000Z"
    }),
    error => error.status === 400 && /end cannot be before start/i.test(error.message)
  );
});
