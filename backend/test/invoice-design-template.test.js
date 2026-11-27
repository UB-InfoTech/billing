const test=require("node:test");
const assert=require("node:assert/strict");
const path=require("node:path");
const ejs=require("ejs");
const {buildInvoiceDesignPages}=require("../utils/invoiceDesignPagination");

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



test("print renderer applies the row-specific fit measured by invoice pagination",async()=>{
  const {buildInvoiceDesignPages}=require("../utils/invoiceDesignPagination");
  const template={
    id:"auto-fit-print",
    name:"Auto-fit print",
    pageSize:"A4",
    orientation:"portrait",
    blocks:[
      {
        id:"items",type:"items_table",x:5,y:20,w:90,h:40,fontSize:12,
        tableCellPadding:4,visible:true,
        columns:[
          {key:"description",label:"Description",width:28,visible:true},
          {key:"amount",label:"Amount",width:72,visible:true}
        ]
      },
      {id:"totals",type:"totals",x:65,y:82,w:30,h:15,fontSize:11,visible:true}
    ]
  };
  const items=[{
    orderName:"cotton fabric garment finishing work ".repeat(40),
    quantity:1,qtyUnit:"PCS",unitPrice:100,shortPcs:0
  }];
  const pages=buildInvoiceDesignPages(template,items);
  const row=pages[0].rows[0];
  assert.equal(row.autoFitted,true);
  assert.ok(row.fontSize<12);
  const html=await ejs.renderFile(templatePath,{
    ...locals,
    subOrders:items,
    invoiceConfig:{
      ...baseConfig,
      design:{enabled:true,activeTemplateId:template.id,templates:[template]}
    },
    invoicePages:pages
  });
  assert.match(html,/data-auto-fitted="true"/);
  assert.match(html,new RegExp('data-estimated-font-size="'+row.fontSize+'"'));
  assert.match(html,new RegExp('font-size:'+row.fontSize+'px'));
  assert.match(html,new RegExp('data-estimated-cell-padding="'+row.cellPaddingPx+'"'));
});
test("custom invoice tables align numeric columns and emphasize totals without changing amounts",async()=>{
  const invoiceConfig={
    ...baseConfig,
    design:{
      enabled:true,
      activeTemplateId:"readable-design",
      templates:[{
        id:"readable-design",
        name:"Readable design",
        pageSize:"A4",
        orientation:"portrait",
        blocks:[
          {
            id:"items",
            type:"items_table",
            x:5,y:20,w:90,h:40,fontSize:12,color:"#172335",visible:true,
            tableHeaderBackground:"#244d70",tableHeaderColor:"#ffffff",tableBorderColor:"#c8d8e7",
            columns:[
              {key:"sr",label:"#",width:10,visible:true},
              {key:"description",label:"Product",width:50,visible:true},
              {key:"quantity",label:"Qty",width:10,visible:true},
              {key:"unitPrice",label:"Rate",width:15,visible:true},
              {key:"amount",label:"Amount",width:15,visible:true}
            ]
          },
          {id:"totals",type:"totals",x:65,y:65,w:30,h:25,fontSize:11,visible:true}
        ]
      }]
    }
  };
  const html=await ejs.renderFile(templatePath,{...locals,invoiceConfig});
  assert.match(html,/class="design-cell is-centered"/);
  assert.match(html,/class="design-cell is-numeric"/);
  assert.doesNotMatch(html,/class="design-cell is-numeric is-nowrap"/,"numeric cells must be allowed to wrap instead of spilling into adjacent columns");
  assert.match(html,/text-align:right/);
  assert.match(html,/\.design-totals \.grand/);
  assert.match(html,/font-variant-numeric:tabular-nums/);
  assert.match(html,/>200\.00<\/span>/);
  assert.match(html,/>₹ 236\.00<\/b>/);
});


test("large numeric invoice amounts wrap inside their own table cells",async()=>{
  const template={
    id:"large-number-wrapping",
    name:"Large number wrapping",
    pageSize:"A4",
    orientation:"portrait",
    blocks:[{
      id:"items",type:"items_table",x:5,y:20,w:90,h:40,fontSize:8,
      tableCellPadding:4,visible:true,
      columns:[
        {key:"amount",label:"Amount",width:5,visible:true,order:0},
        {key:"description",label:"Description",width:95,visible:true,order:1}
      ]
    }]
  };
  const items=[{
    orderName:"High-value order line",quantity:999,qtyUnit:"PCS",
    unitPrice:999999999999,shortPcs:0
  }];
  const pages=buildInvoiceDesignPages(template,items);
  const row=pages[0].rows[0];
  const amountEstimate=row.columnEstimates.find(column=>column.key==="amount");
  assert.ok(amountEstimate.estimatedLines>1,"long financial values should be measured as wrapped content");
  const html=await ejs.renderFile(templatePath,{
    ...locals,
    subOrders:items,
    invoiceConfig:{
      ...baseConfig,
      design:{enabled:true,activeTemplateId:template.id,templates:[template]}
    },
    invoicePages:pages
  });
  assert.match(html,/class="design-cell is-numeric" data-column-key="amount"[^>]*data-estimated-lines="[2-9]/);
  assert.doesNotMatch(html,/class="design-cell is-numeric is-nowrap"/);
});

test("multipage print shows page ranges and continued captions without overlapping the business header",async()=>{
  const template={
    id:"multipage-context",
    name:"Multipage context",
    pageSize:"A4",
    orientation:"portrait",
    blocks:[
      {id:"business",type:"field",fieldKey:"company_name",label:"",x:5,y:3,w:65,h:5,fontSize:18,bold:true,visible:true},
      {id:"items-caption",type:"text",text:"ITEM DETAILS",label:"Item details",x:5,y:17.2,w:90,h:2.2,fontSize:8.8,bold:true,visible:true},
      {
        id:"items",type:"items_table",x:5,y:20,w:90,h:22,fontSize:8,
        tableCellPadding:2,visible:true,
        columns:[
          {key:"description",label:"Product description",width:70,visible:true},
          {key:"amount",label:"Amount",width:30,visible:true}
        ]
      },
      {id:"totals",type:"totals",x:65,y:82,w:30,h:15,fontSize:9,visible:true},
      {id:"signature",type:"field",fieldKey:"signature",label:"",x:65,y:96,w:30,h:3,fontSize:8,visible:true}
    ]
  };
  const items=Array.from({length:20},(_,index)=>({
    orderName:"Product "+(index+1),quantity:1,qtyUnit:"PCS",unitPrice:100,shortPcs:0
  }));
  const pages=buildInvoiceDesignPages(template,items);
  assert.ok(pages.length>1);
  assert.equal(pages[0].isContinuation,false);
  assert.equal(pages[1].isContinuation,true);
  assert.equal(pages[0].firstItemNumber,1);
  assert.equal(pages[0].lastItemNumber,pages[1].firstItemNumber-1);
  assert.equal(pages[pages.length-1].isFinalPage,true);

  const html=await ejs.renderFile(templatePath,{
    ...locals,
    subOrders:items,
    invoiceConfig:{
      ...baseConfig,
      design:{enabled:true,activeTemplateId:template.id,templates:[template]}
    },
    invoicePages:pages
  });
  assert.match(html,/ITEM DETAILS/);
  assert.match(html,/ITEM DETAILS · CONTINUED/);
  assert.match(html,new RegExp('Items 1–'+pages[0].lastItemNumber+' · Page 1 of '+pages.length));
  assert.match(html,new RegExp('data-page-continuation="true"'));
  assert.match(html,new RegExp('data-page-first-item="'+pages[1].firstItemNumber+'"'));
  assert.doesNotMatch(html,/class="design-page-number"/,"prebuilt caption should own page numbering instead of a floating badge near the logo");
});

test("closing-only invoice page is clearly labelled as the invoice summary and has no empty item table",async()=>{
  const template={
    id:"closing-page-context",
    name:"Closing page context",
    pageSize:"A4",
    orientation:"portrait",
    blocks:[
      {id:"items-caption",type:"text",text:"ITEM DETAILS",label:"Item details",x:5,y:17.2,w:90,h:2.2,fontSize:8.8,bold:true,visible:true},
      {
        id:"items",type:"items_table",x:5,y:20,w:90,h:22,fontSize:8,
        tableCellPadding:2,visible:true,
        columns:[{key:"description",label:"Description",width:70,visible:true},{key:"amount",label:"Amount",width:30,visible:true}]
      },
      {id:"totals",type:"totals",x:65,y:25,w:30,h:15,fontSize:9,visible:true},
      {id:"signature",type:"field",fieldKey:"signature",label:"",x:65,y:48,w:30,h:4,fontSize:8,visible:true}
    ]
  };
  const items=Array.from({length:12},(_,index)=>({
    orderName:"Item "+(index+1),quantity:1,qtyUnit:"PCS",unitPrice:100,shortPcs:0
  }));
  const pages=buildInvoiceDesignPages(template,items);
  const closingPage=pages[pages.length-1];
  assert.equal(closingPage.closingOnly,true);
  assert.equal(closingPage.rows.length,0);
  assert.ok(closingPage.blocks.some(block=>block.type==="totals"));
  assert.ok(!closingPage.blocks.some(block=>block.type==="items_table"));

  const html=await ejs.renderFile(templatePath,{
    ...locals,
    subOrders:items,
    invoiceConfig:{
      ...baseConfig,
      design:{enabled:true,activeTemplateId:template.id,templates:[template]}
    },
    invoicePages:pages
  });
  assert.match(html,/data-page-closing-only="true"/);
  assert.match(html,/INVOICE SUMMARY/);
  assert.match(html,new RegExp('Page '+closingPage.pageNumber+' of '+closingPage.totalPages));
  const closingPageMarkup=html.split('<div class="design-sheet').pop()||"";
  assert.ok(closingPageMarkup.includes('data-block-type="totals"'));
  assert.ok(!closingPageMarkup.includes('data-block-type="items_table"'));
});
