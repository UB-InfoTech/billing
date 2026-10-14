function normalizeInvoiceSequence(value) {
  const sequence = Number(value);
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    const error = new Error("Invoice number sequence must be a whole number of zero or more.");
    error.status = 400;
    throw error;
  }
  return sequence;
}

module.exports = { normalizeInvoiceSequence };
