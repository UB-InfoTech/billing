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

test("percentage table defaults are validated when the column is saved",()=>{
  const [valid]=sanitizeColumns([{key:"taxRate",label:"Tax rate",kind:"custom",fieldType:"percentage",defaultValue:"18"}]);
  assert.equal(valid.defaultValue,18);
  assert.throws(()=>sanitizeColumns([{key:"taxRate",label:"Tax rate",kind:"custom",fieldType:"percentage",defaultValue:"125"}]),/between 0 and 100/i);
});

test("table custom columns accept image and file attachment types",()=>{
  for(const fieldType of ["image","file"]){
    const [column]=sanitizeColumns([{key:"attachment_"+fieldType,label:fieldType==="image"?"Product image":"Supporting file",kind:"custom",fieldType,defaultValue:"must-be-cleared"}]);
    assert.equal(column.fieldType,fieldType);
    assert.equal(column.defaultValue,"");
  }
});

test("table attachment values must be valid file IDs",()=>{
  for(const fieldType of ["image","file"]){
    assert.throws(()=>normalizeCustomValue({fieldType},"not-a-file-id"),/uploaded file/i);
    assert.equal(normalizeCustomValue({fieldType},null),null);
  }
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
