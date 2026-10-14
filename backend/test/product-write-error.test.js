const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeProductWriteError } = require("../utils/productWriteError");

test("preserves ordinary validation errors", () => {
  const error = new Error("Rate cannot be negative.");
  assert.equal(normalizeProductWriteError(error), error);
});

test("converts concurrent product-code conflicts to a clear 409", () => {
  const error = normalizeProductWriteError({
    code: 11000,
    keyPattern: { createdBy: 1, productCode: 1 }
  });
  assert.equal(error.status, 409);
  assert.match(error.message, /Product code already exists/i);
});

test("converts barcode and serial-number conflicts to clear messages", () => {
  const barcode = normalizeProductWriteError({
    code: 11000,
    keyPattern: { createdBy: 1, barcode: 1 }
  });
  assert.equal(barcode.status, 409);
  assert.match(barcode.message, /Barcode already belongs/i);

  const serial = normalizeProductWriteError({
    code: 11000,
    keyPattern: { createdBy: 1, serialNumber: 1 }
  });
  assert.equal(serial.status, 409);
  assert.match(serial.message, /Serial number already belongs/i);
});

test("uses a safe generic message for unknown unique indexes", () => {
  const error = normalizeProductWriteError({ code: 11000, keyValue: { someOtherKey: "x" } });
  assert.equal(error.status, 409);
  assert.match(error.message, /identifier is already in use/i);
});
