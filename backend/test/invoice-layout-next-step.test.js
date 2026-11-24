const test=require("node:test");
const assert=require("node:assert/strict");
const {estimateInvoiceItemRow}=require("../utils/invoiceDesignPagination");

test("print fit estimation treats Gujarati and Devanagari glyphs conservatively",async()=>{
 const {estimateInvoiceTextOverflow}=await import("../../frontend/src/utils/invoicePrintFit.js");
 const block={id:"unicode-copy",type:"text",x:0,y:0,w:6.3,h:4,fontSize:10,padding:0,visible:true};
 const latin=estimateInvoiceTextOverflow([{...block,text:"abcdefghijklmnopqrst"}],{},{pageSize:"A4",orientation:"portrait"});
 const gujarati=estimateInvoiceTextOverflow([{...block,text:"કખગઘચછજઝટઠડઢણતથદધનપ"}],{},{pageSize:"A4",orientation:"portrait"});
 const devanagari=estimateInvoiceTextOverflow([{...block,text:"कखगघचछजझटठडढणतथदधनप"}],{},{pageSize:"A4",orientation:"portrait"});
 assert.equal(latin.length,0);
 assert.ok(gujarati.some(issue=>issue.blockId==="unicode-copy"));
 assert.ok(devanagari.some(issue=>issue.blockId==="unicode-copy"));
});

test("item-row pagination reserves additional height for Gujarati descriptions",()=>{
 const metrics={tableWidthMm:180};
 const table={type:"items_table",fontSize:8,tableCellPadding:4,tableBorderWidth:1,columns:[{key:"description",width:40,visible:true}]};
 const latin={orderName:Array(4).fill("abcdefghijklmnopqrst").join(" ")};
 const gujarati={orderName:Array(4).fill("કખગઘચછજઝટઠડઢણતથદધનપ").join(" ")};
 const latinRow=estimateInvoiceItemRow(latin,table.columns,metrics,table,{},1);
 const gujaratiRow=estimateInvoiceItemRow(gujarati,table.columns,metrics,table,{},1);
 assert.ok(gujaratiRow.rowHeightMm>latinRow.rowHeightMm);
 assert.ok(gujaratiRow.lineCount>latinRow.lineCount);
});

test("rendered print audit catches overlapping, reordered and over-wide item rows",async()=>{
 const {analyzeRenderedInvoiceMetrics}=await import("../../frontend/src/utils/invoiceRenderedPrintCheck.js");
 const result=analyzeRenderedInvoiceMetrics({pages:[{pageNumber:1,width:794,height:1123,blocks:[
  {id:"items",type:"items_table",bounds:{left:20,top:100,right:780,bottom:900},rows:[
   {itemNumber:1,top:200,bottom:250,left:20,right:780},
   {itemNumber:2,top:240,bottom:300,left:20,right:780},
   {itemNumber:3,top:150,bottom:190,left:10,right:790}
  ],images:[]}
 ]}]});
 assert.ok(result.warnings.some(issue=>issue.id==="item-row-overlap-1-items-1-2"&&issue.severity==="error"));
 assert.ok(result.warnings.some(issue=>issue.id==="item-row-order-1-items-2-3"));
 assert.ok(result.warnings.some(issue=>issue.id==="item-row-width-1-items-3"&&issue.severity==="error"));
});

test("A4 and A5 portrait and landscape print geometry remains exact",async()=>{
 const {getInvoicePrintGeometry}=await import("../../frontend/src/utils/invoicePrintFit.js");
 const expected=[
  ["A4","portrait",210,297],
  ["A4","landscape",297,210],
  ["A5","portrait",148,210],
  ["A5","landscape",210,148]
 ];
 expected.forEach(([size,orientation,width,height])=>{
  const geometry=getInvoicePrintGeometry(size,orientation);
  assert.deepEqual([geometry.widthMm,geometry.heightMm],[width,height]);
 });
});
