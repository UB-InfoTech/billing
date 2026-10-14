const test = require("node:test");
const assert = require("node:assert/strict");

test("yes/no fields normalize legacy string and numeric values safely", async () => {
  const { normalizeBooleanValue } = await import("../../frontend/src/utils/fieldValue.js");

  assert.equal(normalizeBooleanValue(true), true);
  assert.equal(normalizeBooleanValue(false), false);
  assert.equal(normalizeBooleanValue("true"), true);
  assert.equal(normalizeBooleanValue("false"), false);
  assert.equal(normalizeBooleanValue("YES"), true);
  assert.equal(normalizeBooleanValue("no"), false);
  assert.equal(normalizeBooleanValue(1), true);
  assert.equal(normalizeBooleanValue(0), false);
  assert.equal(normalizeBooleanValue(null), false);
  assert.equal(normalizeBooleanValue(undefined), false);
});
