const test=require("node:test");
const assert=require("node:assert/strict");
const {
  sanitizeOrderCreateInput
}=require("../utils/orderInput");

test("invoice creation accepts entry fields but ignores client-supplied financial history",()=>{
  const sanitized=sanitizeOrderCreateInput({
    companyName:"Example Customer",
    taxPercentage:18,
    discountRate:5,
    payments:[{amount:999999}],
    creditAppliedAmount:500,
    paidAmount:999999,
    dueAmount:0,
    totalAmount:0,
    finalRevenue:0,
    roundOffFinalRevenue:0,
    paymentStatus:"Paid",
    statusHistory:[{status:"Completed"}],
    createdBy:"foreign-user",
    orderNumber:"FORGED-001",
    subOrders:[{
      orderName:"Embroidery",
      quantity:10,
      unitPrice:100,
      productId:"aaaaaaaaaaaaaaaaaaaaaaaa",
      customFields:{salesPerson:"A"},
      lineTotal:1,
      lineTotalBeforeDiscount:1
    }]
  });

  assert.equal(sanitized.companyName,"Example Customer");
  assert.equal(sanitized.taxPercentage,18);
  assert.equal(sanitized.discountRate,5);
  for(const field of [
    "payments","creditAppliedAmount","paidAmount","dueAmount","totalAmount",
    "finalRevenue","roundOffFinalRevenue","paymentStatus","statusHistory",
    "createdBy","orderNumber"
  ]){
    assert.equal(Object.hasOwn(sanitized,field),false,field+" must not be accepted");
  }
  assert.equal(sanitized.subOrders[0].quantity,10);
  assert.equal(sanitized.subOrders[0].unitPrice,100);
  assert.deepEqual(sanitized.subOrders[0].customFields,{salesPerson:"A"});
  assert.equal(Object.hasOwn(sanitized.subOrders[0],"lineTotal"),false);
});

test("custom fields are bounded and non-object values are ignored",()=>{
  const entries=Object.fromEntries(Array.from({length:105},(_,index)=>["field"+index,index]));
  const sanitized=sanitizeOrderCreateInput({customFields:entries});
  assert.equal(Object.keys(sanitized.customFields).length,100);
  assert.deepEqual(sanitizeOrderCreateInput({customFields:["not","an","object"]}).customFields,{});
});

test("nested item data cannot inject fields outside the supported invoice item model",()=>{
  const sanitized=sanitizeOrderCreateInput({
    subOrders:[{
      orderName:"Product",
      quantity:4,
      unitPrice:25,
      payments:[{amount:100}],
      status:"Paid",
      customFields:{color:"Blue"}
    }]
  });
  assert.equal(Object.hasOwn(sanitized.subOrders[0],"payments"),false);
  assert.equal(Object.hasOwn(sanitized.subOrders[0],"status"),false);
  assert.deepEqual(sanitized.subOrders[0].customFields,{color:"Blue"});
});
