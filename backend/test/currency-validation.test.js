const test = require("node:test");
const assert = require("node:assert/strict");
const {
  toCurrencyCents,
  exceedsCurrencyLimit,
  meetsCurrencyTarget,
} = require("../utils/currencyValidation");

test("compares currency using whole paise rather than floating-point tolerances", () => {
  assert.equal(toCurrencyCents(0.1 + 0.2), 30);
  assert.equal(exceedsCurrencyLimit(100, 100), false);
  assert.equal(exceedsCurrencyLimit(100.01, 100), true);
  assert.equal(exceedsCurrencyLimit(99.99, 100), false);
});

test("does not mark an underpaid amount as fully settled when one paise remains", () => {
  assert.equal(meetsCurrencyTarget(99.99, 100), false);
  assert.equal(meetsCurrencyTarget(100, 100), true);
  assert.equal(meetsCurrencyTarget(100.01, 100), true);
});

test("rejects non-finite currency inputs", () => {
  assert.throws(() => toCurrencyCents("not-money"), /finite number/i);
  assert.throws(() => exceedsCurrencyLimit(100, Infinity), /finite number/i);
});
