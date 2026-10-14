const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeColumns } = require("../routes/tableConfigRoutes");

const mergedColumn = separator => ({
  key: "combined_customer",
  label: "Customer location",
  kind: "merged",
  sourceKeys: ["companyName", "city"],
  separator
});

test("preserves intentional spaces around a combined-column separator", () => {
  const [column] = sanitizeColumns([mergedColumn(" - ")]);
  assert.equal(column.separator, " - ");
});

test("uses a readable space when a combined-column separator is omitted", () => {
  const [column] = sanitizeColumns([{
    key: "combined_customer",
    label: "Customer location",
    kind: "merged",
    sourceKeys: ["companyName", "city"]
  }]);
  assert.equal(column.separator, " ");
});

test("removes line breaks from separators without trimming intentional spaces", () => {
  const [column] = sanitizeColumns([mergedColumn("  /\t\n  ")]);
  assert.equal(column.separator, "  /    ");
});

test("limits separator length to a safe display width", () => {
  const [column] = sanitizeColumns([mergedColumn("x".repeat(100))]);
  assert.equal(column.separator.length, 40);
});
