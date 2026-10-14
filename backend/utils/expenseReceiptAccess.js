const path = require("path");

const ALLOWED_RECEIPT_EXTENSION = /\.(?:jpe?g|png|gif|webp|pdf)$/i;

function getExpenseReceiptFilename(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  let pathname = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      pathname = new URL(raw).pathname;
    } catch {
      return "";
    }
  }

  pathname = pathname.split(/[?#]/, 1)[0].replace(/\\/g, "/");
  let filename = "";

  const storedPath = pathname.match(/(?:^|\/)uploads\/expenses\/([^/]+)$/i);
  if (storedPath) {
    filename = storedPath[1];
  } else if (!pathname.includes("/") && !pathname.includes(":")) {
    filename = pathname;
  }

  if (!filename || path.basename(filename) !== filename || filename === "." || filename === "..") {
    return "";
  }
  if (!/^[A-Za-z0-9_-]+\.(?:jpe?g|png|gif|webp|pdf)$/i.test(filename)) {
    return "";
  }
  return filename;
}

function isExpenseReceiptOwnedBy(filename, ownerId) {
  const safeFilename = getExpenseReceiptFilename(filename);
  const safeOwner = String(ownerId ?? "").trim();
  if (!safeFilename || !/^[a-f0-9]{24}$/i.test(safeOwner)) return false;
  return safeFilename.toLowerCase().startsWith(safeOwner.toLowerCase() + "-");
}

module.exports = {
  getExpenseReceiptFilename,
  isExpenseReceiptOwnedBy,
  ALLOWED_RECEIPT_EXTENSION
};
