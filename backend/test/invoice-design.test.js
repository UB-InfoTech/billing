const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ejs=require("ejs");
const {createDefaultInvoiceDesign,sanitizeInvoiceDesign}=require("../utils/invoiceDesign");
const {hasInvoiceBackgroundSignature}=require("../utils/invoiceBackground");
const {buildInvoiceDesignPages,getInvoiceRowsPerPage}=require("../utils/invoiceDesignPagination");

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
        {id:"invoice-number",type:"field",fieldKey:"invoice_no",x:12,y:14,w:30,h:5,fontSize:13,bold:true,color:"#123456"},
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
