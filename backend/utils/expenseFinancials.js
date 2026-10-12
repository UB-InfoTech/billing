function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

/**
 * Use identical amount/tax normalization for creating and editing expenses.
 * Zero-value expenses are rejected on both paths to avoid inconsistent totals.
 */
function normalizeExpenseFinancials(amountValue, taxRateValue = 0) {
  const amount = Number(amountValue);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw validationError("Amount must be greater than zero.");
  }

  const rawTaxRate = taxRateValue === undefined || taxRateValue === null || taxRateValue === ""
    ? 0
    : Number(taxRateValue);
  if (!Number.isFinite(rawTaxRate)) {
    throw validationError("Tax rate must be a valid number.");
  }

  const taxRate = Math.min(100, Math.max(0, rawTaxRate));
  const round2 = value => Math.round((value + Number.EPSILON) * 100) / 100;

  return {
    amount,
    taxRate,
    taxAmount: round2(amount * taxRate / 100)
  };
}

module.exports = { normalizeExpenseFinancials };
