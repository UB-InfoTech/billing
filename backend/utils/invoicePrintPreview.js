const {getInvoiceRevenue}=require("./syncClientData");
const {numberToWords}=require("./numberToWords");
const {getPublicOrganizationLogoUrl}=require("./organizationLogo");

const DEFAULT_COLUMNS=[
  {key:"sr",label:"#",width:5,order:0,visible:true},
  {key:"description",label:"Description",width:35,order:1,visible:true},
  {key:"quantity",label:"Qty",width:10,order:2,visible:true},
  {key:"unitPrice",label:"Rate",width:15,order:3,visible:true},
  {key:"amount",label:"Amount",width:15,order:4,visible:true}
];

const round2=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const money=value=>"₹ "+round2(value).toFixed(2);
const displayDate=value=>{
  const date=value?new Date(value):null;
  return date&&!Number.isNaN(date.getTime())?date.toLocaleDateString("en-IN"):"";
};

function buildInvoicePrintPreview({order={},profile={},client=null,invoiceConfig={},ownerId}={}){
  const companyAddress=[
    profile.companyAddress,
    profile.addressLine2,
    [profile.city,profile.district,profile.state,profile.pinCode,profile.country].filter(Boolean).join(", ")
  ].filter(Boolean).join(", ");
  const dueDate=new Date(order.orderDate||new Date());
  const paymentDays=Number(order.paymentTerms);
  if(Number.isFinite(paymentDays))dueDate.setDate(dueDate.getDate()+paymentDays);
  const isInterState=Number(order.stateCode)!==Number(profile.stateCode);
  const invoiceTotal=getInvoiceRevenue(order);
  const paid=number(order.paidAmount??(order.payments||[]).reduce((sum,item)=>sum+number(item.amount),0));
  const due=number(order.dueAmount);
  const tax=number(order.taxAmount);
  const discount=number(order.discountAmount);
  const subtotal=round2(number(order.totalCost)+discount);
  const halfTax=round2(tax/2);
  const igst=isInterState?tax:0;
  const paymentTerms=String(order.paymentTerms||"");
  const bankDetails=[profile.bankName,profile.accountNo,profile.branchName,profile.ifsc].filter(Boolean).join(" · ");
  const fields={
    company_name:String(profile.companyName||"Company"),
    company_address:companyAddress,
    company_gstin:String(profile.gstin||""),
    company_phone:[profile.phoneNumber1,profile.phoneNumber2].filter(Boolean).join(" / "),
    company_email:String(profile.emailAddress||""),
    customer_name:String(order.companyName||client?.companyName||client?.name||""),
    customer_address:String(order.Address||client?.address||""),
    customer_phone:String(client?.phone||""),
    customer_gstin:String(order.gstNumber||client?.gstNumber||""),
    customer_state:String(order.State||client?.state||""),
    invoice_title:String(invoiceConfig.invoiceTitle||"TAX INVOICE"),
    invoice_no:String(order.orderNumber||""),
    invoice_date:displayDate(order.orderDate),
    due_date:displayDate(dueDate),
    challan_no:String(order.challanNumber||""),
    payment_terms:paymentTerms==="Advance"?"Advance":paymentTerms?"Net "+paymentTerms+" days":"",
    eway_bill:String(order.ewbDetails?.ewbNo||"N/A"),
    subtotal:money(subtotal),
    discount:money(discount),
    taxable_value:money(order.totalCost),
    cgst:money(isInterState?0:halfTax),
    sgst:money(isInterState?0:halfTax),
    igst:money(igst),
    round_off:money(invoiceTotal-number(order.finalRevenue)),
    grand_total:money(invoiceTotal),
    amount_paid:money(paid),
    balance_due:money(due),
    amount_words:numberToWords(invoiceTotal),
    bank_details:bankDetails,
    terms:"Goods once sold will not be taken back or replaced. Any complaint should be made within 7 days. Subject to Surat jurisdiction.",
    signature:"For, "+String(profile.companyName||"Company")+" · Authorised Signatory"
  };
  const discountRate=number(order.discountRate);
  const items=(Array.isArray(order.subOrders)?order.subOrders:[]).map((item,index)=>{
    const unit=String(item.qtyUnit||"PCS");
    const entered=unit==="MTR"?number(item.MTR):number(item.quantity);
    const short=Math.max(0,number(item.shortPcs));
    const quantity=Math.max(0,entered-short);
    const amount=quantity*number(item.unitPrice);
    const taxable=amount*(1-discountRate/100);
    return {
      sr:String(index+1),
      description:String(item.orderName||""),
      designNumber:String(item.designNumber||""),
      hsnCode:String(item.hsnCode??""),
      quantity:String(unit==="MTR"?(item.quantity??0):quantity),
      qtyUnit:unit,
      cut:String(item.cut??0),
      MTR:String(unit==="MTR"?quantity:(item.MTR??0)),
      shortPcs:String(short),
      unitPrice:number(item.unitPrice).toFixed(2),
      amount:number(amount).toFixed(2),
      discount:discountRate.toFixed(2)+"%",
      taxable:number(taxable).toFixed(2)
    };
  });
  const itemColumns=(Array.isArray(invoiceConfig.itemColumns)?invoiceConfig.itemColumns:[])
    .filter(column=>column&&column.visible!==false&&typeof column.key==="string")
    .slice()
    .sort((a,b)=>number(a.order)-number(b.order))
    .map(column=>({key:column.key,label:String(column.label||column.key),width:number(column.width)||8}));
  return {
    record:{
      id:String(order._id||""),
      orderNumber:String(order.orderNumber||"Invoice"),
      companyName:String(fields.customer_name||"Customer"),
      orderDate:displayDate(order.orderDate),
      total:money(invoiceTotal)
    },
    fields,
    items,
    itemColumns:itemColumns.length?itemColumns:DEFAULT_COLUMNS,
    logoUrl:getPublicOrganizationLogoUrl(profile.logoUrl,ownerId),
    totals:{
      subtotal:fields.subtotal,
      discount:fields.discount,
      taxableValue:fields.taxable_value,
      tax:money(tax),
      grandTotal:fields.grand_total,
      paid:fields.amount_paid,
      due:fields.balance_due
    }
  };
}

module.exports={buildInvoicePrintPreview};
