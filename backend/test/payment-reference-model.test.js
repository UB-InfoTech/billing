const test = require("node:test");
const assert = require("node:assert/strict");
const PaymentReference = require("../models/PaymentReference");

test("payment references have a unique owner-and-reference index", () => {
  const uniqueIndex = PaymentReference.schema.indexes().find(([keys, options]) =>
    keys.createdBy === 1 &&
    keys.reference === 1 &&
    options.unique === true
  );

  assert.ok(uniqueIndex, "A unique compound index must prevent concurrent reuse by the same business owner.");
});

test("payment reference reservations permit one shared batch reference across invoice allocations", () => {
  const index = PaymentReference.schema.indexes().find(([keys, options]) =>
    keys.createdBy === 1 && keys.reference === 1 && options.unique === true
  );

  assert.deepEqual(index[0], { createdBy: 1, reference: 1 });
  assert.equal(PaymentReference.schema.path("kind").enumValues.includes("bulk"), true);
  assert.equal(PaymentReference.schema.path("kind").enumValues.includes("single"), true);
});
