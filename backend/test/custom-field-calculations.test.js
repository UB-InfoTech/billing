const test=require("node:test");
const assert=require("node:assert/strict");
const {
  tokenize,
  evaluateArithmeticExpression,
  calculateConfiguredCustomFields
}=require("../utils/customFieldCalculations");

test("tokenizes only supported numbers, field names and arithmetic operators",()=>{
  assert.deepEqual(
    tokenize("(quantity * rate) - 2.5"),
    [
      {type:"operator",value:"("},
      {type:"identifier",value:"quantity"},
      {type:"operator",value:"*"},
      {type:"identifier",value:"rate"},
      {type:"operator",value:")"},
      {type:"operator",value:"-"},
      {type:"number",value:2.5}
    ]
  );
  for(const expression of ["process.exit()","quantity;rate","2 ** 4","\x60code\x60","1 + @"]){
    assert.throws(()=>tokenize(expression));
  }
});

test("evaluates arithmetic with precedence, grouping, percentages and negative values",()=>{
  assert.equal(evaluateArithmeticExpression("4 + 3 * 2"),10);
  assert.equal(evaluateArithmeticExpression("(4 + 3) * 2"),14);
  assert.equal(evaluateArithmeticExpression("-4 + 10 / 2"),1);
  assert.equal(evaluateArithmeticExpression("125 * 18 / 100"),22.5);
  assert.equal(evaluateArithmeticExpression("17 % 5"),2);
  assert.equal(evaluateArithmeticExpression("quantity * rate",{quantity:"4",rate:"25"}),100);
  assert.equal(evaluateArithmeticExpression("unknownField + 3",{}),3);
});

test("rejects divide-by-zero, malformed expressions and excessive input",()=>{
  for(const expression of ["10 / 0","10 % 0","1 +","(1 + 2","1 2","1 + )","1..2","9 / (3 - 3)"]){
    assert.throws(()=>evaluateArithmeticExpression(expression));
  }
  assert.throws(()=>tokenize("1".repeat(501)),/too long/i);
  assert.throws(()=>tokenize(Array(202).fill("1").join("+")),/too many parts/i);
  assert.throws(()=>evaluateArithmeticExpression("(".repeat(101)+"1"+")".repeat(101)),/nested too deeply/i);
});

test("calculates custom fields on the server and ignores a submitted calculated amount",()=>{
  const fields=[
    {key:"quantity",custom:true,fieldType:"number"},
    {key:"rate",custom:true,fieldType:"currency"},
    {key:"amount",label:"Amount",custom:true,fieldType:"currency",formula:"quantity * rate"}
  ];
  const saved=calculateConfiguredCustomFields(fields,{},{
    quantity:"4",
    rate:"25",
    amount:999
  });
  assert.deepEqual(saved,{quantity:"4",rate:"25",amount:100});
});

test("recalculates dependent custom fields regardless of their display order",()=>{
  const fields=[
    {key:"grandTotal",label:"Grand total",custom:true,fieldType:"currency",formula:"subtotal + delivery"},
    {key:"subtotal",label:"Subtotal",custom:true,fieldType:"currency",formula:"quantity * rate"},
    {key:"quantity",custom:true,fieldType:"number"},
    {key:"rate",custom:true,fieldType:"currency"},
    {key:"delivery",custom:true,fieldType:"currency"}
  ];
  const saved=calculateConfiguredCustomFields(fields,{},{
    quantity:3,
    rate:20,
    delivery:15,
    subtotal:0,
    grandTotal:0
  });
  assert.equal(saved.subtotal,60);
  assert.equal(saved.grandTotal,75);
});

test("does not calculate built-in fields or formula-like fields with unsupported types",()=>{
  const fields=[
    {key:"builtInAmount",custom:false,fieldType:"currency",formula:"quantity * rate"},
    {key:"textCalculation",custom:true,fieldType:"text",formula:"quantity * rate"},
    {key:"customAmount",custom:true,fieldType:"currency",formula:"quantity * rate"}
  ];
  const saved=calculateConfiguredCustomFields(fields,{quantity:2,rate:5},{
    builtInAmount:77,
    textCalculation:"keep this",
    customAmount:999
  });
  assert.deepEqual(saved,{
    builtInAmount:77,
    textCalculation:"keep this",
    customAmount:10
  });
});

test("returns a business-friendly error for invalid calculated values",()=>{
  const fields=[{
    key:"amount",
    label:"Invoice extra amount",
    custom:true,
    fieldType:"currency",
    formula:"quantity / divisor"
  }];
  assert.throws(
    ()=>calculateConfiguredCustomFields(fields,{quantity:10,divisor:0},{}),
    /Unable to calculate “Invoice extra amount”/i
  );
});
