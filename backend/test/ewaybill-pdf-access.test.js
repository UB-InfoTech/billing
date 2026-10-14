const test = require("node:test");
const assert = require("node:assert/strict");
const { validateRequestedEwayBill } = require("../utils/ewaybill/pdfAccess");

const order = { ewbDetails: { ewbNo: "  123456789012  " } };

test("allows a PDF download only for the invoice's saved E-Way Bill", () => {
  assert.equal(validateRequestedEwayBill(order, "123456789012"), "123456789012");
});

test("trims harmless surrounding whitespace before matching", () => {
  assert.equal(validateRequestedEwayBill(order, " 123456789012 "), "123456789012");
});

test("rejects a different E-Way Bill number", () => {
  assert.throws(
    () => validateRequestedEwayBill(order, "999999999999"),
    error => error.status === 404 && /does not belong/i.test(error.message)
  );
});

test("rejects missing or unrecorded E-Way Bill numbers", () => {
  assert.throws(() => validateRequestedEwayBill(order, ""), error => error.status === 404);
  assert.throws(() => validateRequestedEwayBill({ ewbDetails: {} }, "123456789012"), error => error.status === 404);
  assert.throws(() => validateRequestedEwayBill(null, "123456789012"), error => error.status === 404);
});
