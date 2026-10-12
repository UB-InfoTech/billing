const { parseDateOnly } = require("./orderDateRange");

function buildExpenseDateRange(query = {}) {
  const start = parseDateOnly(query.startDate, "start");
  const end = parseDateOnly(query.endDate, "end", true);

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

module.exports = { buildExpenseDateRange };
