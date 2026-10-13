function normalizeCalendarEventInput(input = {}) {
  const title = String(input.title ?? "").trim();
  const start = input.start instanceof Date ? new Date(input.start.getTime()) : new Date(input.start);
  const endValue = input.end ?? input.start;
  const end = endValue instanceof Date ? new Date(endValue.getTime()) : new Date(endValue);

  if (!title) {
    const error = new Error("Event title is required.");
    error.status = 400;
    throw error;
  }
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
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
