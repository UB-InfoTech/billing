const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ejs=require("ejs");
const {createDefaultInvoiceDesign,sanitizeInvoiceDesign}=require("../utils/invoiceDesign");
const {hasInvoiceBackgroundSignature}=require("../utils/invoiceBackground");
const {buildInvoiceDesignPages,getInvoiceRowsPerPage}=require("../utils/invoiceDesignPagination");
const {buildInvoicePrintPreview}=require("../utils/invoicePrintPreview");
const {buildSampleInvoiceOrder}=require("../utils/invoiceSampleData");

test("smart invoice layout scan finds a repeated table grid and builds editable field suggestions",async()=>{
  const {findTableRegion,buildInvoiceSmartLayout}=await import("../../frontend/src/utils/invoiceLayoutScanner.js");
  const table=findTableRegion([39,44,49,54,59,64,69],[5,35,65,95]);
  assert.ok(table);
  assert.equal(table.y,39);
  assert.equal(table.rows,7);
  assert.equal(table.x,5);
  assert.equal(table.w,90);
  const layout=buildInvoiceSmartLayout({table});
  assert.equal(layout.tableDetected,true);
  assert.equal(layout.blocks.find(block=>block.type==="items_table").y,39);
  assert.equal(layout.blocks.find(block=>block.fieldKey==="company_name").type,"field");
  assert.equal(layout.blocks.some(block=>block.fieldKey==="customer_name"),true);
  assert.equal(layout.blocks.some(block=>block.type==="totals"),true);
});

test("image layout scan detects a ruled invoice table from pixels without OCR",async()=>{
  const {analyzeInvoicePixels}=await import("../../frontend/src/utils/invoiceLayoutScanner.js");
  const width=100,height=100;
  const data=new Uint8ClampedArray(width*height*4);
  for(let index=0;index<data.length;index+=4){
    data[index]=255;data[index+1]=255;data[index+2]=255;data[index+3]=255;
  }
  const drawHorizontal=y=>{
    for(let x=5;x<96;x+=1){
      const offset=(y*width+x)*4;
      data[offset]=20;data[offset+1]=20;data[offset+2]=20;
    }
  };
  const drawVertical=x=>{
    for(let y=39;y<=70;y+=1){
      const offset=(y*width+x)*4;
      data[offset]=20;data[offset+1]=20;data[offset+2]=20;
    }
  };
  [39,44,49,54,59,64,69].forEach(drawHorizontal);
  [5,35,65,95].forEach(drawVertical);
  const result=analyzeInvoicePixels({width,height,data});
  assert.ok(result.table);
  assert.equal(result.table.y,39);
  assert.equal(result.table.rows,7);
  assert.equal(result.table.x,5);
  assert.equal(result.table.w,90);
});

test("OCR text matcher suggests common invoice field mappings without forcing a placement",async()=>{
  const {suggestInvoiceField,extractOcrLines}=await import("../../frontend/src/utils/invoiceOcrMapping.js");
  assert.equal(suggestInvoiceField("Invoice No: INV-101").fieldKey,"invoice_no");
  assert.equal(suggestInvoiceField("Due Date").fieldKey,"due_date");
  assert.equal(suggestInvoiceField("Bill To").fieldKey,"customer_name");
  assert.equal(suggestInvoiceField("Supplier GSTIN",{top:10}).fieldKey,"company_gstin");
  assert.equal(suggestInvoiceField("Customer GSTIN").fieldKey,"customer_gstin");
  assert.equal(suggestInvoiceField("Customer Phone").fieldKey,"customer_phone");
  assert.equal(suggestInvoiceField("GSTIN",{top:35}).fieldKey,"customer_gstin");
  assert.equal(suggestInvoiceField("Amount paid").fieldKey,"amount_paid");
  assert.equal(suggestInvoiceField("random words"),null);
  const lines=extractOcrLines({
    blocks:[{paragraphs:[{lines:[{
      text:"Invoice No: INV-101",
      bbox:{x0:100,y0:200,x1:400,y1:240},
      words:[{confidence:92},{confidence:88}]
    }]}]}]
  },1000,2000);
  assert.equal(lines[0].fieldKey,"invoice_no");
  assert.equal(lines[0].confidence,90);
  assert.equal(lines[0].box.x,10);
  assert.equal(lines[0].box.y,10);
  assert.equal(lines[0].box.w,30);
  assert.equal(lines[0].box.h,2);
});

test("OCR detects the printed value area after an invoice label using word coordinates",async()=>{
  const {extractOcrLines}=await import("../../frontend/src/utils/invoiceOcrMapping.js");
  const lines=extractOcrLines({
    blocks:[{paragraphs:[{lines:[{
      text:"Invoice No: INV-101",
      bbox:{x0:100,y0:200,x1:400,y1:240},
      words:[
        {text:"Invoice",confidence:94,bbox:{x0:100,y0:205,x1:180,y1:235}},
        {text:"No:",confidence:91,bbox:{x0:185,y0:205,x1:225,y1:235}},
        {text:"INV-101",confidence:95,bbox:{x0:235,y0:205,x1:330,y1:235}}
      ]
    }]}]}]
  },1000,2000);
  assert.equal(lines[0].fieldKey,"invoice_no");
  assert.equal(lines[0].words.length,3);
  assert.ok(lines[0].valueBox);
  assert.ok(lines[0].valueBox.x<23.5);
  assert.ok(lines[0].valueBox.w>=14);
  assert.ok(lines[0].valueBox.h>=3.2);
});

test("OCR finds a separate value line beside its label but avoids another labelled field",async()=>{
  const {extractOcrLines}=await import("../../frontend/src/utils/invoiceOcrMapping.js");
  const lines=extractOcrLines({
    blocks:[{paragraphs:[{lines:[
      {
        text:"Invoice No:",
        bbox:{x0:100,y0:200,x1:200,y1:240},
        words:[
          {text:"Invoice",confidence:92,bbox:{x0:100,y0:205,x1:145,y1:235}},
          {text:"No:",confidence:92,bbox:{x0:150,y0:205,x1:200,y1:235}}
        ]
      },
      {
        text:"INV-2026-001",
        bbox:{x0:220,y0:200,x1:350,y1:240},
        words:[{text:"INV-2026-001",confidence:93,bbox:{x0:220,y0:205,x1:350,y1:235}}]
      },
      {
        text:"Invoice Date:",
        bbox:{x0:500,y0:200,x1:650,y1:240},
        words:[
          {text:"Invoice",confidence:92,bbox:{x0:500,y0:205,x1:560,y1:235}},
          {text:"Date:",confidence:92,bbox:{x0:565,y0:205,x1:650,y1:235}}
        ]
      },
      {
        text:"Due Date:",
        bbox:{x0:800,y0:200,x1:950,y1:240},
        words:[
          {text:"Due",confidence:92,bbox:{x0:800,y0:205,x1:850,y1:235}},
          {text:"Date:",confidence:92,bbox:{x0:855,y0:205,x1:950,y1:235}}
        ]
      }
    ]}]}]
  },1000,2000);
  const invoiceNumber=lines.find(line=>line.fieldKey==="invoice_no");
  assert.ok(invoiceNumber.valueBox);
  assert.equal(invoiceNumber.valueBox.kind,"printed");
  const invoiceDate=lines.find(line=>line.fieldKey==="invoice_date");
  const dueDate=lines.find(line=>line.fieldKey==="due_date");
  assert.equal(invoiceDate.valueBox.kind,"estimated");
  assert.ok(invoiceDate.valueBox.x+invoiceDate.valueBox.w<dueDate.box.x);
  const noCoordinates=extractOcrLines({
    blocks:[{paragraphs:[{lines:[{
      text:"Invoice No: INV-101",
      bbox:{x0:100,y0:200,x1:400,y1:240},
      words:[{text:"Invoice",confidence:90},{text:"No:",confidence:90},{text:"INV-101",confidence:90}]
    }]}]}]
  },1000,2000);
  assert.equal(noCoordinates[0].valueBox,null);
});

test("changing an OCR field match recalculates its placement instead of reusing the old field position",async()=>{
  const {inferOcrValueBox}=await import("../../frontend/src/utils/invoiceOcrMapping.js");
  const line={
    id:"ocr-invoice-number",fieldKey:"invoice_no",selectedField:"invoice_no",
    confidence:94,box:{x:10,y:10,w:30,h:2},
    words:[
      {text:"Invoice",confidence:94,box:{x:10,y:10.25,w:8,h:1.5}},
      {text:"No:",confidence:92,box:{x:18.5,y:10.25,w:4,h:1.5}},
      {text:"INV-101",confidence:95,box:{x:23.5,y:10.25,w:9.5,h:1.5}}
    ]
  };
  assert.ok(inferOcrValueBox(line,[line]));
  assert.equal(inferOcrValueBox({...line,selectedField:"grand_total"},[line]),null);
  assert.equal(inferOcrValueBox({...line,selectedField:""},[line]),null);
});

test("new invoice design keeps the existing print layout active until the owner selects a new design",()=>{
  const design=createDefaultInvoiceDesign();
  assert.equal(design.enabled,false);
  assert.equal(design.templates.length,1);
  assert.equal(design.templates[0].blocks.some(block=>block.type==="items_table"),true);
});

test("invoice design sanitization allows safe editable blocks and owner-owned PDF/image backgrounds",()=>{
  const owner="64b000000000000000000001";
  const url="/uploads/invoice-designs/"+owner+"-0123456789abcdef01234567.pdf";
  const design=sanitizeInvoiceDesign({
    enabled:true,
    activeTemplateId:"imported",
    templates:[{
      id:"imported",name:"Imported invoice",templateKey:"imported",
      background:{url,type:"pdf",locked:true},
      blocks:[
        {id:"invoice-number",type:"field",fieldKey:"invoice_no",x:12,y:14,w:30,h:5,fontSize:13,bold:true,color:"#123456",showLabel:false},
        {id:"note",type:"text",text:"Thank you",x:8,y:90,w:40,h:5},
        {id:"unsafe",type:"field",fieldKey:"javascript:alert(1)",x:0,y:0,w:100,h:100},
        {id:"not-a-block",type:"html",text:"<script>alert(1)</script>"}
      ]
    }]
  },owner);
  assert.equal(design.enabled,true);
  assert.equal(design.activeTemplateId,"imported");
  assert.equal(design.templates[0].background.url,url);
  assert.equal(design.templates[0].background.type,"pdf");
  assert.deepEqual(design.templates[0].blocks.map(block=>block.type),["field","text"]);
  assert.equal(design.templates[0].blocks[0].color,"#123456");
  assert.equal(design.templates[0].blocks[0].showLabel,false);
  assert.equal(design.templates[0].blocks[1].showLabel,false);
});

test("invoice item table supports per-design columns and safely clamps its visual settings",()=>{
  const {sanitizeBlock}=require("../utils/invoiceDesign");
  const block=sanitizeBlock({
    id:"table-layout",type:"items_table",x:4,y:40,w:92,h:24,
    columns:[
      {key:"description",label:"Item / Description",width:36,visible:true},
      {key:"shortPcs",label:"Short pieces",width:9,visible:true},
      {key:"unsafeKey",label:"Injected",width:90,visible:true},
      {key:"amount",label:"Line total",width:18,visible:false}
    ],
    tableHeaderBackground:"#123456",tableHeaderColor:"#ffffff",
    tableRowBackground:"#ffffff",tableAlternateRowBackground:"#f1f5f9",
    tableBorderColor:"#334455",tableBorderWidth:8,tableCellPadding:24,
    alternateRows:false
  });
  assert.deepEqual(block.columns.map(column=>column.key),["description","shortPcs","amount"]);
  assert.equal(block.columns[0].label,"Item / Description");
  assert.equal(block.columns[0].width,36);
  assert.equal(block.columns[2].visible,false);
  assert.equal(block.tableHeaderBackground,"#123456");
  assert.equal(block.tableHeaderColor,"#ffffff");
  assert.equal(block.tableBorderWidth,3);
  assert.equal(block.tableCellPadding,10);
  assert.equal(block.alternateRows,false);
  const unsafe=sanitizeBlock({id:"bad-table",type:"items_table",columns:[{key:"description"}],tableHeaderBackground:"url(javascript:alert(1))"});
  assert.equal(unsafe.tableHeaderBackground,"transparent");
});

test("older imported designs hide duplicated field labels while clean designs keep them",()=>{
  const owner="64b000000000000000000001";
  const importedUrl="/uploads/invoice-designs/"+owner+"-0123456789abcdef01234567.pdf";
  const imported=sanitizeInvoiceDesign({
    templates:[{id:"imported",background:{url:importedUrl,type:"pdf"},blocks:[
      {id:"invoice-number",type:"field",fieldKey:"invoice_no",label:"Invoice number",x:10,y:10,w:30,h:5}
    ]}]
  },owner);
  const clean=sanitizeInvoiceDesign({
    templates:[{id:"clean",background:{url:""},blocks:[
      {id:"invoice-number",type:"field",fieldKey:"invoice_no",label:"Invoice number",x:10,y:10,w:30,h:5}
    ]}]
  },owner);
  assert.equal(imported.templates[0].blocks[0].showLabel,false);
  assert.equal(clean.templates[0].blocks[0].showLabel,true);
});

test("invoice design rejects another owner's background and bounds layout values",()=>{
  const owner="64b000000000000000000001";
  const other="/uploads/invoice-designs/64b000000000000000000002-0123456789abcdef01234567.png";
  const design=sanitizeInvoiceDesign({
    enabled:true,templates:[{id:"test",background:{url:other},blocks:[
      {id:"x",type:"field",fieldKey:"invoice_no",x:500,y:-2,w:500,h:0,fontSize:999,color:"red"}
    ]}]
  },owner);
  const template=design.templates[0];
  assert.equal(template.background.url,"");
  assert.equal(template.blocks[0].x,97);
  assert.equal(template.blocks[0].y,0);
  assert.equal(template.blocks[0].w,3);
  assert.equal(template.blocks[0].h,2);
  assert.equal(template.blocks[0].fontSize,48);
  assert.equal(template.blocks[0].color,"#172335");
  assert.equal(template.blocks[0].showLabel,true);
});

test("invoice designs preserve professional element styling and safe imported images",()=>{
  const owner="64b000000000000000000001";
  const image="data:image/png;base64,"+"A".repeat(64);
  const design=sanitizeInvoiceDesign({
    enabled:true,
    templates:[{id:"custom",templateKey:"premium",background:{url:""},blocks:[
      {id:"accent",type:"shape",x:0,y:0,w:100,h:12,backgroundColor:"#172554",borderRadius:4},
      {id:"logo-image",type:"image",label:"Logo",imageUrl:image,imageFit:"cover",opacity:0.6,x:80,y:5,w:14,h:10},
      {id:"brand",type:"field",fieldKey:"company_name",label:"Business name",x:5,y:5,w:60,h:6,fontSize:19,fontFamily:"Georgia",italic:true,backgroundColor:"#ffffff",borderColor:"#1d4ed8",borderWidth:1,padding:2,showLabel:false}
    ]}]
  },owner);
  const blocks=design.templates[0].blocks;
  assert.equal(blocks.length,3);
  assert.equal(blocks[0].type,"shape");
  assert.equal(blocks[0].backgroundColor,"#172554");
  assert.equal(blocks[1].type,"image");
  assert.equal(blocks[1].imageUrl,image);
  assert.equal(blocks[1].imageFit,"cover");
  assert.equal(blocks[1].opacity,0.6);
  assert.equal(blocks[2].fontFamily,"Georgia");
  assert.equal(blocks[2].italic,true);
  assert.equal(blocks[2].borderWidth,1);
  assert.equal(blocks[2].showLabel,false);
});

test("invalid imported images and unsafe style values are rejected",()=>{
  const design=sanitizeInvoiceDesign({
    templates:[{id:"unsafe",blocks:[
      {id:"bad-image",type:"image",imageUrl:"https://example.com/logo.png",x:5,y:5,w:20,h:10},
      {id:"bad-shape",type:"shape",backgroundColor:"url(javascript:alert(1))",borderColor:"red",fontFamily:"Comic Sans MS",borderWidth:99,opacity:2,x:5,y:5,w:20,h:10}
    ]}]
  });
  assert.equal(design.templates[0].blocks.length,1);
  const shape=design.templates[0].blocks[0];
  assert.equal(shape.backgroundColor,"transparent");
  assert.equal(shape.borderColor,"#172335");
  assert.equal(shape.fontFamily,"Arial");
  assert.equal(shape.borderWidth,6);
  assert.equal(shape.opacity,1);
});

test("professional invoice design library contains distinct ready-to-use layouts",async()=>{
  const {INVOICE_DESIGN_PRESETS,createInvoiceDesignTemplate,createBlankInvoiceDesignTemplate}=await import("../../frontend/src/utils/invoiceTemplateLibrary.js");
  assert.equal(INVOICE_DESIGN_PRESETS.length,14);
  const keys=INVOICE_DESIGN_PRESETS.map(preset=>preset.key);
  assert.equal(new Set(keys).size,14);
  const templates=keys.map(key=>createInvoiceDesignTemplate("tpl-"+key,key));
  assert.ok(templates.some(template=>template.blocks.some(block=>block.type==="shape")));
  assert.ok(templates.some(template=>template.pageSize==="A5"));
  assert.ok(templates.every(template=>template.blocks.some(block=>block.type==="items_table")));
  assert.equal(createBlankInvoiceDesignTemplate("blank").blocks.length,0);
});

test("invoice backgrounds must match their declared file signatures",()=>{
  assert.equal(hasInvoiceBackgroundSignature(Buffer.from("%PDF-1.7"),"application/pdf"),true);
  assert.equal(hasInvoiceBackgroundSignature(Buffer.from("%PDX-1.7"),"application/pdf"),false);
  assert.equal(hasInvoiceBackgroundSignature(Buffer.from([137,80,78,71,13,10,26,10]),"image/png"),true);
  assert.equal(hasInvoiceBackgroundSignature(Buffer.from([255,216,255]),"image/jpeg"),true);
  assert.equal(hasInvoiceBackgroundSignature(Buffer.from("RIFFxxxxWEBP"),"image/webp"),true);
  assert.equal(hasInvoiceBackgroundSignature(Buffer.from("RIFFxxxxHTML"),"image/webp"),false);
});

test("long custom invoices continue on additional pages and repeat invoice header details",()=>{
  const template={
    pageSize:"A4",orientation:"portrait",
    blocks:[
      {id:"business",type:"field",fieldKey:"company_name",x:6,y:4,w:60,h:5,visible:true},
      {id:"invoice-number",type:"field",fieldKey:"invoice_no",x:6,y:12,w:60,h:4,visible:true},
      {id:"items",type:"items_table",x:6,y:43,w:88,h:33,visible:true},
      {id:"totals",type:"totals",x:61,y:78,w:33,h:15,visible:true},
      {id:"terms",type:"field",fieldKey:"terms",x:6,y:80,w:48,h:11,visible:true}
    ]
  };
  const rows=Array.from({length:25},(_,index)=>({orderName:"Product "+(index+1)}));
  const pages=buildInvoiceDesignPages(template,rows);
  assert.equal(pages.length,3);
  assert.deepEqual(pages.map(page=>page.rows.length),[9,8,8]);
  assert.deepEqual(pages.map(page=>page.pageNumber),[1,2,3]);
  assert.ok(pages.every(page=>page.blocks.some(block=>block.id==="business")));
  assert.ok(pages.every(page=>page.blocks.some(block=>block.id==="invoice-number")));
  assert.ok(pages.every(page=>page.blocks.some(block=>block.type==="items_table")));
  assert.equal(pages[0].blocks.some(block=>block.id==="totals"),false);
  assert.equal(pages[1].blocks.some(block=>block.id==="terms"),false);
  assert.equal(pages[2].blocks.some(block=>block.id==="totals"),true);
  assert.equal(pages[2].blocks.some(block=>block.id==="terms"),true);
  assert.deepEqual(pages.flatMap(page=>page.rows.map(row=>row.itemNumber)),Array.from({length:25},(_,index)=>index+1));
});

test("invoice pagination respects paper size and orientation and always keeps at least one row",()=>{
  const base={blocks:[{type:"items_table",x:5,y:10,w:90,h:25}]};
  assert.ok(getInvoiceRowsPerPage({...base,pageSize:"A5",orientation:"portrait"})<getInvoiceRowsPerPage({...base,pageSize:"A4",orientation:"portrait"}));
  assert.ok(getInvoiceRowsPerPage({...base,pageSize:"A4",orientation:"landscape"})<getInvoiceRowsPerPage({...base,pageSize:"A4",orientation:"portrait"}));
  assert.equal(getInvoiceRowsPerPage({pageSize:"A4",blocks:[{type:"items_table",h:2}]}),1);
});

test("single-page and empty-item invoices retain all visible design blocks",()=>{
  const template={pageSize:"A4",orientation:"portrait",blocks:[
    {id:"header",type:"field",fieldKey:"invoice_no",visible:true},
    {id:"items",type:"items_table",visible:true},
    {id:"totals",type:"totals",visible:true},
    {id:"hidden",type:"text",visible:false}
  ]};
  const single=buildInvoiceDesignPages(template,[{orderName:"One"}]);
  assert.equal(single.length,1);
  assert.deepEqual(single[0].blocks.map(block=>block.id),["header","items","totals"]);
  const empty=buildInvoiceDesignPages(template,[]);
  assert.equal(empty.length,1);
  assert.equal(empty[0].rows.length,0);
  assert.deepEqual(empty[0].blocks.map(block=>block.id),["header","items","totals"]);
});

test("custom and legacy invoice print template compiles as valid EJS",()=>{
  const templatePath=path.join(__dirname,"../public/invoiceTable.ejs");
  assert.doesNotThrow(()=>ejs.compile(fs.readFileSync(templatePath,"utf8")));
});

test("actual print template renders the in-session design and saved invoice rows",async()=>{
  const template={
    id:"in-session-preview",name:"Preview design",pageSize:"A4",orientation:"portrait",
    blocks:[
      {id:"accent-band",type:"shape",label:"",x:0,y:0,w:100,h:3,backgroundColor:"#172554",borderWidth:0,visible:true},
      {id:"imported-mark",type:"image",label:"Imported mark",imageUrl:"data:image/png;base64,AAAA",x:88,y:4,w:8,h:8,visible:true},
      {id:"invoice-no",type:"field",fieldKey:"invoice_no",label:"Invoice number",showLabel:false,x:8,y:10,w:45,h:6,fontSize:12,bold:true,align:"left",color:"#172335",visible:true},
      {id:"items",type:"items_table",x:6,y:24,w:88,h:42,fontSize:8,visible:true},
      {id:"totals",type:"totals",x:62,y:72,w:32,h:20,fontSize:9,visible:true}
    ]
  };
  const html=await ejs.renderFile(path.join(__dirname,"../public/invoiceTable.ejs"),{
    invoiceConfig:{
      invoiceTitle:"TAX INVOICE",pageSize:"A4",accentColor:"#172335",
      itemColumns:[{key:"sr",label:"#",width:8,visible:true,order:0},{key:"description",label:"Product",width:52,visible:true,order:1},{key:"amount",label:"Amount",width:20,visible:true,order:2}],
      design:{enabled:true,activeTemplateId:template.id,templates:[template]}
    },
    invoicePages:buildInvoiceDesignPages(template,[{orderName:"Cotton fabric",qtyUnit:"PCS",quantity:2,unitPrice:500}]),
    profileLogoUrl:"",publicUploadBaseUrl:"",
    profileHeaderTitle:"Invoice",profileCompanyName:"Example Business",profileCompanyAddress:"Surat",
    profileEmailAddress:"",profileWebsite:"",profilePhoneNumber1:"9876543210",profilePhoneNumber2:"",
    profileGstNumber:"",profilePanNumber:"",profileBankName:"Example Bank",profileAccountNo:"123456",
    profileBranchName:"Surat",profileIfsc:"EXAMPLE0001",
    clientChallanNumber:"",clientCompanyName:"Example Customer",clientAddress:"Ring Road",
    clientPhoneNumber:"",clientGstNumber:"",clientState:"Gujarat",
    orderNumber:"INV-PREVIEW-001",createdAt:"18/11/2026",dueDate:"18/12/2026",
    paymentTerm:"30",ewayBillNo:"N/A",
    subOrders:[{orderName:"Cotton fabric",qtyUnit:"PCS",quantity:2,unitPrice:500}],
    orderPaidAmount:0,orderTotalCost:1000,orderSubTotal:1000,orderDisRate:0,orderDiscountAmount:0,
    orderTax:9,orderTaxAmount:90,orderIgstTax:0,orderIgstTaxAmount:0,orderFinalRevenue:1180,
    orderFinalRevenueRoundOff:0,orderFinalRevenueAfterRoundOff:1180,orderFinalRevenueInWords:"One thousand one hundred eighty only",
    paymentStatus:"Unpaid",dueAmount:1180,creditAppliedAmount:0,payments:[]
  });
  assert.match(html,/INV-PREVIEW-001/);
  assert.doesNotMatch(html,/Invoice number:/);
  assert.match(html,/Cotton fabric/);
  assert.match(html,/height:9\.00mm/);
  assert.match(html,/1000\.00/);
  assert.match(html,/left:8%;top:10%;width:45%;height:6%/);
  assert.match(html,/background-color:#172554/);
  assert.match(html,/data:image\/png;base64,AAAA/);
  assert.match(html,/Invoice total/);
});

test("real invoice preview maps saved business, customer, item and financial data without changing the invoice",()=>{
  const order={
    _id:"64b000000000000000000010",
    orderNumber:"INV-2026-018",
    orderDate:"2026-11-18T10:00:00.000Z",
    paymentTerms:"30",
    companyName:"Sample Customer Pvt Ltd",
    Address:"Ring Road, Surat",
    State:"Gujarat",
    stateCode:"24",
    gstNumber:"24ABCDE1234F1Z5",
    challanNumber:"CH-018",
    discountRate:10,
    discountAmount:100,
    totalCost:900,
    taxPercentage:18,
    taxAmount:162,
    finalRevenue:1062,
    roundOffFinalRevenue:1062,
    totalAmount:1062,
    paidAmount:400,
    dueAmount:662,
    subOrders:[{
      orderName:"Cotton Fabric",designNumber:"CF-18",hsnCode:5208,
      quantity:10,qtyUnit:"PCS",unitPrice:100,shortPcs:0
    }]
  };
  const before=JSON.stringify(order);
  const preview=buildInvoicePrintPreview({
    order,
    profile:{
      companyName:"Bhanderi Textiles",companyAddress:"Market Yard",
      city:"Surat",state:"Gujarat",pinCode:395002,country:"India",
      gstin:"24ABCDE1234F1Z5",stateCode:24,phoneNumber1:"9876543210",
      emailAddress:"sales@example.com",bankName:"Sample Bank",accountNo:"123456",
      branchName:"Surat",ifsc:"BANK0001"
    },
    client:{name:"Customer Contact",phone:"9876500000",address:"Client Address",state:"Gujarat"},
    invoiceConfig:{invoiceTitle:"TAX INVOICE",itemColumns:[
      {key:"sr",label:"#",visible:true,order:0,width:5},
      {key:"description",label:"Product",visible:true,order:1,width:30},
      {key:"amount",label:"Amount",visible:true,order:2,width:15}
    ]},
    ownerId:"64b000000000000000000001"
  });
  assert.equal(preview.fields.company_name,"Bhanderi Textiles");
  assert.equal(preview.fields.customer_name,"Sample Customer Pvt Ltd");
  assert.equal(preview.fields.invoice_no,"INV-2026-018");
  assert.equal(preview.fields.customer_phone,"9876500000");
  assert.equal(preview.fields.subtotal,"₹ 1000.00");
  assert.equal(preview.fields.cgst,"₹ 81.00");
  assert.equal(preview.fields.sgst,"₹ 81.00");
  assert.equal(preview.fields.grand_total,"₹ 1062.00");
  assert.equal(preview.fields.amount_paid,"₹ 400.00");
  assert.equal(preview.fields.balance_due,"₹ 662.00");
  assert.equal(preview.items[0].description,"Cotton Fabric");
  assert.equal(preview.items[0].amount,"1000.00");
  assert.deepEqual(preview.itemColumns.map(column=>column.key),["sr","description","amount"]);
  assert.equal(JSON.stringify(order),before);
});

test("real invoice preview calculates interstate tax consistently with the invoice print route",()=>{
  const preview=buildInvoicePrintPreview({
    order:{orderDate:"2026-11-18",stateCode:"24",paymentTerms:"Advance",taxAmount:180,totalCost:1000,discountAmount:0,finalRevenue:1180,totalAmount:1180,roundOffFinalRevenue:1180,dueAmount:1180,subOrders:[]},
    profile:{companyName:"Business",stateCode:27,bankName:"Bank"},
    invoiceConfig:{invoiceTitle:"TAX INVOICE"},
    ownerId:"64b000000000000000000001"
  });
  assert.equal(preview.fields.cgst,"₹ 0.00");
  assert.equal(preview.fields.sgst,"₹ 0.00");
  assert.equal(preview.fields.igst,"₹ 180.00");
  assert.equal(preview.fields.payment_terms,"Advance");
  assert.equal(preview.fields.balance_due,"₹ 1180.00");
});


test("invoice layout analysis detects fixable overflow and safe corrections",async()=>{const {analyzeInvoiceLayout,applySafeInvoiceLayoutFixes}=await import("../../frontend/src/utils/invoiceLayoutQuality.js");const blocks=[{id:"off",type:"field",x:96,y:95,w:8,h:8,visible:true},{id:"table",type:"items_table",x:5,y:30,w:90,h:30,visible:true,columns:[{key:"a",width:70,visible:true},{key:"b",width:60,visible:true}]},{id:"overlap",type:"field",x:6,y:30,w:20,h:10,visible:true}];const warnings=analyzeInvoiceLayout(blocks,[]);assert.ok(warnings.some(w=>w.title==="Element outside page"&&w.fixable));assert.ok(warnings.some(w=>w.title==="Item table columns exceed 100%"&&w.fixable));assert.ok(warnings.some(w=>w.title==="Possible element overlap"&&!w.fixable));const fixed=applySafeInvoiceLayoutFixes(blocks,[]);assert.equal(fixed.changed,true);assert.ok(fixed.blocks[0].x+fixed.blocks[0].w<=100);assert.ok(fixed.blocks[0].y+fixed.blocks[0].h<=100);assert.ok(fixed.blocks[1].columns.reduce((s,c)=>s+c.width,0)<=100.0001);});
test("safe invoice layout corrections leave overlap-only and hidden elements unchanged",async()=>{const {applySafeInvoiceLayoutFixes}=await import("../../frontend/src/utils/invoiceLayoutQuality.js");const blocks=[{id:"a",type:"field",x:5,y:5,w:20,h:10,visible:true},{id:"b",type:"field",x:10,y:8,w:20,h:10,visible:true},{id:"hidden",type:"field",x:120,y:120,w:20,h:20,visible:false}];assert.deepEqual(applySafeInvoiceLayoutFixes(blocks,[]).blocks,blocks);});

test("invoice print margins are sanitized, persisted and reflected by the print renderer",async()=>{
 const sanitized=sanitizeInvoiceDesign({templates:[{id:"margin",pageSize:"A5",orientation:"landscape",printMargins:{top:8,right:30,bottom:-4,left:"5"},blocks:[
  {id:"blank-notes",type:"blank_table",label:"Notes table",x:5,y:54,w:90,h:18,
   tableColumns:[{id:"material",label:"Material",width:60},{id:"notes",label:"Notes",width:40}],
   tableRows:[["Cotton fabric","Check stitching"]],tableHeaderBackground:"#123456",tableHeaderColor:"#ffffff",tableBorderColor:"#abcdef"},
  {id:"custom-note",type:"text",label:"Handling note",text:"Handle with care",x:5,y:76,w:90,h:5,
   lineHeight:1.8,letterSpacing:2.5,textDecoration:"underline",textTransform:"uppercase",verticalAlign:"middle"}
 ]}]});
 assert.deepEqual(sanitized.templates[0].printMargins,{top:8,right:25,bottom:0,left:5});
 const template=sanitized.templates[0];
 const html=await ejs.renderFile(path.join(__dirname,"../public/invoiceTable.ejs"),{
  invoiceConfig:{invoiceTitle:"TAX INVOICE",pageSize:"A4",accentColor:"#172335",itemColumns:[],design:{enabled:true,activeTemplateId:"margin",templates:[template]}},
  invoicePages:[{pageNumber:1,totalPages:1,blocks:template.blocks,rows:[]}],profileLogoUrl:"",publicUploadBaseUrl:"",
  profileHeaderTitle:"Invoice",profileCompanyName:"Example",profileCompanyAddress:"Surat",profileEmailAddress:"",profileWebsite:"",
  profilePhoneNumber1:"",profilePhoneNumber2:"",profileGstNumber:"",profilePanNumber:"",profileBankName:"",profileAccountNo:"",
  profileBranchName:"",profileIfsc:"",clientChallanNumber:"",clientCompanyName:"Customer",clientAddress:"Address",
  clientPhoneNumber:"",clientGstNumber:"",clientState:"Gujarat",orderNumber:"INV-MARGIN",createdAt:"",dueDate:"",
  paymentTerm:"",ewayBillNo:"",subOrders:[],orderPaidAmount:0,orderTotalCost:0,orderSubTotal:0,orderDisRate:0,
  orderDiscountAmount:0,orderTax:0,orderTaxAmount:0,orderIgstTax:0,orderIgstTaxAmount:0,orderFinalRevenue:0,
  orderFinalRevenueRoundOff:0,orderFinalRevenueAfterRoundOff:0,orderFinalRevenueInWords:"",paymentStatus:"Unpaid",dueAmount:0,
  creditAppliedAmount:0,payments:[]
 });
 assert.match(html,/size: A5 landscape/);

 assert.match(html,/class="design-blank-table"/);
 assert.ok(html.includes(">Material</th>"));
 assert.ok(html.includes(">Cotton fabric</span>"));
 assert.match(html,/text-decoration:underline/);
 assert.match(html,/text-transform:uppercase/);
 assert.match(html,/line-height:1\.8/);
 assert.match(html,/letter-spacing:2\.5px/);
 assert.match(html,/top:8mm;right:25mm;bottom:0mm;left:5mm/);
});
test("print pagination accounts for reduced printable height from top and bottom margins",()=>{
 const base={pageSize:"A4",orientation:"portrait",blocks:[{type:"items_table",x:5,y:10,w:90,h:33}]};
 const baseCapacity=getInvoiceRowsPerPage(base);
 const marginCapacity=getInvoiceRowsPerPage({...base,printMargins:{top:20,bottom:20}});
 assert.ok(marginCapacity<baseCapacity);
 const rows=Array.from({length:30},(_,index)=>({orderName:"Item "+index}));
 const pages=buildInvoiceDesignPages({...base,printMargins:{top:20,bottom:20}},rows);
 assert.deepEqual(pages.flatMap(page=>page.rows.map(row=>row.itemNumber)),Array.from({length:30},(_,index)=>index+1));
});
test("print geometry validates A4 and A5 landscape printable dimensions",async()=>{
 const {getInvoicePrintGeometry}=await import("../../frontend/src/utils/invoicePrintFit.js");
 const a4=getInvoicePrintGeometry("A4","portrait",{top:10,right:5,bottom:10,left:5});
 const a5=getInvoicePrintGeometry("A5","landscape",{top:5,right:5,bottom:5,left:5});
 assert.deepEqual([a4.widthMm,a4.heightMm,a4.contentWidthMm,a4.contentHeightMm],[210,297,200,277]);
 assert.deepEqual([a5.widthMm,a5.heightMm,a5.contentWidthMm,a5.contentHeightMm],[210,148,200,138]);
});
test("invoice text fit check warns when field content exceeds its estimated printable box",async()=>{
 const {estimateInvoiceTextOverflow}=await import("../../frontend/src/utils/invoicePrintFit.js");
 const warnings=estimateInvoiceTextOverflow([{id:"address",type:"field",fieldKey:"customer_address",label:"Customer address",showLabel:true,x:0,y:0,w:8,h:2,fontSize:12,padding:1,visible:true}],{customer_address:"A very long billing address with multiple words that cannot fit in a tiny field."},{pageSize:"A5",orientation:"portrait"});
 assert.equal(warnings.length,1);
 assert.equal(warnings[0].title,"Text may overflow its box");
});

test("safe table width correction also freezes inherited defaults into a valid design-specific fit",async()=>{
 const {applySafeInvoiceLayoutFixes}=await import("../../frontend/src/utils/invoiceLayoutQuality.js");
 const columns=[{key:"description",width:70,visible:true},{key:"amount",width:70,visible:true},{key:"taxable",width:70,visible:true}];
 const result=applySafeInvoiceLayoutFixes([{id:"table",type:"items_table",x:5,y:5,w:90,h:30,visible:true}],columns);
 assert.equal(result.changed,true);
 assert.equal(result.blocks[0].columns.length,3);
 assert.ok(result.blocks[0].columns.every(column=>column.width>=3));
 assert.ok(result.blocks[0].columns.reduce((sum,column)=>sum+column.width,0)<=100.0001);
});

test("variable-height item rows paginate by description wrapping and keep every item on one page",()=>{
 const template={pageSize:"A4",orientation:"portrait",blocks:[
  {id:"items",type:"items_table",x:5,y:20,w:90,h:22,fontSize:8,tableCellPadding:4,visible:true,
   columns:[{key:"sr",label:"#",width:8,visible:true},{key:"description",label:"Description",width:25,visible:true},{key:"amount",label:"Amount",width:20,visible:true}]},
  {id:"totals",type:"totals",x:65,y:80,w:30,h:15,visible:true}
 ]};
 const shortItems=Array.from({length:12},(_,index)=>({orderName:"Item "+(index+1),quantity:1,unitPrice:100}));
 const longItems=Array.from({length:12},(_,index)=>({orderName:"Premium embroidered fabric with an unusually detailed description "+("and special finishing details ").repeat(4)+index,quantity:1,unitPrice:100}));
 const shortPages=buildInvoiceDesignPages(template,shortItems,{itemColumns:[]});
 const longPages=buildInvoiceDesignPages(template,longItems,{itemColumns:[]});
 assert.ok(longPages.length>shortPages.length);
 assert.ok(longPages.some(page=>page.rows.some(row=>row.estimatedLines>1)));
 assert.deepEqual(longPages.flatMap(page=>page.rows.map(row=>row.itemNumber)),Array.from({length:12},(_,index)=>index+1));
 assert.ok(longPages.every(page=>page.rows.length===1||page.rowHeightTotalMm+11<=page.tableHeightMm+0.01));
 assert.ok(longPages[longPages.length-1].blocks.some(block=>block.type==="totals"));
 assert.ok(longPages.slice(0,-1).every(page=>!page.blocks.some(block=>block.type==="totals")));
});
test("invoice row measurements use the same display quantities as the printed item table",()=>{
 const {getInvoiceItemCellValue}=require("../utils/invoiceDesignPagination");
 const item={qtyUnit:"PCS",quantity:10,shortPcs:2,unitPrice:5};
 assert.equal(getInvoiceItemCellValue(item,{key:"amount"},0,1),"40.00");
 assert.equal(getInvoiceItemCellValue(item,{key:"sr"},0,7),7);
});
test("variable-height row measurement follows the visible table columns and font size",()=>{
 const {estimateInvoiceItemRow}=require("../utils/invoiceDesignPagination");
 const metrics={tableWidthMm:180};
 const item={orderName:"Long product description ".repeat(8),hsnCode:"5208",unitPrice:125};
 const narrow={type:"items_table",fontSize:8,tableCellPadding:4,columns:[{key:"description",width:20,visible:true}]};
 const wide={...narrow,columns:[{key:"description",width:70,visible:true}]};
 const largeFont={...wide,fontSize:12};
 const narrowHeight=estimateInvoiceItemRow(item,narrow.columns,metrics,narrow,{},1);
 const wideHeight=estimateInvoiceItemRow(item,wide.columns,metrics,wide,{},1);
 const largeFontHeight=estimateInvoiceItemRow(item,wide.columns,metrics,largeFont,{},1);
 assert.ok(narrowHeight.rowHeightMm>=wideHeight.rowHeightMm);
 assert.ok(largeFontHeight.rowHeightMm>=wideHeight.rowHeightMm);
});
test("multi-page invoice pagination retains original line numbering and moves totals to the final page",()=>{
 const template={pageSize:"A5",orientation:"portrait",blocks:[
  {id:"items",type:"items_table",x:5,y:30,w:90,h:30,visible:true,columns:[{key:"description",width:40,visible:true}]},
  {id:"totals",type:"totals",x:60,y:70,w:35,h:20,visible:true},
  {id:"signature",type:"field",fieldKey:"signature",x:60,y:92,w:35,h:5,visible:true}
 ]};
 const rows=Array.from({length:18},(_,index)=>({orderName:"Item "+(index+1)}));
 const pages=buildInvoiceDesignPages(template,rows);
 assert.ok(pages.length>1);
 assert.deepEqual(pages.flatMap(page=>page.rows.map(row=>row.itemNumber)),Array.from({length:18},(_,index)=>index+1));
 assert.equal(pages[0].blocks.some(block=>block.type==="totals"),false);
 assert.ok(pages[pages.length-1].blocks.some(block=>block.type==="totals"));
 assert.ok(pages[pages.length-1].blocks.some(block=>block.id==="signature"));
});


test("browser-measured invoice print check detects clipped text, overflowing rows, page overflow and missing images",async()=>{
 const {analyzeRenderedInvoiceMetrics}=await import("../../frontend/src/utils/invoiceRenderedPrintCheck.js");
 const result=analyzeRenderedInvoiceMetrics({pages:[{
  pageNumber:1,width:800,height:1100,blocks:[
   {id:"address",type:"field",bounds:{left:20,top:30,right:220,bottom:65},contentHeight:58,clientHeight:35,rows:[],images:[]},
   {id:"items",type:"items_table",bounds:{left:20,top:200,right:780,bottom:500},contentHeight:350,clientHeight:300,rows:[{itemNumber:7,label:"Long fabric description",bottom:525}],images:[]},
   {id:"logo",type:"image",bounds:{left:810,top:10,right:860,bottom:60},contentHeight:0,clientHeight:0,rows:[],images:[{broken:true,alt:"Business logo"}]}
  ]
 }]});
 assert.equal(result.pageCount,1);
 assert.equal(result.hasErrors,true);
 assert.ok(result.warnings.some(warning=>warning.title==="Text or totals may be clipped"));
 assert.ok(result.warnings.some(warning=>warning.title==="An item row exceeds the table area"&&warning.itemNumber===7));
 assert.ok(result.warnings.some(warning=>warning.title==="Element extends beyond the paper"));
 assert.ok(result.warnings.some(warning=>warning.title==="An image could not be loaded"));
});
test("browser-measured invoice print check reports a clean multi-page layout",async()=>{
 const {analyzeRenderedInvoiceMetrics}=await import("../../frontend/src/utils/invoiceRenderedPrintCheck.js");
 const result=analyzeRenderedInvoiceMetrics({pages:[
  {pageNumber:1,width:800,height:1100,blocks:[{id:"items",type:"items_table",bounds:{left:20,top:100,right:780,bottom:900},contentHeight:800,clientHeight:800,rows:[{itemNumber:1,label:"Shirt",bottom:400}],images:[]}]},
  {pageNumber:2,width:800,height:1100,blocks:[{id:"totals",type:"totals",bounds:{left:600,top:900,right:780,bottom:1050},contentHeight:100,clientHeight:150,rows:[],images:[]}]}
 ]});
 assert.equal(result.pageCount,2);
 assert.deepEqual(result.warnings,[]);
 assert.equal(result.hasErrors,false);
});

 
test("browser invoice measurement extracts page, block, row and image geometry",async()=>{
 const {measureRenderedInvoiceDocument}=await import("../../frontend/src/utils/invoiceRenderedPrintCheck.js");
 const rect=(left,top,right,bottom)=>({left,top,right,bottom,width:right-left,height:bottom-top});
 const row={
  getBoundingClientRect:()=>rect(20,220,780,245),
  getAttribute:key=>({"data-item-number":"3","data-item-label":"Cotton fabric"}[key]||null)
 };
 const table={querySelectorAll:selector=>selector==="tbody tr"?[row]:[]};
 const image={complete:true,naturalWidth:0,getAttribute:key=>key==="alt"?"Business logo":null};
 const block={
  getBoundingClientRect:()=>rect(20,200,780,500),
  getAttribute:key=>({"data-block-id":"item-table","data-block-type":"items_table"}[key]||null),
  querySelector:selector=>selector===".design-items"?table:null,
  querySelectorAll:selector=>selector==="img"?[image]:[],
  scrollHeight:300,clientHeight:300,scrollWidth:760,clientWidth:760
 };
 const sheet={
  getBoundingClientRect:()=>rect(0,0,800,1100),
  querySelectorAll:selector=>selector===".design-block"?[block]:[],
  clientWidth:800,clientHeight:1100
 };
 const documentRef={querySelectorAll:selector=>selector===".design-sheet"?[sheet]:[]};
 const measured=measureRenderedInvoiceDocument(documentRef);
 assert.equal(measured.pages.length,1);
 assert.equal(measured.pages[0].blocks[0].id,"item-table");
 assert.equal(measured.pages[0].blocks[0].rows[0].itemNumber,3);
 assert.equal(measured.pages[0].blocks[0].rows[0].label,"Cotton fabric");
 assert.equal(measured.pages[0].blocks[0].images[0].broken,true);
});

 
test("sample invoice data creates a balanced preview without requiring a saved order",()=>{
 const order=buildSampleInvoiceOrder({ownerId:"64b000000000000000000001",stateCode:24,state:"Gujarat"});
 const itemSubtotal=order.subOrders.reduce((sum,item)=>sum+Number(item.quantity||0)*Number(item.unitPrice||0),0);
 assert.equal(order.orderNumber,"SAMPLE-INV-001");
 assert.equal(order.createdBy,"64b000000000000000000001");
 assert.equal(order.subOrders.length,2);
 assert.equal(itemSubtotal,10000);
 assert.equal(order.discountAmount,500);
 assert.equal(order.totalCost,9500);
 assert.equal(order.taxPercentage,18);
 assert.equal(order.taxAmount,1710);
 assert.equal(order.totalAmount,11210);
 assert.equal(order.paidAmount+order.dueAmount,order.totalAmount);
 assert.equal(order.paymentStatus,"Partial");
 assert.equal(order.stateCode,24);
 assert.equal(order.State,"Gujarat");
 assert.ok(order.orderDate instanceof Date);
});
test("sample invoice uses the account state code when one is available",()=>{
 const order=buildSampleInvoiceOrder({ownerId:"sample-owner",stateCode:"27",state:"Maharashtra"});
 assert.equal(order.stateCode,27);
 assert.equal(order.State,"Maharashtra");
});

 
test("blank invoice tables preserve safe editable headings, cells and print styles",async()=>{
 const design=sanitizeInvoiceDesign({enabled:true,templates:[{id:"blank-table",blocks:[{
  id:"custom-table",type:"blank_table",label:"Measurements",x:5,y:40,w:90,h:20,
  tableColumns:[{id:"fabric",label:"Fabric / Design",width:55},{id:"meters",label:"Meters",width:20},{id:"remarks",label:"Remarks",width:25}],
  tableRows:[["Cotton floral","12","Urgent"],["","", ""]],
  tableShowHeader:true,tableHeaderBackground:"#123456",tableHeaderColor:"#ffffff",tableBorderColor:"#abcdef",tableCellPadding:5
 }]}]});
 const table=design.templates[0].blocks[0];
 assert.equal(table.type,"blank_table");
 assert.deepEqual(table.tableColumns.map(column=>column.label),["Fabric / Design","Meters","Remarks"]);
 assert.deepEqual(table.tableRows,[["Cotton floral","12","Urgent"],["","",""]]);
 assert.equal(table.tableShowHeader,true);
 assert.equal(table.tableHeaderBackground,"#123456");
 assert.equal(table.tableCellPadding,5);
});
test("blank invoice table sanitization bounds columns, rows and cell text",()=>{
 const unsafe=sanitizeInvoiceDesign({templates:[{id:"limited",blocks:[{
  id:"static-grid",type:"blank_table",
  tableColumns:Array.from({length:24},(_,index)=>({id:"c"+index,label:"Column "+index,width:20})),
  tableRows:Array.from({length:110},()=>Array.from({length:14},()=>"x".repeat(500)))
 }]}]});
 const table=unsafe.templates[0].blocks[0];
 assert.equal(table.tableColumns.length,20);
 assert.equal(table.tableRows.length,100);
 assert.equal(table.tableRows[0].length,20);
 assert.equal(table.tableRows[0][0].length,240);
 assert.ok(Math.abs(table.tableColumns.reduce((sum,column)=>sum+column.width,0)-100)<0.1);
});
test("custom text styling is sanitized and survives invoice design saves",()=>{
 const design=sanitizeInvoiceDesign({templates:[{id:"text-style",blocks:[{
  id:"note",type:"text",text:"Delivery instructions\nHandle with care",
  lineHeight:1.8,letterSpacing:2.5,textDecoration:"underline",textTransform:"uppercase",verticalAlign:"middle"
 }]}]});
 const note=design.templates[0].blocks[0];
 assert.equal(note.text,"Delivery instructions\nHandle with care");
 assert.equal(note.lineHeight,1.8);
 assert.equal(note.letterSpacing,2.5);
 assert.equal(note.textDecoration,"underline");
 assert.equal(note.textTransform,"uppercase");
 assert.equal(note.verticalAlign,"middle");
 const safe=sanitizeInvoiceDesign({templates:[{id:"unsafe",blocks:[{id:"note",type:"text",text:"Safe",lineHeight:9,letterSpacing:99,textDecoration:"blink",textTransform:"insert",verticalAlign:"sideways"}]}]});
 const safeNote=safe.templates[0].blocks[0];
 assert.equal(safeNote.lineHeight,2.5);
 assert.equal(safeNote.letterSpacing,8);
 assert.equal(safeNote.textDecoration,"none");
 assert.equal(safeNote.textTransform,"none");
 assert.equal(safeNote.verticalAlign,"top");
});
test("professional built-in templates include complete, readable business and invoice details",async()=>{
 const {INVOICE_DESIGN_PRESETS,createInvoiceDesignTemplate}=await import("../../frontend/src/utils/invoiceTemplateLibrary.js");
 assert.equal(INVOICE_DESIGN_PRESETS.length,14);
 for(const preset of INVOICE_DESIGN_PRESETS){
  const template=createInvoiceDesignTemplate("test-"+preset.key,preset.key);
  const fields=new Set(template.blocks.filter(block=>block.type==="field").map(block=>block.fieldKey));
  const field=key=>template.blocks.find(block=>block.type==="field"&&block.fieldKey===key);
  const table=template.blocks.find(block=>block.type==="items_table");
  assert.ok(fields.has("company_name"),preset.key+" has business name");
  for(const key of ["company_address","company_gstin","company_phone","company_email","customer_name","customer_address","customer_phone","customer_gstin","customer_state","invoice_title","invoice_no","invoice_date","due_date","challan_no","payment_terms","eway_bill","amount_words","bank_details","terms","signature"])assert.ok(fields.has(key),preset.key+" has "+key);
  assert.ok(field("company_name").fontSize>=20,preset.key+" has readable business name");
  assert.ok(field("customer_name").fontSize>=11,preset.key+" has readable customer name");
  assert.ok(field("invoice_title").fontSize>=17,preset.key+" has readable invoice title");
  assert.ok(table.fontSize>=(preset.pageSize==="A5"?8.4:9),preset.key+" has readable item text");
  assert.ok(Math.abs(table.columns.reduce((sum,column)=>sum+column.width,0)-100)<0.1,preset.key+" item columns use the full table width");
  assert.ok(template.blocks.some(block=>block.type==="totals"),preset.key+" has invoice totals");
  assert.ok(template.blocks.filter(block=>block.visible!==false).every(block=>block.x>=0&&block.y>=0&&block.x+block.w<=100.001&&block.y+block.h<=100.001),preset.key+" stays on the page");
 }
});


test("blank invoice tables start as a genuinely empty editable grid and preserve zero rows",()=>{
 const design=sanitizeInvoiceDesign({templates:[{id:"empty-grid",elementLimit:120,blocks:[{
  id:"blank",type:"blank_table",tableColumns:[{id:"column-1",label:"",width:100}],tableRows:[[""]],tableShowHeader:false
 }]}]});
 const template=design.templates[0],table=template.blocks[0];
 assert.equal(template.elementLimit,120);
 assert.deepEqual(table.tableColumns.map(column=>column.label),[""]);
 assert.deepEqual(table.tableRows,[[""]]);
 assert.equal(table.tableShowHeader,false);
 const zeroRows=sanitizeInvoiceDesign({templates:[{id:"zero-rows",blocks:[{
  id:"blank",type:"blank_table",tableColumns:[{id:"column-1",label:"",width:100}],tableRows:[]
 }]}]});
 assert.deepEqual(zeroRows.templates[0].blocks[0].tableRows,[]);
});

test("invoice design element capacity is configurable and safely bounded",()=>{
 const blocks=Array.from({length:175},(_,index)=>({id:"element-"+index,type:"text",text:"Note "+index,x:2,y:2,w:20,h:3}));
 const expanded=sanitizeInvoiceDesign({templates:[{id:"expanded",elementLimit:200,blocks}]});
 assert.equal(expanded.templates[0].elementLimit,200);
 assert.equal(expanded.templates[0].blocks.length,175);
 const capped=sanitizeInvoiceDesign({templates:[{id:"capped",elementLimit:999,blocks}]});
 assert.equal(capped.templates[0].elementLimit,300);
 assert.equal(capped.templates[0].blocks.length,175);
 const defaulted=sanitizeInvoiceDesign({templates:[{id:"default-limit",blocks}]});
 assert.equal(defaulted.templates[0].elementLimit,80);
 assert.equal(defaulted.templates[0].blocks.length,80);
});

test("industry templates define their own business-specific invoice item columns",async()=>{
 const {INVOICE_DESIGN_PRESETS,createInvoiceDesignTemplate}=await import("../../frontend/src/utils/invoiceTemplateLibrary.js");
 const textile=createInvoiceDesignTemplate("textile","textile-wholesale");
 const services=createInvoiceDesignTemplate("services","professional-services");
 const retail=createInvoiceDesignTemplate("retail","retail-counter");
 const textileColumns=textile.blocks.find(block=>block.type==="items_table").columns.map(column=>column.key);
 const serviceColumns=services.blocks.find(block=>block.type==="items_table").columns.map(column=>column.key);
 const retailColumns=retail.blocks.find(block=>block.type==="items_table").columns.map(column=>column.key);
 assert.ok(textileColumns.includes("MTR"));
 assert.ok(textileColumns.includes("cut"));
 assert.ok(textileColumns.includes("designNumber"));
 assert.ok(serviceColumns.includes("description"));
 assert.ok(!serviceColumns.includes("MTR"));
 assert.ok(retail.pageSize==="A5");
 assert.ok(INVOICE_DESIGN_PRESETS.every(preset=>preset.columns.length>=5));
});


test("ready-made textile invoice uses prominent type and pre-placed GST, customer and payment content",async()=>{
 const {createInvoiceDesignTemplate}=await import("../../frontend/src/utils/invoiceTemplateLibrary.js");
 const template=createInvoiceDesignTemplate("ready","textile-wholesale");
 const get=key=>template.blocks.find(block=>block.type==="field"&&block.fieldKey===key);
 const table=template.blocks.find(block=>block.type==="items_table");
 assert.ok(get("company_name").fontSize>=20);
 assert.ok(get("company_address").fontSize>=9);
 assert.ok(get("customer_name").fontSize>=11);
 assert.ok(get("invoice_title").fontSize>=19);
 assert.equal(get("customer_name").showLabel,false);
 assert.ok(table.columns.some(column=>column.key==="taxable"));
 assert.ok(table.columns.some(column=>column.key==="MTR"));
 assert.ok(table.columns.some(column=>column.key==="hsnCode"));
 assert.ok(template.blocks.some(block=>block.type==="totals"));
 assert.ok(get("eway_bill"));
});

test("empty invoice metadata values do not print orphaned field labels",async()=>{
 const template=sanitizeInvoiceDesign({templates:[{id:"empty-meta",blocks:[{
  id:"eway",type:"field",fieldKey:"eway_bill",label:"E-Way Bill",showLabel:true,x:5,y:5,w:40,h:4
 }]}]}).templates[0];
 const html=await ejs.renderFile(path.join(__dirname,"../public/invoiceTable.ejs"),{
  invoiceConfig:{invoiceTitle:"TAX INVOICE",pageSize:"A4",accentColor:"#172335",itemColumns:[],design:{enabled:true,activeTemplateId:"empty-meta",templates:[template]}},
  invoicePages:[{pageNumber:1,totalPages:1,blocks:template.blocks,rows:[]}],profileLogoUrl:"",publicUploadBaseUrl:"",
  profileHeaderTitle:"Invoice",profileCompanyName:"Example",profileCompanyAddress:"Surat",profileEmailAddress:"",profileWebsite:"",
  profilePhoneNumber1:"",profilePhoneNumber2:"",profileGstNumber:"",profilePanNumber:"",profileBankName:"",profileAccountNo:"",
  profileBranchName:"",profileIfsc:"",clientChallanNumber:"",clientCompanyName:"Customer",clientAddress:"Address",
  clientPhoneNumber:"",clientGstNumber:"",clientState:"Gujarat",orderNumber:"INV-EMPTY",createdAt:"",dueDate:"",
  paymentTerm:"",ewayBillNo:"",subOrders:[],orderPaidAmount:0,orderTotalCost:0,orderSubTotal:0,orderDisRate:0,
  orderDiscountAmount:0,orderTax:0,orderTaxAmount:0,orderIgstTax:0,orderIgstTaxAmount:0,orderFinalRevenue:0,
  orderFinalRevenueRoundOff:0,orderFinalRevenueAfterRoundOff:0,orderFinalRevenueInWords:"",paymentStatus:"Unpaid",dueAmount:0,
  creditAppliedAmount:0,payments:[]
 });
 const ewayBlock=html.match(/data-block-id="eway"[\s\S]*?<\/div>/)?.[0]||"";
 assert.ok(ewayBlock);
 assert.ok(!ewayBlock.includes("E-Way Bill:"));
});


test("industry invoice presets render readable live business, customer, item and payment sections",async()=>{
 const {createInvoiceDesignTemplate}=await import("../../frontend/src/utils/invoiceTemplateLibrary.js");
 for(const key of ["textile-wholesale","retail-counter","professional-services"]){
  const source=createInvoiceDesignTemplate("render-"+key,key);
  const template=sanitizeInvoiceDesign({enabled:true,activeTemplateId:source.id,templates:[source]}).templates[0];
  const html=await ejs.renderFile(path.join(__dirname,"../public/invoiceTable.ejs"),{
   invoiceConfig:{invoiceTitle:"TAX INVOICE",pageSize:template.pageSize,accentColor:"#214a70",itemColumns:[],design:{enabled:true,activeTemplateId:template.id,templates:[template]}},
   invoicePages:[{pageNumber:1,totalPages:1,blocks:template.blocks,rows:[{
    item:{orderName:"Premium cotton fabric",designNumber:"TX-100",hsnCode:"5208",quantity:4,qtyUnit:"MTR",MTR:48,cut:12,shortPcs:1,unitPrice:350},
    itemNumber:1,rowHeightMm:9
   }]}],
   profileLogoUrl:"",publicUploadBaseUrl:"",profileHeaderTitle:"Invoice",
   profileCompanyName:"A1 Textiles",profileCompanyAddress:"Surat, Gujarat 395002",
   profileEmailAddress:"accounts@a1textiles.in",profileWebsite:"www.a1textiles.in",
   profilePhoneNumber1:"+91 98765 43210",profilePhoneNumber2:"",profileGstNumber:"24ABCDE1234F1Z5",
   profilePanNumber:"",profileBankName:"HDFC Bank",profileAccountNo:"1234567890",
   profileBranchName:"Surat Main",profileIfsc:"HDFC0001234",
   clientChallanNumber:"CH-2026-01",clientCompanyName:"Sample Garments",
   clientAddress:"Ring Road, Surat",clientPhoneNumber:"+91 98765 00000",
   clientGstNumber:"24XYZDE1234F1Z5",clientState:"Gujarat",
   orderNumber:"INV-2026-001",createdAt:"20 Nov 2026",dueDate:"27 Nov 2026",
   paymentTerm:"7",ewayBillNo:"241012345678",subOrders:[],
   orderPaidAmount:500,orderTotalCost:1400,orderSubTotal:1400,orderDisRate:0,
   orderDiscountAmount:0,orderTax:18,orderTaxAmount:126,orderIgstTax:0,
   orderIgstTaxAmount:0,orderFinalRevenue:1652,orderFinalRevenueRoundOff:0,
   orderFinalRevenueAfterRoundOff:1652,orderFinalRevenueInWords:"One thousand six hundred fifty two only",
   paymentStatus:"Partially Paid",dueAmount:1152,creditAppliedAmount:0,payments:[]
  });
  assert.ok(html.includes("A1 Textiles"),key+" renders business name");
  assert.ok(html.includes("Sample Garments"),key+" renders customer name");
  assert.ok(html.includes("INV-2026-001"),key+" renders invoice number");
  assert.ok(html.includes("Premium cotton fabric"),key+" renders live item description");
  assert.ok(html.includes("24ABCDE1234F1Z5"),key+" renders GSTIN");
  assert.ok(html.includes("241012345678"),key+" renders E-Way Bill");
  assert.ok(html.includes("Bank details"),key+" renders bank details label");
  assert.ok(html.includes("font-size:21.5px")||html.includes("font-size:20.5px")||html.includes("font-size:20px"),key+" renders prominent business typography");
  assert.ok(html.includes("data-block-type=\"items_table\""),key+" renders item table");
  assert.ok(html.includes("data-block-type=\"totals\""),key+" renders invoice totals");
 }
});
