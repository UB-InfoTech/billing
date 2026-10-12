const test = require("node:test");
const assert = require("node:assert/strict");
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
