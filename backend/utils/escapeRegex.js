/**
 * Escape user-entered text before using it in a RegExp.
 * Search fields should match literal text, not interpret user input as a pattern.
 */
function escapeRegex(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { escapeRegex };
