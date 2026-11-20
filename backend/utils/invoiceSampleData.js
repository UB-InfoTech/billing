const round2=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;

function buildSampleInvoiceOrder({ownerId,stateCode,state}={}){
  const subtotal=10000;
  const discountRate=5;
  const discountAmount=round2(subtotal*discountRate/100);
  const totalCost=round2(subtotal-discountAmount);
  const taxPercentage=18;
  const taxAmount=round2(totalCost*taxPercentage/100);
  const invoiceTotal=round2(totalCost+taxAmount);
  const paidAmount=5000;
  const normalizedStateCode=Number(stateCode);
  const customerStateCode=Number.isFinite(normalizedStateCode)&&normalizedStateCode>0?normalizedStateCode:24;

  return {
    createdBy:String(ownerId||""),
    orderNumber:"SAMPLE-INV-001",
    orderDate:new Date(),
    paymentTerms:"7",
    companyName:"Sample Customer Pvt. Ltd.",
    Address:"Ring Road, Surat, Gujarat 395002",
    State:String(state||"Gujarat"),
    stateCode:customerStateCode,
    gstNumber:"24ABCDE1234F1Z5",
    challanNumber:"SAMPLE-CH-001",
    discountRate,
    discountAmount,
    totalCost,
    taxPercentage,
    taxAmount,
    finalRevenue:invoiceTotal,
    roundOffFinalRevenue:invoiceTotal,
    totalAmount:invoiceTotal,
    paidAmount,
    dueAmount:round2(invoiceTotal-paidAmount),
    paymentStatus:"Partial",
    creditAppliedAmount:0,
    ewbDetails:{ewbNo:"SAMPLE-EWB-001"},
    payments:[{amount:paidAmount,method:"UPI",date:new Date()}],
    subOrders:[
      {orderName:"Premium Cotton Fabric",designNumber:"CF-100",hsnCode:"5208",quantity:10,qtyUnit:"PCS",unitPrice:500,shortPcs:0,cut:0,MTR:0},
      {orderName:"Embroidered Dress Material",designNumber:"EM-205",hsnCode:"5407",quantity:5,qtyUnit:"PCS",unitPrice:1000,shortPcs:0,cut:0,MTR:0}
    ]
  };
}

module.exports={buildSampleInvoiceOrder};
