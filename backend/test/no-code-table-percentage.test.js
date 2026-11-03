const test=require("node:test");
const assert=require("node:assert/strict");
const {normalizeCustomValue,sanitizeColumns}=require("../routes/tableConfigRoutes");

test("table percentage columns normalize numeric values and preserve decimals",()=>{
  const field={fieldType:"percentage"};
  assert.equal(normalizeCustomValue(field,"18.25"),18.25);
  assert.equal(normalizeCustomValue(field,0),0);
  assert.equal(normalizeCustomValue(field,100),100);
});

test("table percentage columns reject values outside the supported range",()=>{
  const field={fieldType:"percentage"};
  assert.throws(()=>normalizeCustomValue(field,"-0.01"),/between 0 and 100/i);
  assert.throws(()=>normalizeCustomValue(field,"100.01"),/between 0 and 100/i);
  assert.throws(()=>normalizeCustomValue(field,"not a number"),/between 0 and 100/i);
  assert.throws(()=>normalizeCustomValue(field,true),/valid percentage/i);
});

test("the table builder accepts percentage as a saved custom column type",()=>{
  const [column]=sanitizeColumns([{
    key:"commissionRate",
    label:"Commission %",
    kind:"custom",
    fieldType:"percentage"
  }]);
  assert.equal(column.fieldType,"percentage");
  assert.equal(column.kind,"custom");
});
