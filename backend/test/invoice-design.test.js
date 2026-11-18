const test=require("node:test");
const assert=require("node:assert/strict");
const {createDefaultInvoiceDesign,sanitizeInvoiceDesign}=require("../utils/invoiceDesign");
const {hasInvoiceBackgroundSignature}=require("../utils/invoiceBackground");

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
