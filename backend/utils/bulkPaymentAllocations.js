const round2 = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

/**
 * Validate and normalize bulk-payment invoice selections. Invalid IDs or
 * amounts must never be silently discarded because this changes allocations.
 */
function normalizePaymentUpdates(updates, isValidId) {
  if (!Array.isArray(updates) || updates.length === 0) {
    throw new Error("updates[] is required.");
  }
  if (typeof isValidId !== "function") {
    throw new TypeError("An invoice ID validator is required.");
  }

  const byId = new Map();
  for (const raw of updates) {
    const orderId = String(typeof raw === "string" ? raw : raw?.orderId ?? "").trim();
    if (!isValidId(orderId)) {
      throw new Error("One or more selected invoices have an invalid ID. Refresh and try again.");
    }

    const rawAmount = typeof raw === "string" ? 0 : raw?.amount ?? 0;
    const numericAmount = Number(rawAmount);
    if (!Number.isFinite(numericAmount)) {
      throw new Error("Each invoice allocation must be a valid number.");
    }

    const amount = round2(numericAmount);
    if (amount < 0) {
      throw new Error("Invoice allocations cannot be negative.");
    }

    const combined = round2((byId.get(orderId) || 0) + amount);
    if (!Number.isFinite(combined) || combined < 0) {
      throw new Error("Invoice allocation is invalid.");
    }
    byId.set(orderId, combined);
  }

  return [...byId.entries()].map(([orderId, amount]) => ({ orderId, amount }));
}

module.exports = { normalizePaymentUpdates, round2 };
