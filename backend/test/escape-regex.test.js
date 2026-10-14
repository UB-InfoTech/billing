const test = require("node:test");
const assert = require("node:assert/strict");
const { escapeRegex } = require("../utils/escapeRegex");

test("escapes regex metacharacters so search is literal", () => {
  const text = "INV-10 (A+B) [special].*?";
  const matcher = new RegExp("^" + escapeRegex(text) + "$", "i");
  assert.equal(matcher.test(text), true);
  assert.equal(matcher.test("INV-10 ABBB special"), false);
});

test("treats backslashes and brackets as literal text", () => {
  const text = String.raw`Design\[A]\B`;
  const matcher = new RegExp("^" + escapeRegex(text) + "$");
  assert.equal(matcher.test(text), true);
  assert.equal(matcher.test("DesignA B"), false);
});

test("converts nullish input to a safe empty string", () => {
  assert.equal(escapeRegex(null), "");
  assert.equal(escapeRegex(undefined), "");
});
