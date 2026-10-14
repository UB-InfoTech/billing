function normalizeProductWriteError(error) {
  if (error?.code !== 11000) return error;

  const fields = Object.keys(error.keyPattern || error.keyValue || {});
  let message = "A product identifier is already in use. Refresh the product list and try again.";

  if (fields.includes("productCode")) {
    message = "Product code already exists in this business.";
  } else if (fields.includes("barcode")) {
    message = "Barcode already belongs to another product in this business.";
  } else if (fields.includes("serialNumber")) {
    message = "Serial number already belongs to another product in this business.";
  }

  const normalized = new Error(message);
  normalized.status = 409;
  normalized.code = error.code;
  normalized.field = fields[0] || null;
  return normalized;
}

module.exports = { normalizeProductWriteError };
