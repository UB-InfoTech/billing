const test = require("node:test");
const assert = require("node:assert/strict");
const {
  sumCustomerCredit,
  resolveClientCreditBalance,
  applyManualCreditAdjustment
} = require("../utils/clientCreditBalance");

const note = amount => ({ settlement: { customerCreditAmount: amount } });

test("preserves an existing legacy client balance on first sync", () => {
  const state = resolveClientCreditBalance(
    { creditBalance: 75 },
    [note(20), note(5)]
  );
  assert.equal(state.creditNoteTotal, 25);
  assert.equal(state.creditBalanceAdjustment, 50);
  assert.equal(state.creditBalance, 75);
});

test("uses the saved manual adjustment plus posted customer credits", () => {
  const state = resolveClientCreditBalance(
    { creditBalance: 99, creditBalanceAdjustment: -10 },
    [note(20), note(5)]
  );
  assert.equal(state.creditBalanceAdjustment, -10);
  assert.equal(state.creditBalance, 15);
});

test("manual adjustments remain reflected after customer sync", () => {
  const notes = [note(40)];
  const adjusted = applyManualCreditAdjustment(45, notes, -10);
  assert.equal(adjusted.creditBalance, 35);
  assert.equal(adjusted.creditBalanceAdjustment, -5);
  assert.equal(
    resolveClientCreditBalance(adjusted, notes).creditBalance,
    35
  );
});

test("manual adjustments reject invalid values and negative balances", () => {
  assert.throws(() => applyManualCreditAdjustment(10, [], 0), /non-zero/i);
  assert.throws(() => applyManualCreditAdjustment(10, [], -11), /cannot become negative/i);
  assert.equal(sumCustomerCredit([note(10), note(-5), note("bad")]), 10);
});
