/**
 * Ensure a status transition is represented once in history.
 * Workflow actions may already append the final status before the route
 * persists the record, so a second route-level append must be idempotent.
 */
function appendStatusTransition(history, previousStatus, currentStatus, previousTimestamp, timestamp = new Date()) {
  const entries = Array.isArray(history) ? history : [];

  if (String(previousStatus ?? "") === String(currentStatus ?? "")) {
    return entries;
  }

  if (!entries.length && previousStatus) {
    entries.push({
      status: previousStatus,
      timestamp: previousTimestamp || timestamp
    });
  }

  const lastEntry = entries[entries.length - 1];
  if (String(lastEntry?.status ?? "") !== String(currentStatus ?? "")) {
    entries.push({ status: currentStatus, timestamp });
  }

  return entries;
}

module.exports = { appendStatusTransition };
