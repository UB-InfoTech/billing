const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeFields } = require("../routes/formConfigRoutes");
const {
  findRemovedFieldDependency,
  validateFieldReferences
} = require("../utils/formConfigValidation");

test("detects a removed field still referenced by a visibility rule", () => {
  const fields = [
    { key: "customerType", label: "Customer Type" },
    {
      key: "gstNumber",
      label: "GST Number",
      conditions: [{ fieldKey: "customerType", action: "show" }]
    }
  ];

  const dependency = findRemovedFieldDependency(fields, ["customerType"]);
  assert.equal(dependency?.field.key, "gstNumber");
  assert.equal(dependency?.removedKey, "customerType");
  assert.equal(dependency?.kind, "rule");
});

test("detects a removed field used as an auto-fill destination", () => {
  const fields = [
    { key: "client", label: "Customer" },
    {
      key: "invoice",
      label: "Invoice",
      dataSource: {
        autoFill: [{ targetKey: "gstNumber", sourceKey: "gstNumber" }]
      }
    }
  ];

  const dependency = findRemovedFieldDependency(fields, ["gstNumber"]);
  assert.equal(dependency?.kind, "auto-fill");
  assert.equal(dependency?.removedKey, "gstNumber");
});

test("detects a removed field used in a calculation", () => {
  const fields = [
    { key: "quantity", label: "Quantity" },
    { key: "rate", label: "Rate" },
    { key: "amount", label: "Amount", formula: "quantity * rate" }
  ];

  const dependency = findRemovedFieldDependency(fields, ["quantity"]);
  assert.equal(dependency?.kind, "calculation");
  assert.equal(dependency?.field.key, "amount");
  assert.equal(dependency?.removedKey, "quantity");
});

test("rejects rules that reference fields which no longer exist", () => {
  assert.throws(
    () => validateFieldReferences([
      {
        key: "gstNumber",
        label: "GST Number",
        conditions: [{ fieldKey: "customerType", action: "show" }]
      }
    ]),
    /rule.*no longer available/i
  );
});

test("rejects auto-fill mappings that point to missing destination fields", () => {
  assert.throws(
    () => validateFieldReferences([
      {
        key: "client",
        label: "Customer",
        dataSource: {
          autoFill: [{ targetKey: "gstNumber", sourceKey: "gstNumber" }]
        }
      }
    ]),
    /auto-fill mapping.*no longer available/i
  );
});

test("rejects circular calculations before a form is saved", () => {
  assert.throws(
    () => validateFieldReferences([
      { key: "subtotal", label: "Subtotal", formula: "total * rate" },
      { key: "total", label: "Total", formula: "subtotal + tax" },
      { key: "rate", label: "Rate" },
      { key: "tax", label: "Tax" }
    ]),
    /circular calculation/i
  );
});

test("accepts a valid calculation graph with existing field dependencies", () => {
  assert.doesNotThrow(() => validateFieldReferences([
    { key: "quantity", label: "Quantity" },
    { key: "rate", label: "Rate" },
    { key: "amount", label: "Amount", formula: "quantity * rate" }
  ]));
});

test("supports an optional action for fields made required by other rules", () => {
  const { FORM_CONDITION_ACTIONS } = require("../utils/formConfigValidation");
  assert.ok(FORM_CONDITION_ACTIONS.includes("require"));
  assert.ok(FORM_CONDITION_ACTIONS.includes("optional"));
});

test("persists optional condition actions without a schema validation error", async () => {
  const mongoose = require("mongoose");
  const FormConfiguration = require("../models/FormConfiguration");
  const config = new FormConfiguration({
    createdBy: new mongoose.Types.ObjectId(),
    formKey: "clients.form",
    fields: [{
      key: "gstNumber",
      label: "GST Number",
      conditions: [{
        action: "optional",
        fieldKey: "customerType",
        operator: "equals",
        value: "Individual"
      }]
    }]
  });

  await assert.doesNotReject(config.validate());
});


test("blank validation bounds remain unbounded after saving a form", () => {
  const [field] = sanitizeFields([{
    key: "unitPrice",
    label: "Unit price",
    fieldType: "currency",
    validation: { min: null, max: null, pattern: "" }
  }]);

  assert.equal(field.validation.min, null);
  assert.equal(field.validation.max, null);
});

test("missing and empty-string validation bounds remain unbounded", () => {
  const [missing] = sanitizeFields([{
    key: "quantity",
    label: "Quantity",
    fieldType: "number"
  }]);
  const [empty] = sanitizeFields([{
    key: "quantity",
    label: "Quantity",
    fieldType: "number",
    validation: { min: "", max: "   ", pattern: "" }
  }]);

  assert.equal(missing.validation.min, null);
  assert.equal(missing.validation.max, null);
  assert.equal(empty.validation.min, null);
  assert.equal(empty.validation.max, null);
});

test("explicit zero and positive validation bounds are preserved", () => {
  const [field] = sanitizeFields([{
    key: "quantity",
    label: "Quantity",
    fieldType: "number",
    validation: { min: 0, max: 250, pattern: "" }
  }]);

  assert.equal(field.validation.min, 0);
  assert.equal(field.validation.max, 250);
});

test("an invalid validation pattern is still rejected", () => {
  assert.throws(() => sanitizeFields([{
    key: "quantity",
    label: "Quantity",
    fieldType: "number",
    validation: { min: null, max: null, pattern: "[" }
  }]), /validation pattern.*not valid/i);
});

test("requires a linked-record source for reference fields", () => {
  assert.throws(() => sanitizeFields([{
    key: "accountManager",
    label: "Account manager",
    fieldType: "reference",
    dataSource: { type: "none", resource: "none" }
  }]), /choose a list.*account manager/i);
});

test("rejects linked lists that are not safely available to a business account", () => {
  assert.throws(() => sanitizeFields([{
    key: "supplier",
    label: "Supplier",
    fieldType: "text",
    dataSource: { type: "lookup", resource: "suppliers" }
  }]), /not available for this business/i);

  assert.throws(() => sanitizeFields([{
    key: "machine",
    label: "Machine",
    fieldType: "reference",
    dataSource: { type: "lookup", resource: "machines" }
  }]), /not available for this business/i);
});

test("requires choices for manual dropdown fields", () => {
  assert.throws(() => sanitizeFields([{
    key: "customerType",
    label: "Customer type",
    fieldType: "select",
    options: []
  }]), /add at least one choice.*customer type/i);
});

test("rejects unfinished conditional rules instead of silently dropping them", () => {
  assert.throws(() => sanitizeFields([{
    key: "discountReason",
    label: "Discount reason",
    fieldType: "text",
    conditions: [{ action: "show", fieldKey: "", operator: "equals", value: "Business" }]
  }]), /choose a field for every rule/i);
});

test("rejects unfinished auto-fill mappings instead of silently dropping them", () => {
  assert.throws(() => sanitizeFields([{
    key: "customer",
    label: "Customer",
    fieldType: "reference",
    dataSource: {
      type: "lookup",
      resource: "clients",
      autoFill: [{ targetKey: "gstNumber", sourceKey: "" }]
    }
  }]), /complete every auto-fill mapping/i);
});
