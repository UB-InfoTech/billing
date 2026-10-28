function normalizeInvoiceSequence(value) {
  const validNumberType = typeof value === "number";
  const validStringType = typeof value === "string";
  const normalizedString = validStringType ? value.trim() : "";

  // Do not let Number("") / Number(null) / Number(false) silently become zero.
  // Accept only non-negative integer numbers or digit-only strings from storage.
  if (
    (!validNumberType && !validStringType) ||
    (validStringType && !/^\d+$/.test(normalizedString))
  ) {
    const error = new Error("Invoice number sequence must be a whole number of zero or more.");
    error.status = 400;
    throw error;
  }

  const sequence = validNumberType ? value : Number(normalizedString);
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    const error = new Error("Invoice number sequence must be a whole number of zero or more.");
    error.status = 400;
    throw error;
  }
  return sequence;
}

module.exports = { normalizeInvoiceSequence };
