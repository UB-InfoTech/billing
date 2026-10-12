function invalidDateError(label) {
  const error = new Error("Invalid " + label + " date. Use YYYY-MM-DD.");
  error.status = 400;
  return error;
}

function parseDateOnly(value, label, endOfDay = false) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw invalidDateError(label);

  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  );
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw invalidDateError(label);
  }
  return date;
}

/**
 * Build an inclusive local-calendar-day range for invoice filtering.
 * Supports the legacy from / to aliases used by existing screens.
 */
function buildOrderDateRange(query = {}) {
  const startValue = query.startDate ?? query.from;
  const endValue = query.endDate ?? query.to;
  const start = parseDateOnly(startValue, "start");
  const end = parseDateOnly(endValue, "end", true);

  if (start && end && start > end) {
    const error = new Error("The start date must be on or before the end date.");
    error.status = 400;
    throw error;
  }

  const range = {};
  if (start) range.$gte = start;
  if (end) range.$lte = end;
  return Object.keys(range).length ? range : null;
}

module.exports = { buildOrderDateRange, parseDateOnly };
