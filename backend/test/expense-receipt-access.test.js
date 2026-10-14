const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getExpenseReceiptFilename,
  isExpenseReceiptOwnedBy,
  isPrivateExpenseUploadPath
} = require("../utils/expenseReceiptAccess");

const ownerA = "aaaaaaaaaaaaaaaaaaaaaaaa";
const ownerB = "bbbbbbbbbbbbbbbbbbbbbbbb";

test("extracts a safe receipt filename from the stored path or absolute URL", () => {
  assert.equal(
    getExpenseReceiptFilename("/uploads/expenses/" + ownerA + "-1760000000-abc123.pdf"),
    ownerA + "-1760000000-abc123.pdf"
  );
  assert.equal(
    getExpenseReceiptFilename("https://billing.example/uploads/expenses/" + ownerA + "-1760000000-abc123.pdf?download=1"),
    ownerA + "-1760000000-abc123.pdf"
  );
});

test("rejects path traversal, unsupported extensions and unrelated URLs", () => {
  assert.equal(getExpenseReceiptFilename("../../secret.pdf"), "");
  assert.equal(getExpenseReceiptFilename("/uploads/expenses/file.html"), "");
  assert.equal(getExpenseReceiptFilename("https://evil.example/secret.pdf"), "");
  assert.equal(getExpenseReceiptFilename(""), "");
});

test("new receipt filenames are scoped to the uploading business account", () => {
  const filename = ownerA + "-1760000000-abc123.png";
  assert.equal(isExpenseReceiptOwnedBy(filename, ownerA), true);
  assert.equal(isExpenseReceiptOwnedBy(filename, ownerB), false);
  assert.equal(isExpenseReceiptOwnedBy("../../" + filename, ownerA), false);
});

test("identifies private expense receipt paths after URL decoding and normalization", () => {
  assert.equal(isPrivateExpenseUploadPath("/expenses/receipt.pdf"), true);
  assert.equal(isPrivateExpenseUploadPath("/expenses"), true);
  assert.equal(isPrivateExpenseUploadPath("/expenses%2Freceipt.pdf"), true);
  assert.equal(isPrivateExpenseUploadPath("/old/../expenses/receipt.pdf"), true);
  assert.equal(isPrivateExpenseUploadPath("/other/receipt.pdf"), false);
  assert.equal(isPrivateExpenseUploadPath("/products/image.png"), false);
  assert.equal(isPrivateExpenseUploadPath("/expenses/%E0%A4%A"), true);
});
