const test = require("node:test");
const assert = require("node:assert/strict");
const { buildClientCreditBalanceSyncFilter } = require("../utils/clientCreditBalance");

test("customer summary filter matches the revision that was read", () => {
  const filter = buildClientCreditBalanceSyncFilter({
    _id: "client-1",
    createdBy: "business-1",
    creditBalance: 120,
    creditBalanceAdjustment: 20,
    financialSummaryVersion: 7
  });

  assert.equal(filter.financialSummaryVersion, 7);
  assert.equal(filter.creditBalance, 120);
  assert.equal(filter.creditBalanceAdjustment, 20);
});

test("legacy customers without a summary revision can be upgraded atomically", () => {
  const filter = buildClientCreditBalanceSyncFilter({
    _id: "client-1",
    createdBy: "business-1",
    creditBalance: 0,
    creditBalanceAdjustment: 0
  });

  assert.ok(
    filter.$and.some(clause =>
      Array.isArray(clause.$or) &&
      clause.$or.some(option => option.financialSummaryVersion?.$exists === false) &&
      clause.$or.some(option => option.financialSummaryVersion === null) &&
      clause.$or.some(option => option.financialSummaryVersion === 0)
    )
  );
});

test("summary revisions do not remove existing credit-balance conflict guards", () => {
  const filter = buildClientCreditBalanceSyncFilter({
    _id: "client-1",
    createdBy: "business-1",
    creditBalance: 40,
    creditBalanceAdjustment: 10,
    financialSummaryVersion: 2
  });

  assert.equal(filter.creditBalance, 40);
  assert.equal(filter.creditBalanceAdjustment, 10);
  assert.equal(filter.financialSummaryVersion, 2);
});
