const test = require("node:test");
const assert = require("node:assert/strict");
const { buildInvoiceCreditWriteFilter, buildPreviouslyCreditedFilter } = require("../utils/creditNoteConcurrency");

test("Credit Note writes compare the invoice timestamp and financial revision", () => {
  const updatedAt = new Date("2026-10-15T07:00:00.000Z");
  const filter = buildInvoiceCreditWriteFilter({
    _id: "invoice-1",
    updatedAt,
    creditNoteCount: 3,
    creditAppliedAmount: 125.5
  }, "business-1");

  assert.equal(filter._id, "invoice-1");
  assert.equal(filter.createdBy, "business-1");
  assert.equal(filter.updatedAt, updatedAt);
  assert.equal(filter.creditNoteCount, 3);
  assert.equal(filter.creditAppliedAmount, 125.5);
});

test("Credit Note writes support older invoices with default or missing credit fields", () => {
  const filter = buildInvoiceCreditWriteFilter({
    _id: "invoice-1",
    creditNoteCount: 0,
    creditAppliedAmount: 0
  }, "business-1");

  assert.ok(filter.$and.some(clause =>
    clause.$or?.some(item => item.creditNoteCount?.$exists === false) &&
    clause.$or?.some(item => item.creditNoteCount === 0)
  ));
  assert.ok(filter.$and.some(clause =>
    clause.$or?.some(item => item.creditAppliedAmount?.$exists === false) &&
    clause.$or?.some(item => item.creditAppliedAmount === 0)
  ));
  assert.ok(filter.$and.some(clause =>
    clause.$or?.some(item => item.updatedAt?.$exists === false) &&
    clause.$or?.some(item => item.updatedAt === null)
  ));
});

test("Credit Note revision filters reject invalid ownership and financial snapshots", () => {
  assert.throws(() => buildInvoiceCreditWriteFilter({}, "business-1"), /Invoice ID/);
  assert.throws(() => buildInvoiceCreditWriteFilter({ _id: "invoice-1" }, null), /ownership/);
  assert.throws(() => buildInvoiceCreditWriteFilter({
    _id: "invoice-1",
    creditNoteCount: -1
  }, "business-1"), /count is invalid/);
  assert.throws(() => buildInvoiceCreditWriteFilter({
    _id: "invoice-1",
    creditAppliedAmount: -1
  }, "business-1"), /applied credit amount is invalid/);
});


test("available credit totals include only posted notes owned by the invoice business", () => {
  const filter = buildPreviouslyCreditedFilter({
    orderId: "invoice-1",
    createdBy: "business-1"
  });

  assert.deepEqual(filter, {
    originalOrderId: "invoice-1",
    createdBy: "business-1",
    status: "Posted"
  });
});

test("editing a Credit Note excludes only its own posted record", () => {
  const filter = buildPreviouslyCreditedFilter({
    orderId: "invoice-1",
    createdBy: "business-1",
    excludeCreditNoteId: "credit-note-1"
  });

  assert.deepEqual(filter, {
    originalOrderId: "invoice-1",
    createdBy: "business-1",
    status: "Posted",
    _id: { $ne: "credit-note-1" }
  });
});

test("prior-credit query cannot be built without a business owner", () => {
  assert.throws(
    () => buildPreviouslyCreditedFilter({ orderId: "invoice-1" }),
    /Business ownership is required/
  );
});
