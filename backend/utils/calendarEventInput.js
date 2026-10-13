function parseEventDate(value) {
  if (value === undefined || value === null || value === "") return null;
  const date = value instanceof Date
    ? new Date(value.getTime())
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeCalendarEventInput(input = {}) {
  const title = String(input.title ?? "").trim();
  const start = parseEventDate(input.start);
  const end = parseEventDate(input.end ?? input.start);

  if (!title) {
    const error = new Error("Event title is required.");
    error.status = 400;
    throw error;
  }
  if (!start || !end) {
    const error = new Error("Valid event dates are required.");
    error.status = 400;
    throw error;
  }
  if (end < start) {
    const error = new Error("Event end cannot be before start.");
    error.status = 400;
    throw error;
  }

  return { title, start, end };
}

module.exports = { normalizeCalendarEventInput };
