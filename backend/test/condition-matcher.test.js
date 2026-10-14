const test = require("node:test");
const assert = require("node:assert/strict");
const { numericConditionMatches } = require("../utils/conditionMatcher");

test("blank operands never match numeric comparison rules", () => {
  assert.equal(numericConditionMatches("", 5, "less_than"), false);
  assert.equal(numericConditionMatches(undefined, 5, "less_than"), false);
  assert.equal(numericConditionMatches(5, "", "greater_than"), false);
  assert.equal(numericConditionMatches(null, null, "greater_than"), false);
});

test("valid numeric values use numeric comparison semantics", () => {
  assert.equal(numericConditionMatches("3.5", "5", "less_than"), true);
  assert.equal(numericConditionMatches("6", 5, "greater_than"), true);
  assert.equal(numericConditionMatches("5", 5, "greater_than"), false);
  assert.equal(numericConditionMatches(4, 4, "less_than"), false);
});

test("malformed and non-finite operands never match numeric rules", () => {
  assert.equal(numericConditionMatches("not a number", 5, "less_than"), false);
  assert.equal(numericConditionMatches(Infinity, 5, "greater_than"), false);
  assert.equal(numericConditionMatches(5, "NaN", "less_than"), false);
});
