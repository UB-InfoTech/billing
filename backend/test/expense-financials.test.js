const test=require("node:test");
const assert=require("node:assert/strict");
const {normalizeExpenseFinancials}=require("../utils/expenseFinancials");

test("normalizes positive expense amount and computes tax to currency precision",()=>{
  assert.deepEqual(normalizeExpenseFinancials("125.50","18"),{
    amount:125.5,
    taxRate:18,
    taxAmount:22.59
  });
});

test("rejects zero, negative, and non-finite expense amounts",()=>{
  for(const amount of [0,"0",-1,"NaN","Infinity",undefined]){
    assert.throws(()=>normalizeExpenseFinancials(amount,5),/amount must be greater than zero/i);
  }
});

test("rejects non-finite tax rates instead of persisting NaN",()=>{
  for(const taxRate of ["NaN","Infinity",{}]){
    assert.throws(()=>normalizeExpenseFinancials(100,taxRate),/tax rate must be a valid number/i);
  }
});

test("clamps tax rates to the supported 0-100 percent range",()=>{
  assert.deepEqual(normalizeExpenseFinancials(100,-10),{
    amount:100,
    taxRate:0,
    taxAmount:0
  });
  assert.deepEqual(normalizeExpenseFinancials(100,140),{
    amount:100,
    taxRate:100,
    taxAmount:100
  });
});

test("defaults an omitted tax rate to zero",()=>{
  assert.deepEqual(normalizeExpenseFinancials(100),{
    amount:100,
    taxRate:0,
    taxAmount:0
  });
});
