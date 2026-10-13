const test=require("node:test");
const assert=require("node:assert/strict");
const {buildEwaybillPayload}=require("../services/ewaybill/payloadBuilder");

test("E-Way Bill payload uses the stored rounded invoice total for legacy records",()=>{
  const payload=buildEwaybillPayload(
    {
      orderNumber:"INV-00001",
      orderDate:"2026-10-13",
      gstNumber:"24ABCDE1234F1Z5",
      stateCode:"24",
      companyName:"Customer",
      totalCost:720,
      taxPercentage:18,
      discountRate:10,
      roundOffFinalRevenue:0,
      finalRevenue:849.6,
      totalAmount:850,
      subOrders:[]
    },
    {},
    {
      gstin:"24ABCDE1234F1Z5",
      stateCode:"24",
      pinCode:"390001",
      companyName:"Business"
    }
  );

  assert.equal(payload.totInvValue,850);
});

test("E-Way Bill payload rounds finalRevenue only when stored totals are unavailable",()=>{
  const payload=buildEwaybillPayload(
    {
      orderNumber:"INV-00002",
      orderDate:"2026-10-13",
      gstNumber:"24ABCDE1234F1Z5",
      stateCode:"24",
      totalCost:100,
      taxPercentage:0,
      discountRate:0,
      roundOffFinalRevenue:0,
      finalRevenue:100.5,
      subOrders:[]
    },
    {},
    {gstin:"24ABCDE1234F1Z5",stateCode:"24",pinCode:"390001"}
  );

  assert.equal(payload.totInvValue,101);
});
