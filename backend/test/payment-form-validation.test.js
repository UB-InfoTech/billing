const test=require("node:test");
const assert=require("node:assert/strict");
const {
  PAYMENT_BASE_FIELDS,
  mergeConfiguredPaymentFields,
  cleanIncomingCustomFields
}=require("../utils/paymentFormValidation");

test("payment system fields stay present, typed and protected in configured layouts",()=>{
  const fields=mergeConfiguredPaymentFields([
    {key:"amount",label:"Total received",fieldType:"text",required:false,visible:false,locked:false,options:["wrong"]},
    {key:"method",label:"Paid by",fieldType:"text",required:false,options:["Other"]},
    {key:"amountReference",label:"Reference code",fieldType:"textarea"},
    {key:"paymentDate",label:"Received on",fieldType:"text",required:false},
    {key:"collectionShift",label:"Collection shift",custom:true,fieldType:"select",options:["Morning","Evening"]}
  ]);

  assert.equal(fields.length,5);
  const amount=fields.find(field=>field.key==="amount");
  assert.equal(amount.label,"Total received");
  assert.equal(amount.fieldType,"currency");
  assert.equal(amount.required,true);
  assert.equal(amount.visible,true);
  assert.equal(amount.locked,true);
  assert.deepEqual(amount.validation,{min:0.01});

  const method=fields.find(field=>field.key==="method");
  assert.equal(method.fieldType,"select");
  assert.deepEqual(method.options,PAYMENT_BASE_FIELDS[1].options);
  assert.equal(method.locked,true);

  const reference=fields.find(field=>field.key==="amountReference");
  assert.equal(reference.fieldType,"text");
  const date=fields.find(field=>field.key==="paymentDate");
  assert.equal(date.fieldType,"date");
  assert.equal(date.required,true);
  assert.equal(date.locked,true);
  assert.ok(fields.some(field=>field.key==="collectionShift"&&field.custom));
});

test("custom payment metadata input is bounded and rejects unsafe names",()=>{
  assert.deepEqual(cleanIncomingCustomFields('{"collector":"abc","shift":"Morning"}'),{
    collector:"abc",shift:"Morning"
  });
  assert.throws(()=>cleanIncomingCustomFields("not-json"),/not valid/i);
  assert.throws(()=>cleanIncomingCustomFields([]),/not valid/i);
  assert.throws(()=>cleanIncomingCustomFields({constructor:"bad"}),/name is not valid/i);
  assert.throws(()=>cleanIncomingCustomFields(Object.fromEntries(
    Array.from({length:101},(_,index)=>[`field_${index}`,index])
  )),/no more than 100/i);
});

test("unconfigured custom fields cannot be newly introduced into a payment",()=>{
  const fields=mergeConfiguredPaymentFields([
    {key:"known",label:"Known",custom:true,fieldType:"text"}
  ]);
  const allowed=new Set(fields.filter(field=>field.custom).map(field=>field.key));
  const incoming=cleanIncomingCustomFields({known:"yes",unconfigured:"forged"});
  const accepted=Object.fromEntries(Object.entries(incoming).filter(([key])=>allowed.has(key)));
  assert.deepEqual(accepted,{known:"yes"});
});
