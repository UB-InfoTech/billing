const test = require("node:test");
const assert = require("node:assert/strict");
const {
  applyManualCreditAdjustment,
  buildClientCreditBalanceMutation,
  resolveClientCreditBalance
} = require("../utils/clientCreditBalance");

const customerId = "customer-1";
const businessId = "business-1";

test("manual adjustment preserves the established adjustment during a Credit Note write window", () => {
  // The balance delta has been applied, but the old posted note is not updated yet.
  const customer = {
    _id: customerId,
    createdBy: businessId,
    creditBalance: 60,
    creditBalanceAdjustment: 0,
    financialSummaryVersion: 1
  };
  const oldPostedNotes = [
    { settlement: { customerCreditAmount: 100 } }
  ];

  const manualMutation = buildClientCreditBalanceMutation({
    client: customer,
    creditNotes: oldPostedNotes,
    amount: 10,
    adjustmentDelta: 10
  });

  assert.equal(manualMutation.nextBalance, 70);
  assert.equal(manualMutation.creditBalanceAdjustment, 10);

  // Once the edited note is visible, the balance is still correct.
  const resolved = resolveClientCreditBalance(
    {
      ...customer,
      creditBalance: manualMutation.nextBalance,
      creditBalanceAdjustment: manualMutation.creditBalanceAdjustment,
      financialSummaryVersion: 2
    },
    [{ settlement: { customerCreditAmount: 60 } }]
  );
  assert.equal(resolved.creditBalance, 70);
});

test("legacy customer adjustment is materialized atomically with a Credit Note delta", () => {
  const customer = {
    _id: customerId,
    createdBy: businessId,
    creditBalance: 100
  };
  const postedNotes = [
    { settlement: { customerCreditAmount: 100 } }
  ];

  const mutation = buildClientCreditBalanceMutation({
    client: customer,
    creditNotes: postedNotes,
    amount: -40,
    minimumBalance: 100,
    insufficientBalanceMessage: "Credit was already used."
  });

  assert.equal(mutation.nextBalance, 60);
  assert.equal(mutation.creditBalanceAdjustment, 0);
  assert.equal(mutation.update.$inc.creditBalance, -40);
  assert.equal(mutation.update.$inc.financialSummaryVersion, 1);
  assert.equal(mutation.update.$set.creditBalanceAdjustment, 0);
  assert.equal(mutation.filter.creditBalance, 100);
  assert.equal(mutation.filter.createdBy, businessId);
  assert.ok(mutation.filter.$and.some(clause =>
    clause.$or?.some(option => option.creditBalanceAdjustment?.$exists === false)
  ));
  assert.ok(mutation.filter.$and.some(clause =>
    clause.$or?.some(option => option.financialSummaryVersion?.$exists === false)
  ));
});

test("customer-credit mutation matches the revision and both balance components", () => {
  const mutation = buildClientCreditBalanceMutation({
    client: {
      _id: customerId,
      createdBy: businessId,
      creditBalance: 125,
      creditBalanceAdjustment: 25,
      financialSummaryVersion: 9
    },
    creditNotes: [{ settlement: { customerCreditAmount: 100 } }],
    amount: 20,
    adjustmentDelta: 20
  });

  assert.equal(mutation.filter.creditBalance, 125);
  assert.equal(mutation.filter.creditBalanceAdjustment, 25);
  assert.equal(mutation.filter.financialSummaryVersion, 9);
  assert.equal(mutation.update.$inc.creditBalance, 20);
  assert.equal(mutation.update.$inc.financialSummaryVersion, 1);
  assert.equal(mutation.update.$set.creditBalanceAdjustment, 45);
});

test("customer-credit mutation refuses to reverse credit already spent", () => {
  assert.throws(() => buildClientCreditBalanceMutation({
    client: {
      _id: customerId,
      createdBy: businessId,
      creditBalance: 80,
      creditBalanceAdjustment: 0,
      financialSummaryVersion: 2
    },
    creditNotes: [{ settlement: { customerCreditAmount: 100 } }],
    amount: -40,
    minimumBalance: 100,
    insufficientBalanceMessage: "Credit was already used."
  }), /Credit was already used/);
});

test("manual adjustment uses the stored adjustment component when it is available", () => {
  const result = applyManualCreditAdjustment(25, [], -5, 12);
  assert.deepEqual(result, {
    creditBalance: 20,
    creditBalanceAdjustment: 7
  });
});
