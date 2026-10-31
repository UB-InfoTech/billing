const test=require("node:test");
const assert=require("node:assert/strict");
const {normalizeCustomValue}=require("../routes/tableConfigRoutes");

test("normalizes numeric and currency table values without accepting malformed input",()=>{
  assert.equal(normalizeCustomValue({fieldType:"number"},"12.345"),12.35);
  assert.equal(normalizeCustomValue({fieldType:"currency"},"0"),0);
  assert.equal(normalizeCustomValue({fieldType:"currency"},"   "),null);
  for(const value of ["not a number",{},[],true]){
    assert.throws(()=>normalizeCustomValue({fieldType:"number"},value),/valid number/i);
  }
});

test("accepts explicit Yes and No values and rejects ambiguous boolean input",()=>{
  for(const value of [true,1,"1","true","TRUE"])assert.equal(normalizeCustomValue({fieldType:"boolean"},value),true);
  for(const value of [false,0,"0","false","FALSE"])assert.equal(normalizeCustomValue({fieldType:"boolean"},value),false);
  assert.equal(normalizeCustomValue({fieldType:"boolean"},""),null);
  for(const value of ["yes","no","maybe","abc",{},[]]){
    assert.throws(()=>normalizeCustomValue({fieldType:"boolean"},value),/choose yes or no/i);
  }
});

test("validates single-choice and multiple-choice values against the saved options",()=>{
  const field={fieldType:"select",options:[{value:"retail",label:"Retail"},{value:"trade",label:"Trade"}]};
  assert.equal(normalizeCustomValue(field,"retail"),"retail");
  assert.equal(normalizeCustomValue({...field,fieldType:"multiselect"},["trade","retail","trade"]).length,2);
  assert.equal(normalizeCustomValue({...field,fieldType:"multiselect"},[]),null);
  assert.throws(()=>normalizeCustomValue(field,"unknown"),/valid option/i);
  assert.throws(()=>normalizeCustomValue(field,{value:"retail"}),/valid option/i);
  assert.throws(()=>normalizeCustomValue({...field,fieldType:"multiselect"},["retail","unknown"]),/valid options/i);
  assert.throws(()=>normalizeCustomValue({...field,fieldType:"multiselect"},Array(101).fill("retail")),/100 options/i);
});

test("accepts real calendar dates and rejects impossible dates",()=>{
  const field={fieldType:"date"};
  assert.equal(normalizeCustomValue(field,"2026-10-31"),"2026-10-31");
  assert.equal(normalizeCustomValue(field,""),null);
  for(const value of ["2026-02-29","2026-13-01","31-10-2026","2026-04-31","yesterday"]){
    assert.throws(()=>normalizeCustomValue(field,value),/valid date/i);
  }
});

test("validates local and timezone-qualified date-time values",()=>{
  const field={fieldType:"datetime"};
  assert.equal(normalizeCustomValue(field,"2026-10-31T14:45"),"2026-10-31T14:45");
  assert.equal(normalizeCustomValue(field,"2026-10-31T14:45:00+05:30"),"2026-10-31T14:45:00+05:30");
  assert.equal(normalizeCustomValue(field,""),null);
  for(const value of ["2026-02-30T14:45","2026-10-31T25:00","31/10/2026 14:45","not a date"]){
    assert.throws(()=>normalizeCustomValue(field,value),/valid date and time/i);
  }
});

test("requires references to be valid record identifiers and text values to be scalar",()=>{
  assert.equal(normalizeCustomValue({fieldType:"reference"},"507f1f77bcf86cd799439011"),"507f1f77bcf86cd799439011");
  assert.throws(()=>normalizeCustomValue({fieldType:"reference"},"not-an-id"),/existing record/i);
  assert.throws(()=>normalizeCustomValue({fieldType:"reference"},{_id:"507f1f77bcf86cd799439011"}),/existing record/i);
  assert.equal(normalizeCustomValue({fieldType:"text"},123),"123");
  assert.throws(()=>normalizeCustomValue({fieldType:"text"},{value:"bad"}),/text value/i);
});
