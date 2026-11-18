const test=require("node:test");
const assert=require("node:assert/strict");
const path=require("node:path");
const ejs=require("ejs");

const templatePath=path.join(__dirname,"../public/invoiceTable.ejs");
const baseConfig={
  pageSize:"A4",accentColor:"#172335",invoiceTitle:"TAX INVOICE",
  header:{showHeaderTitle:true,showCompanyName:true,showGST:true,showPhones:true,showAddress:true},
  receiver:{showName:true,showAddress:true,showMobile:true,showState:true,showGSTIN:true},
  invoiceDetails:{showChallan:true,showInvoiceNo:true,showInvoiceDate:true,showDueDate:true,showPaymentTerms:true,showEwayBill:true},
  itemColumns:[
    {key:"sr",label:"#",visible:true,order:0,width:5},
    {key:"description",label:"Description",visible:true,order:1,width:35},
    {key:"quantity",label:"Qty",visible:true,order:2,width:10},
    {key:"unitPrice",label:"Rate",visible:true,order:3,width:15},
    {key:"amount",label:"Amount",visible:true,order:4,width:15}
  ],
  summary:{showDiscount:true,showTax:true,showRoundOff:true,showBankDetails:true,showTerms:true,showWebCredit:true}
};
const locals={
  publicUploadBaseUrl:"https://billing.example.com",
  profileLogoUrl:"",profileHeaderTitle:"TAX INVOICE",profileCompanyName:"Sample Business",profileCompanyAddress:"Surat, Gujarat",
  profileEmailAddress:"office@example.com",profileWebsite:"example.com",profilePhoneNumber1:"9876543210",profilePhoneNumber2:"",
  profileGstNumber:"24ABCDE1234F1Z5",profilePanNumber:"ABCDE1234F",profileBankName:"Sample Bank",profileAccountNo:"1234567890",
  profileBranchName:"Surat",profileIfsc:"BANK0001234",clientChallanNumber:"CH-01",clientCompanyName:"Sample Customer",
  clientAddress:"Customer address",clientPhoneNumber:"9876543211",clientGstNumber:"24XYZDE1234F1Z5",clientState:"Gujarat",
  orderNumber:"INV-001",createdAt:"18/11/2026",dueDate:"25/11/2026",paymentTerm:7,ewayBillNo:"N/A",
  subOrders:[{orderName:"Sample product",designNumber:"D-01",hsnCode:"5208",quantity:2,qtyUnit:"PCS",unitPrice:100,shortPcs:0}],
  orderPaidAmount:50,orderTotalCost:200,orderSubTotal:200,orderDisRate:0,orderDiscountAmount:0,orderTax:9,
  orderTaxAmount:9,orderIgstTax:0,orderIgstTaxAmount:0,orderFinalRevenue:236,orderFinalRevenueRoundOff:0,
  orderFinalRevenueAfterRoundOff:236,orderFinalRevenueInWords:"Two hundred thirty six only",paymentStatus:"Partial",
  dueAmount:186,creditAppliedAmount:0,payments:[]
};

test("legacy invoice print still renders from the existing print settings",async()=>{
  const html=await ejs.renderFile(templatePath,{...locals,invoiceConfig:baseConfig});
  assert.match(html,/Sample Business/);
  assert.match(html,/Sample Customer/);
  assert.match(html,/Sample product/);
  assert.match(html,/Invoice Total/);
});

test("custom invoice design renders mapped fields, item table and imported PDF reference",async()=>{
  const invoiceConfig={
    ...baseConfig,
    design:{
      enabled:true,
      activeTemplateId:"imported-design",
      templates:[{
        id:"imported-design",name:"Imported",pageSize:"A4",orientation:"portrait",
        background:{url:"/uploads/invoice-designs/64b000000000000000000001-0123456789abcdef01234567.pdf",type:"pdf",locked:true,visible:true},
        blocks:[
          {id:"business",type:"field",fieldKey:"company_name",label:"Business",x:5,y:5,w:40,h:5,fontSize:14,bold:true,align:"left",color:"#172335",visible:true},
          {id:"note",type:"text",text:"Thank you for your business",label:"",x:5,y:90,w:50,h:5,fontSize:9,bold:false,align:"left",color:"#172335",visible:true},
          {id:"items",type:"items_table",fieldKey:"",label:"Items",x:5,y:40,w:90,h:30,fontSize:8,bold:false,align:"left",color:"#172335",visible:true},
          {id:"totals",type:"totals",fieldKey:"",label:"Totals",x:65,y:75,w:30,h:15,fontSize:9,bold:false,align:"right",color:"#172335",visible:true}
        ]
      }]
    }
  };
  const html=await ejs.renderFile(templatePath,{...locals,invoiceConfig});
  assert.match(html,/design-sheet/);
  assert.match(html,/Imported invoice background/);
  assert.match(html,/Sample Business/);
  assert.match(html,/Thank you for your business/);
  assert.match(html,/Sample product/);
  assert.match(html,/Invoice total/);
  assert.doesNotMatch(html,/Receiver&#39;s Details/);
});
