const test=require("node:test");
const assert=require("node:assert/strict");
const {
  EWAYBILL_BASE_FIELDS,
  mergeConfiguredEwaybillFields,
  normalizeEwaybillValues
}=require("../utils/ewaybillFormValidation");

test("server keeps statutory E-Way Bill field types and choices fixed",()=>{
  const fields=mergeConfiguredEwaybillFields([
    {key:"supplyType",label:"Supply direction",fieldType:"text",required:false,options:["INVALID"]},
    {key:"transactionType",label:"Transaction option",fieldType:"text",options:["999"]},
    {key:"extraNote",label:"Extra note",custom:true,fieldType:"text",visible:true}
  ]);

  const supplyType=fields.find(field=>field.key==="supplyType");
  const transactionType=fields.find(field=>field.key==="transactionType");
  assert.equal(supplyType.label,"Supply direction");
  assert.equal(supplyType.fieldType,"select");
  assert.equal(supplyType.required,true);
  assert.deepEqual(supplyType.options,EWAYBILL_BASE_FIELDS[0].options);
  assert.equal(transactionType.fieldType,"select");
  assert.deepEqual(transactionType.options,EWAYBILL_BASE_FIELDS[2].options);
  assert.ok(fields.some(field=>field.key==="extraNote"&&field.custom));
});

test("server accepts valid E-Way Bill statutory values and normalizes distance",()=>{
  const result=normalizeEwaybillValues({
    supplyType:"O",
    subSupplyType:1,
    transactionType:"4",
    transMode:3,
    vehicleType:"R",
    transDistance:"125"
  });
  assert.equal(result.supplyType,"O");
  assert.equal(result.subSupplyType,"1");
  assert.equal(result.transactionType,"4");
  assert.equal(result.transMode,"3");
  assert.equal(result.vehicleType,"R");
  assert.equal(result.transDistance,125);
});

test("server rejects unsupported statutory values even if a saved builder option was tampered",()=>{
  for(const [key,value] of [
    ["supplyType","X"],
    ["subSupplyType","9"],
    ["transactionType","7"],
    ["transMode","9"],
    ["vehicleType","A"]
  ]){
    assert.throws(
      ()=>normalizeEwaybillValues({
        supplyType:"O",subSupplyType:"1",transactionType:"1",
        transMode:"1",vehicleType:"R",transDistance:0,[key]:value
      }),
      /valid/i,
      `expected ${key} to be rejected`
    );
  }
});

test("server rejects negative and non-numeric transport distances",()=>{
  const base={supplyType:"O",subSupplyType:"1",transactionType:"1",transMode:"1",vehicleType:"R"};
  assert.throws(()=>normalizeEwaybillValues({...base,transDistance:-1}),/non-negative/i);
  assert.throws(()=>normalizeEwaybillValues({...base,transDistance:"many"}),/non-negative/i);
});
