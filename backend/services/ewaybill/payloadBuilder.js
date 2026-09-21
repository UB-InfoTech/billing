function round2(v){return Math.round((Number(v||0)+Number.EPSILON)*100)/100;}

function buildEwaybillPayload(order,body,profile){
  if(!profile?.gstin)throw new Error("Company GSTIN is required for E-Way Bill.");
  if(!order?.gstNumber)throw new Error("Customer GSTIN is required for E-Way Bill.");
  if(!order?.orderNumber&&!order?.challanNumber)throw new Error("Invoice or challan number is required.");
  const docDate=new Date(order.orderDate||new Date());
  const formatDate=d=>{const x=new Date(d);return String(x.getUTCDate()).padStart(2,"0")+"/"+String(x.getUTCMonth()+1).padStart(2,"0")+"/"+x.getUTCFullYear();};
  const taxRate=Number(order.taxPercentage||0);
  const sameState=Number(order.stateCode)===Number(profile.stateCode);
  const taxableTotal=round2(order.totalCost||0);
  const discountRate=Number(order.discountRate||0);

  const itemList=(order.subOrders||[]).map(sub=>{
    const qtyUnit=String(sub.qtyUnit||"PCS").toUpperCase();
    const rawQty=qtyUnit==="MTR"?Number(sub.MTR||0):Number(sub.quantity||0);
    const short=Number(sub.shortPcs||0);
    const quantity=round2(Math.max(0,rawQty-short));
    const gross=round2(quantity*Number(sub.unitPrice||0));
    const discount=round2(gross*discountRate/100);
    const taxableAmount=round2(gross-discount);
    const itemTaxRate=taxRate;
    return{
      productName:String(sub.orderName||sub.designNumber||"Item"),
      productDesc:String(sub.designNumber||sub.orderName||""),
      hsnCode:Number(sub.hsnCode||0),
      quantity,
      qtyUnit:qtyUnit==="MTR"?"MTR":qtyUnit==="PCS"?"NOS":qtyUnit,
      cgstRate:sameState?round2(itemTaxRate/2):0,
      sgstRate:sameState?round2(itemTaxRate/2):0,
      igstRate:sameState?0:itemTaxRate,
      cessRate:0,
      cessNonadvol:0,
      taxableAmount
    };
  }).filter(x=>x.quantity>0);

  const cgstValue=sameState?round2(taxableTotal*taxRate/200):0;
  const sgstValue=cgstValue;
  const igstValue=sameState?0:round2(taxableTotal*taxRate/100);

  return{
    supplyType:body.supplyType||"O",
    subSupplyType:String(body.subSupplyType||"1"),
    subSupplyDesc:String(body.subSupplyDesc||""),
    docType:String(body.docType||"INV"),
    docNo:String(order.orderNumber||order.challanNumber||""),
    docDate:formatDate(docDate),
    fromGstin:String(profile.gstin),
    fromTrdName:String(profile.companyName||""),
    fromAddr1:String(profile.companyAddress||""),
    fromPlace:String(profile.companyAddress||""),
    fromPincode:Number(profile.pinCode||0),
    actFromStateCode:Number(profile.stateCode||0),
    fromStateCode:Number(profile.stateCode||0),
    toGstin:String(order.gstNumber),
    toTrdName:String(order.companyName||""),
    toAddr1:String(order.Address||""),
    toPlace:String(order.City||""),
    toPincode:Number(order.pinCode||0),
    actToStateCode:Number(order.stateCode||0),
    toStateCode:Number(order.stateCode||0),
    transactionType:Number(body.transactionType||1),
    otherValue:0,
    totalValue:taxableTotal,
    cgstValue,
    sgstValue,
    igstValue,
    cessValue:0,
    cessNonAdvolValue:0,
    totInvValue:Number(order.roundOffFinalRevenue||order.finalRevenue||0),
    transporterId:body.transporterId||"",
    transporterName:body.transporterName||"",
    transDocNo:body.transDocNo||"",
    transMode:String(body.transMode||"1"),
    transDistance:String(body.transDistance||"0"),
    transDocDate:body.transDocDate?formatDate(body.transDocDate):"",
    vehicleNo:body.vehicleNo||"",
    vehicleType:body.vehicleType||"R",
    itemList
  };
}
module.exports={buildEwaybillPayload};