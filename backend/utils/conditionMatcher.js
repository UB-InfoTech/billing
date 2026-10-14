function numericConditionMatches(current, expected, operator) {
  // An empty form value is not the number zero. Treat blank or malformed
  // operands as "not matched" so automations do not run on missing input.
  if (
    current === null || current === undefined || String(current).trim() === "" ||
    expected === null || expected === undefined || String(expected).trim() === ""
  ) {
    return false;
  }

  const currentNumber = Number(current);
  const expectedNumber = Number(expected);
  if (!Number.isFinite(currentNumber) || !Number.isFinite(expectedNumber)) {
    return false;
  }

  if (operator === "greater_than") return currentNumber > expectedNumber;
  if (operator === "less_than") return currentNumber < expectedNumber;
  return false;
}

module.exports = { numericConditionMatches };
