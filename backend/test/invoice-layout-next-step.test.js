const test=require("node:test");
const assert=require("node:assert/strict");
const {estimateInvoiceItemRow,buildInvoiceDesignPages}=require("../utils/invoiceDesignPagination");

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


test("multipage invoices keep totals, payment details, terms and signature together on the final page",()=>{
 const template={
  pageSize:"A4",
  orientation:"portrait",
  printMargins:{top:0,right:0,bottom:0,left:0},
  blocks:[
   {id:"company",type:"field",fieldKey:"company_name",x:6,y:5,w:50,h:5,visible:true},
   {id:"items",type:"items_table",x:6,y:40,w:88,h:35,visible:true,fontSize:8,tableCellPadding:4,tableBorderWidth:1,columns:[{key:"description",label:"Description",width:100,visible:true,order:0}]},
   {id:"note",type:"text",label:"Page note",text:"Keep on first page",x:6,y:50,w:35,h:4,visible:true},
   {id:"terms",type:"field",fieldKey:"terms",x:6,y:70,w:45,h:8,visible:true},
   {id:"words",type:"field",fieldKey:"amount_words",x:6,y:79,w:45,h:5,visible:true},
   {id:"bank",type:"field",fieldKey:"bank_details",x:6,y:85,w:45,h:5,visible:true},
   {id:"paid",type:"field",fieldKey:"amount_paid",x:55,y:79,w:35,h:4,visible:true},
   {id:"due",type:"field",fieldKey:"balance_due",x:55,y:84,w:35,h:4,visible:true},
   {id:"signature",type:"field",fieldKey:"signature",x:55,y:91,w:35,h:5,visible:true},
   {id:"totals",type:"totals",x:60,y:78,w:34,h:15,visible:true}
  ]
 };
 const items=Array.from({length:12},(_,index)=>({orderName:"Item "+(index+1)}));
 const pages=buildInvoiceDesignPages(template,items);
 assert.equal(pages.length,2);
 const firstIds=pages[0].blocks.map(block=>block.id);
 const lastIds=pages[1].blocks.map(block=>block.id);
 assert.ok(firstIds.includes("company"));
 assert.ok(firstIds.includes("note"));
 ["terms","words","bank","paid","due","signature","totals"].forEach(id=>{
  assert.ok(!firstIds.includes(id),id+" must not appear before the final item page");
  assert.ok(lastIds.includes(id),id+" must appear on the final page");
 });
 assert.ok(pages[0].blocks.some(block=>block.type==="items_table"));
 assert.ok(pages[1].blocks.some(block=>block.type==="items_table"));
});


function makeClosingReservationTemplate(){
 const table={id:"items",type:"items_table",x:6,y:20,w:88,h:60,visible:true,fontSize:8,tableCellPadding:4,tableBorderWidth:1,columns:[{key:"description",label:"Description",width:100,visible:true,order:0}]};
 const totals={id:"totals",type:"totals",x:60,y:65,w:34,h:15,visible:true};
 return {pageSize:"A4",orientation:"portrait",printMargins:{top:0,right:0,bottom:0,left:0},blocks:[table,totals]};
}

test("final-page closing overlap reserves item-table space and balances the last item page",()=>{
 const template=makeClosingReservationTemplate();
 const items=Array.from({length:24},(_,index)=>({orderName:"Item "+(index+1)}));
 const pages=buildInvoiceDesignPages(template,items);
 assert.equal(pages.length,2);
 assert.ok(pages[1].reservedClosingSpaceMm>0);
 assert.ok(pages[1].itemCapacityMm<pages[0].itemCapacityMm);
 assert.ok(pages[1].rowHeightTotalMm<=pages[1].itemCapacityMm+0.01);
 assert.ok(pages[0].rows.length>6);
 assert.ok(pages[1].rows.length>6);
 assert.ok(pages[1].blocks.some(block=>block.id==="totals"));
 assert.ok(!pages[0].blocks.some(block=>block.id==="totals"));
 const itemNumbers=pages.flatMap(page=>page.rows.map(row=>row.itemNumber));
 assert.deepEqual(itemNumbers,items.map((_,index)=>index+1));
});

test("closing blocks beside the item table do not reserve unnecessary table height",()=>{
 const template=makeClosingReservationTemplate();
 template.blocks[0].w=60;
 template.blocks[1].x=70;
 template.blocks[1].w=24;
 const items=Array.from({length:20},(_,index)=>({orderName:"Item "+(index+1)}));
 const pages=buildInvoiceDesignPages(template,items);
 assert.equal(pages.length,2);
 assert.equal(pages[1].reservedClosingSpaceMm,0);
 assert.ok(pages[0].rows.length>2);
 assert.ok(pages[1].rows.length>2);
 assert.deepEqual(pages.flatMap(page=>page.rows.map(row=>row.itemNumber)),items.map((_,index)=>index+1));
});

test("a closing block covering the item-table area creates a closing-only page without duplicating rows",()=>{
 const template=makeClosingReservationTemplate();
 template.blocks[1]={id:"totals",type:"totals",x:6,y:20,w:88,h:60,visible:true};
 const items=[{orderName:"First item"},{orderName:"Second item"}];
 const pages=buildInvoiceDesignPages(template,items);
 assert.equal(pages.length,2);
 assert.deepEqual(pages[0].rows.map(row=>row.itemNumber),[1,2]);
 assert.equal(pages[1].rows.length,0);
 assert.equal(pages[1].closingOnly,true);
 assert.ok(!pages[1].blocks.some(block=>block.type==="items_table"));
 assert.ok(pages[1].blocks.some(block=>block.type==="totals"));
 assert.deepEqual(pages.flatMap(page=>page.rows.map(row=>row.itemNumber)),[1,2]);
});

test("rendered print audit exposes page-by-page item counts and reserved closing space",async()=>{
 const {measureRenderedInvoiceDocument,analyzeRenderedInvoiceMetrics}=await import("../../frontend/src/utils/invoiceRenderedPrintCheck.js");
 const rect={left:0,top:0,right:794,bottom:1123,width:794,height:1123};
 const sheet={
  getBoundingClientRect:()=>rect,
  getAttribute:name=>({
   "data-page-number":"2",
   "data-page-item-count":"7",
   "data-page-item-capacity-mm":"119.65",
   "data-page-closing-reserved-mm":"47.55",
   "data-page-closing-only":"false"
  }[name]??null),
  querySelectorAll:()=>[],
  clientWidth:794,
  clientHeight:1123
 };
 const documentRef={querySelectorAll:selector=>selector===".design-sheet"?[sheet]:[]};
 const measured=measureRenderedInvoiceDocument(documentRef);
 const audit=analyzeRenderedInvoiceMetrics(measured,{pageSize:"A4",orientation:"portrait"});
 assert.deepEqual(audit.pageLayouts,[{pageNumber:2,itemCount:7,itemCapacityMm:119.65,reservedClosingSpaceMm:47.55,closingOnly:false}]);
});

test("pagination hints explain when closing details safely require a dedicated final page",async()=>{
 const {analyzeInvoicePagination}=await import("../../frontend/src/utils/invoicePaginationHints.js");
 const warnings=analyzeInvoicePagination([
  {pageNumber:1,blocks:[{type:"items_table",rows:[{itemNumber:1}]}]},
  {pageNumber:2,closingOnly:true,blocks:[{type:"totals",rows:[]}]}
 ]);
 assert.ok(warnings.some(issue=>issue.id==="closing-only-page-2"&&issue.severity==="warning"));
});

test("actual print audit detects item rows that overflow the reserved final-page capacity",async()=>{
 const {analyzeRenderedInvoiceMetrics}=await import("../../frontend/src/utils/invoiceRenderedPrintCheck.js");
 const result=analyzeRenderedInvoiceMetrics({pages:[{
  pageNumber:2,
  width:794,
  height:1123,
  itemCount:2,
  itemCapacityMm:25,
  reservedClosingSpaceMm:40,
  blocks:[{
   id:"items",
   type:"items_table",
   bounds:{left:10,top:100,right:780,bottom:900},
   contentHeight:180,
   clientHeight:180,
   contentWidth:770,
   clientWidth:770,
   headerPresent:true,
   headerVisible:true,
   rows:[
    {itemNumber:4,label:"Long item",geometryAvailable:true,top:120,bottom:175,left:10,right:780,height:55,cellOverflowAxes:[],breakInside:"avoid",pageBreakInside:"avoid"},
    {itemNumber:5,label:"Another item",geometryAvailable:true,top:175,bottom:230,left:10,right:780,height:55,cellOverflowAxes:[],breakInside:"avoid",pageBreakInside:"avoid"}
   ],
   images:[]
  }]
 }]});
 const warning=result.warnings.find(issue=>issue.id==="item-page-capacity-overflow-2-items");
 assert.ok(warning);
 assert.equal(warning.severity,"error");
 assert.equal(warning.blockId,"items");
 assert.equal(warning.blockType,"items_table");
 assert.ok(warning.overflowMm>0);
});

test("actual print audit does not report page-capacity overflow when rendered rows fit",async()=>{
 const {analyzeRenderedInvoiceMetrics}=await import("../../frontend/src/utils/invoiceRenderedPrintCheck.js");
 const result=analyzeRenderedInvoiceMetrics({pages:[{
  pageNumber:1,
  width:794,
  height:1123,
  itemCount:2,
  itemCapacityMm:35,
  blocks:[{
   id:"items",
   type:"items_table",
   bounds:{left:10,top:100,right:780,bottom:900},
   contentHeight:180,
   clientHeight:180,
   contentWidth:770,
   clientWidth:770,
   headerPresent:true,
   headerVisible:true,
   rows:[
    {itemNumber:1,label:"One",geometryAvailable:true,top:120,bottom:170,left:10,right:780,height:50,cellOverflowAxes:[],breakInside:"avoid",pageBreakInside:"avoid"},
    {itemNumber:2,label:"Two",geometryAvailable:true,top:170,bottom:220,left:10,right:780,height:50,cellOverflowAxes:[],breakInside:"avoid",pageBreakInside:"avoid"}
   ],
   images:[]
  }]
 }]});
 assert.ok(!result.warnings.some(issue=>issue.id==="item-page-capacity-overflow-1-items"));
 assert.ok(!result.warnings.some(issue=>issue.id==="page-item-count-mismatch-1"));
});

test("actual print audit detects a page whose planned item rows are missing from the rendered table",async()=>{
 const {analyzeRenderedInvoiceMetrics}=await import("../../frontend/src/utils/invoiceRenderedPrintCheck.js");
 const result=analyzeRenderedInvoiceMetrics({pages:[{
  pageNumber:3,
  width:794,
  height:1123,
  itemCount:2,
  itemCapacityMm:60,
  blocks:[{
   id:"items",
   type:"items_table",
   bounds:{left:10,top:100,right:780,bottom:900},
   headerPresent:true,
   headerVisible:true,
   rows:[{itemNumber:5,label:"Only one row",geometryAvailable:true,top:120,bottom:150,left:10,right:780,height:30,cellOverflowAxes:[]}],
   images:[]
  }]
 }]});
 const warning=result.warnings.find(issue=>issue.id==="page-item-count-mismatch-3");
 assert.ok(warning);
 assert.equal(warning.severity,"error");
 assert.equal(warning.expectedItemCount,2);
 assert.equal(warning.measuredItemCount,1);
});

test("page item-count audit tolerates previews without allocation metadata",async()=>{
 const {analyzeRenderedInvoiceMetrics}=await import("../../frontend/src/utils/invoiceRenderedPrintCheck.js");
 const result=analyzeRenderedInvoiceMetrics({pages:[{
  pageNumber:1,
  width:794,
  height:1123,
  blocks:[{id:"items",type:"items_table",bounds:{left:10,top:100,right:780,bottom:900},rows:[{itemNumber:1,top:120,bottom:150,left:10,right:780,height:30,geometryAvailable:true}],images:[]}]
 }]});
 assert.ok(!result.warnings.some(issue=>issue.id==="page-item-count-mismatch-1"));
});

