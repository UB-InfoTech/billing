const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isNoCodeSourceSafe,
  buildNoCodeSourceQuery,
  getNoCodeSourceProjection,
} = require("../utils/noCodeSourcePolicy");

const fakeModel = paths => ({
  schema: {
    path(name) {
      return paths.includes(name) ? { path: name } : undefined;
    },
  },
});

test("workspace-owned sources are scoped to the authenticated account", () => {
  const model = fakeModel(["createdBy", "name", "phone"]);
  assert.equal(isNoCodeSourceSafe(model, {}), true);
  assert.deepEqual(buildNoCodeSourceQuery(model, "owner-123", {}), {
    createdBy: "owner-123",
  });
});

test("global collections without ownership are not exposed to lookup builders", () => {
  const supplierModel = fakeModel(["name", "gstin"]);
  assert.equal(isNoCodeSourceSafe(supplierModel, {}), false);
  assert.equal(buildNoCodeSourceQuery(supplierModel, "owner-123", {}), null);
});

test("user lookup is restricted to the current account, not all registered users", () => {
  const userModel = fakeModel(["username", "email", "password"]);
  assert.equal(isNoCodeSourceSafe(userModel, userModel), true);
  assert.deepEqual(buildNoCodeSourceQuery(userModel, "user-456", userModel), {
    _id: "user-456",
  });
});

test("lookup results include only fields displayed in the no-code picker", () => {
  const model = fakeModel(["username", "email", "password", "creditBalance"]);
  const source = {
    fields: [["username", "Name"], ["email", "Email"]],
  };
  assert.deepEqual(getNoCodeSourceProjection(source, model), ["username", "email"]);
});
