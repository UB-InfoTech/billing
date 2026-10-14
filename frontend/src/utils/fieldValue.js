/**
 * Convert stored yes/no values into a real boolean.
 * Older/custom defaults can be saved as strings, where Boolean("false")
 * incorrectly evaluates to true.
 */
export function normalizeBooleanValue(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (value == null) return false;
  return ["true", "1", "yes", "on"].includes(String(value).trim().toLowerCase());
}
