const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ejs=require("ejs");
const {createDefaultInvoiceDesign,sanitizeInvoiceDesign}=require("../utils/invoiceDesign");
const {hasInvoiceBackgroundSignature}=require("../utils/invoiceBackground");
const {buildInvoiceDesignPages,getInvoiceRowsPerPage}=require("../utils/invoiceDesignPagination");
const {buildInvoicePrintPreview}=require("../utils/invoicePrintPreview");

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
  assert.equal(INVOICE_DESIGN_PRESETS.length,8);
  const keys=INVOICE_DESIGN_PRESETS.map(preset=>preset.key);
  assert.equal(new Set(keys).size,8);
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
  assert.deepEqual(pages.map(page=>page.rows.length),[9,9,7]);
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
