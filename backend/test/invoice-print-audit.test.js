const test=require("node:test");
const assert=require("node:assert/strict");

test("actual print audit validates A4 and A5 orientation and dimensions",async()=>{
 const {analyzeRenderedInvoiceMetrics}=await import("../../frontend/src/utils/invoiceRenderedPrintCheck.js");
 const a4=analyzeRenderedInvoiceMetrics({pages:[{pageNumber:1,width:794,height:1123,blocks:[]}]},{pageSize:"A4",orientation:"portrait"});
 assert.equal(a4.warnings.length,0);
 const a5Landscape=analyzeRenderedInvoiceMetrics({pages:[{pageNumber:1,width:794,height:559,blocks:[]}]},{pageSize:"A5",orientation:"landscape"});
 assert.equal(a5Landscape.warnings.length,0);
 const mismatch=analyzeRenderedInvoiceMetrics({pages:[{pageNumber:1,width:559,height:794,blocks:[]}]},{pageSize:"A4",orientation:"portrait"});
 assert.ok(mismatch.warnings.some(issue=>issue.id==="page-size-mismatch-1"));
});

test("actual print audit reports inconsistent page dimensions",async()=>{
 const {analyzeRenderedInvoiceMetrics}=await import("../../frontend/src/utils/invoiceRenderedPrintCheck.js");
 const result=analyzeRenderedInvoiceMetrics({pages:[
  {pageNumber:1,width:794,height:1123,blocks:[]},
  {pageNumber:2,width:559,height:794,blocks:[]}
 ]});
 assert.ok(result.warnings.some(issue=>issue.id==="inconsistent-page-size-2"));
});

test("actual print audit checks table headers, horizontal overflow, page boundaries and missing images",async()=>{
 const {analyzeRenderedInvoiceMetrics}=await import("../../frontend/src/utils/invoiceRenderedPrintCheck.js");
 const result=analyzeRenderedInvoiceMetrics({pages:[{
  pageNumber:1,width:800,height:1100,blocks:[
   {id:"address",type:"field",bounds:{left:20,top:30,right:220,bottom:65},contentHeight:58,clientHeight:35,rows:[],images:[]},
   {id:"items",type:"items_table",bounds:{left:20,top:200,right:780,bottom:500},contentHeight:350,clientHeight:300,contentWidth:820,clientWidth:760,headerVisible:false,rows:[{itemNumber:7,label:"Long fabric description",top:220,bottom:525}],images:[]},
   {id:"logo",type:"image",bounds:{left:810,top:10,right:860,bottom:60},contentHeight:0,clientHeight:0,rows:[],images:[{broken:true,alt:"Business logo"}]}
  ]
 }]});
 assert.equal(result.pageCount,1);
 assert.equal(result.hasErrors,true);
 assert.ok(result.warnings.some(issue=>issue.title==="Text or totals may be clipped"));
 assert.ok(result.warnings.some(issue=>issue.title==="An item row exceeds the table area"&&issue.itemNumber===7));
 assert.ok(result.warnings.some(issue=>issue.title==="Element extends beyond the paper"));
 assert.ok(result.warnings.some(issue=>issue.title==="An image could not be loaded"));
 assert.ok(result.warnings.some(issue=>issue.title==="Item table may be too wide"));
 assert.ok(result.warnings.some(issue=>issue.title==="Item table heading is not visible"));
});

test("actual print audit validates multipage item continuity and repeated headings",async()=>{
 const {analyzeRenderedInvoiceMetrics}=await import("../../frontend/src/utils/invoiceRenderedPrintCheck.js");
 const table=(id,rows)=>({id,type:"items_table",bounds:{left:10,top:100,right:780,bottom:900},contentHeight:800,clientHeight:800,contentWidth:770,clientWidth:770,headerVisible:true,rows,images:[]});
 const result=analyzeRenderedInvoiceMetrics({pages:[
  {pageNumber:1,width:794,height:1123,blocks:[table("items-1",[{itemNumber:1,label:"A",bottom:250},{itemNumber:2,label:"B",bottom:300}])]},
  {pageNumber:2,width:794,height:1123,blocks:[table("items-2",[{itemNumber:3,label:"C",bottom:250},{itemNumber:4,label:"D",bottom:300}])]}
 ]});
 assert.deepEqual(result.warnings,[]);
 assert.equal(result.pageCount,2);
});

test("actual print audit warns about gaps, duplicate rows and empty continuation tables",async()=>{
 const {analyzeRenderedInvoiceMetrics}=await import("../../frontend/src/utils/invoiceRenderedPrintCheck.js");
 const table=(id,rows)=>({id,type:"items_table",bounds:{left:10,top:100,right:780,bottom:900},contentHeight:800,clientHeight:800,contentWidth:770,clientWidth:770,headerVisible:true,rows,images:[]});
 const result=analyzeRenderedInvoiceMetrics({pages:[
  {pageNumber:1,width:794,height:1123,blocks:[table("items-1",[{itemNumber:1,label:"A",bottom:250},{itemNumber:3,label:"C",bottom:300},{itemNumber:3,label:"Duplicate",bottom:350}])]},
  {pageNumber:2,width:794,height:1123,blocks:[table("items-2",[])]}
 ]});
 assert.ok(result.warnings.some(issue=>issue.title==="Item numbering skips or changes order"));
 assert.ok(result.warnings.some(issue=>issue.title==="An invoice item is repeated"));
 assert.ok(result.warnings.some(issue=>issue.title==="An item-table page is empty"));
});

test("browser invoice measurement extracts page, block, row and table heading geometry",async()=>{
 const {measureRenderedInvoiceDocument}=await import("../../frontend/src/utils/invoiceRenderedPrintCheck.js");
 const rect=(left,top,right,bottom)=>({left,top,right,bottom,width:right-left,height:bottom-top});
 const row={getBoundingClientRect:()=>rect(20,220,780,245),getAttribute:key=>({"data-item-number":"3","data-item-label":"Cotton fabric"}[key]||null)};
 const header={getBoundingClientRect:()=>rect(20,200,780,220),querySelectorAll:()=>[{textContent:" # "},{textContent:" Cotton fabric "}]};
 const wrapper={querySelector:selector=>selector==="thead"?header:null,querySelectorAll:selector=>selector==="tbody tr"?[row]:[]};
 const image={complete:true,naturalWidth:0,getAttribute:key=>key==="alt"?"Business logo":null};
 const block={getBoundingClientRect:()=>rect(20,200,780,500),getAttribute:key=>({"data-block-id":"item-table","data-block-type":"items_table"}[key]||null),querySelector:selector=>selector===".design-items"?wrapper:null,querySelectorAll:selector=>selector==="img"?[image]:[],scrollHeight:300,clientHeight:300,scrollWidth:760,clientWidth:760};
 const sheet={getBoundingClientRect:()=>rect(0,0,800,1100),querySelectorAll:selector=>selector===".design-block"?[block]:[],clientWidth:800,clientHeight:1100};
 const documentRef={querySelectorAll:selector=>selector===".design-sheet"?[sheet]:[]};
 const measured=measureRenderedInvoiceDocument(documentRef);
 assert.equal(measured.pages.length,1);
 assert.equal(measured.pages[0].blocks[0].id,"item-table");
 assert.equal(measured.pages[0].blocks[0].rows[0].itemNumber,3);
 assert.equal(measured.pages[0].blocks[0].rows[0].label,"Cotton fabric");
 assert.equal(measured.pages[0].blocks[0].headerPresent,true);
 assert.equal(measured.pages[0].blocks[0].headerVisible,true);
 assert.deepEqual(measured.pages[0].blocks[0].headerLabels,["#","cotton fabric"]);
 assert.equal(measured.pages[0].blocks[0].images[0].broken,true);
});

test("actual print audit detects missing and inconsistent continuation-page table headings",async()=>{
 const {analyzeRenderedInvoiceMetrics}=await import("../../frontend/src/utils/invoiceRenderedPrintCheck.js");
 const table=(id,labels,headerPresent=true)=>({id,type:"items_table",headerPresent,headerVisible:headerPresent,headerLabels:labels,rows:[],bounds:{left:10,top:100,right:780,bottom:900},contentHeight:0,clientHeight:0,contentWidth:770,clientWidth:770,images:[]});
 const mismatch=analyzeRenderedInvoiceMetrics({pages:[
  {pageNumber:1,width:794,height:1123,blocks:[table("items-1",["#","Description","Qty"])]},
  {pageNumber:2,width:794,height:1123,blocks:[table("items-2",["#","Description","Rate"])]}
 ]});
 assert.ok(mismatch.warnings.some(issue=>issue.title==="Continuation-page headings do not match"&&issue.blockId==="items-2"));
 const missing=analyzeRenderedInvoiceMetrics({pages:[
  {pageNumber:1,width:794,height:1123,blocks:[table("items-1",["#","Description"])]},
  {pageNumber:2,width:794,height:1123,blocks:[table("items-2",[],false)]}
 ]});
 assert.ok(missing.warnings.some(issue=>issue.title==="Item table heading is missing"&&issue.blockId==="items-2"));
});

test("safe invoice layout checks repair invalid bounds and normalize item-table columns",async()=>{
 const {analyzeInvoiceLayout,applySafeInvoiceLayoutFixes}=await import("../../frontend/src/utils/invoiceLayoutQuality.js");
 const blocks=[
  {id:"out",type:"text",label:"Notes",x:-4,y:5,w:110,h:5},
  {id:"table",type:"items_table",x:5,y:40,w:90,h:30,columns:[
   {key:"description",width:70,visible:true},{key:"amount",width:40,visible:true},{key:"hidden",width:20,visible:false}
  ]}
 ];
 const warnings=analyzeInvoiceLayout(blocks);
 assert.ok(warnings.some(issue=>issue.title==="Element outside page"));
 assert.ok(warnings.some(issue=>issue.title==="Item table columns exceed 100%"));
 const fixed=applySafeInvoiceLayoutFixes(blocks);
 assert.equal(fixed.changed,true);
 assert.equal(fixed.blocks[0].x,0);
 assert.equal(fixed.blocks[0].w,100);
 const visible=fixed.blocks[1].columns.filter(column=>column.visible!==false);
 assert.ok(Math.abs(visible.reduce((sum,column)=>sum+column.width,0)-100)<0.01);
 assert.equal(fixed.blocks[1].columns[2].visible,false);
});


test("actual print audit detects clipped blank tables and includes safe text-size fixes",async()=>{
 const {analyzeRenderedInvoiceMetrics}=await import("../../frontend/src/utils/invoiceRenderedPrintCheck.js");
 const result=analyzeRenderedInvoiceMetrics({pages:[{pageNumber:1,width:794,height:1123,blocks:[
  {id:"blank-table",type:"blank_table",bounds:{left:10,top:100,right:500,bottom:300},contentHeight:240,clientHeight:200,contentWidth:520,clientWidth:490,blankTableMetrics:{wrapper:{scrollWidth:520,clientWidth:490,scrollHeight:240,clientHeight:200},table:{scrollWidth:520,clientWidth:490,scrollHeight:240,clientHeight:200}},rows:[],images:[]}
 ]}]});
 const warning=result.warnings.find(issue=>issue.title==="Blank table content may be clipped");
 assert.ok(warning);
 assert.equal(warning.blockId,"blank-table");
 assert.equal(warning.blockType,"blank_table");
});

test("browser invoice measurement captures blank-table wrapper and nested table overflow",async()=>{
 const {measureRenderedInvoiceDocument}=await import("../../frontend/src/utils/invoiceRenderedPrintCheck.js");
 const rect=(left,top,right,bottom)=>({left,top,right,bottom,width:right-left,height:bottom-top});
 const nestedTable={scrollWidth:500,clientWidth:400,scrollHeight:300,clientHeight:200};
 const blankWrapper={scrollWidth:500,clientWidth:400,scrollHeight:300,clientHeight:200,querySelector:selector=>selector==="table"?nestedTable:null};
 const block={getBoundingClientRect:()=>rect(10,100,400,300),getAttribute:key=>({"data-block-id":"blank","data-block-type":"blank_table"}[key]||null),querySelector:selector=>selector===".design-blank-table"?blankWrapper:null,querySelectorAll:selector=>selector==="img"?[]:[],scrollHeight:300,clientHeight:200,scrollWidth:500,clientWidth:400};
 const sheet={getBoundingClientRect:()=>rect(0,0,800,1100),querySelectorAll:selector=>selector===".design-block"?[block]:[],clientWidth:800,clientHeight:1100};
 const measured=measureRenderedInvoiceDocument({querySelectorAll:selector=>selector===".design-sheet"?[sheet]:[]});
 assert.equal(measured.pages[0].blocks[0].blankTableMetrics.wrapper.scrollHeight,300);
 assert.equal(measured.pages[0].blocks[0].blankTableMetrics.table.scrollWidth,500);
});

test("one-click text-fit reduction changes only the target and never below six points",async()=>{
 const {reduceInvoiceBlockFontSize}=await import("../../frontend/src/utils/invoiceLayoutQuality.js");
 const blocks=[{id:"notes",fontSize:10,text:"Keep content"},{id:"small",fontSize:6},{id:"other",fontSize:12}];
 const reduced=reduceInvoiceBlockFontSize(blocks,"notes",1);
 assert.equal(reduced.changed,true);
 assert.equal(reduced.blocks[0].fontSize,9);
 assert.equal(reduced.blocks[1],blocks[1]);
 assert.equal(reduced.blocks[2],blocks[2]);
 const min=reduceInvoiceBlockFontSize([{id:"notes",fontSize:6}],"notes",1);
 assert.equal(min.changed,false);
 assert.equal(min.blocks[0].fontSize,6);
});


test("actual print audit tags item rows extending beyond paper for safe text sizing",async()=>{
 const {analyzeRenderedInvoiceMetrics}=await import("../../frontend/src/utils/invoiceRenderedPrintCheck.js");
 const result=analyzeRenderedInvoiceMetrics({pages:[{pageNumber:1,width:794,height:800,blocks:[
  {id:"items",type:"items_table",bounds:{left:10,top:100,right:780,bottom:750},contentHeight:650,clientHeight:650,contentWidth:770,clientWidth:770,headerVisible:true,rows:[{itemNumber:1,label:"Oversized row",bottom:810}],images:[]}
 ]}]});
 const warning=result.warnings.find(issue=>issue.title==="An item row extends beyond the page");
 assert.ok(warning);
 assert.equal(warning.blockType,"items_table");
 assert.equal(warning.itemNumber,1);
});

 
test("margin estimator recommends printer-safe margins and warns about a reduced A5 printable area",async()=>{
 const {getInvoiceMarginWarnings}=await import("../../frontend/src/utils/invoicePrintFit.js");
 const unsafe=getInvoiceMarginWarnings("A4","portrait",{top:0,right:2,bottom:0,left:3});
 const edge=unsafe.find(issue=>issue.id==="printer-safe-margin");
 assert.ok(edge);
 assert.deepEqual(edge.recommendedMargins,{top:4,right:4,bottom:4,left:4});
 const safe=getInvoiceMarginWarnings("A4","portrait",{top:4,right:4,bottom:4,left:4});
 assert.ok(!safe.some(issue=>issue.id==="printer-safe-margin"));
 const narrow=getInvoiceMarginWarnings("A5","portrait",{top:25,right:25,bottom:25,left:25});
 assert.ok(narrow.some(issue=>issue.id==="large-print-margins"));
});

test("actual preview audit detects elements crossing configured printer-safe margins",async()=>{
 const {analyzeRenderedInvoiceMetrics}=await import("../../frontend/src/utils/invoiceRenderedPrintCheck.js");
 const result=analyzeRenderedInvoiceMetrics({pages:[{pageNumber:1,width:794,height:1123,blocks:[
  {id:"notes",type:"text",bounds:{left:5,top:5,right:789,bottom:1118},contentHeight:0,clientHeight:0,contentWidth:0,clientWidth:0,rows:[],images:[]}
 ]}]},{pageSize:"A4",orientation:"portrait",printMargins:{top:4,right:4,bottom:4,left:4}});
 const warning=result.warnings.find(issue=>issue.title==="Element overlaps the printer-safe margin");
 assert.ok(warning);
 assert.equal(warning.blockId,"notes");
 assert.deepEqual(warning.edges,["left","top","right","bottom"]);
});

test("actual preview audit accepts blocks inside configured margin area and flags item rows entering it",async()=>{
 const {analyzeRenderedInvoiceMetrics}=await import("../../frontend/src/utils/invoiceRenderedPrintCheck.js");
 const safe=analyzeRenderedInvoiceMetrics({pages:[{pageNumber:1,width:794,height:1123,blocks:[
  {id:"notes",type:"text",bounds:{left:16,top:16,right:778,bottom:1107},contentHeight:0,clientHeight:0,contentWidth:0,clientWidth:0,rows:[],images:[]}
 ]}]},{pageSize:"A4",orientation:"portrait",printMargins:{top:4,right:4,bottom:4,left:4}});
 assert.ok(!safe.warnings.some(issue=>issue.title==="Element overlaps the printer-safe margin"));
 const table=analyzeRenderedInvoiceMetrics({pages:[{pageNumber:1,width:794,height:1123,blocks:[
  {id:"items",type:"items_table",bounds:{left:16,top:16,right:778,bottom:1107},contentHeight:0,clientHeight:0,contentWidth:0,clientWidth:0,headerVisible:true,rows:[{itemNumber:5,label:"Long row",top:100,bottom:1115}],images:[]}
 ]}]},{pageSize:"A4",orientation:"portrait",printMargins:{top:4,right:4,bottom:4,left:4}});
 assert.ok(table.warnings.some(issue=>issue.title==="An item row enters the printer-safe margin"&&issue.itemNumber===5));
});


test("actual print audit detects an item row taller than the usable page and ignores normal rows",async()=>{
 const {analyzeRenderedInvoiceMetrics}=await import("../../frontend/src/utils/invoiceRenderedPrintCheck.js");
 const result=analyzeRenderedInvoiceMetrics({pages:[{pageNumber:1,width:794,height:1123,blocks:[
  {id:"items",type:"items_table",bounds:{left:10,top:100,right:780,bottom:900},contentHeight:800,clientHeight:800,contentWidth:770,clientWidth:770,headerVisible:true,rows:[{itemNumber:1,label:"Normal",top:110,bottom:160,height:50},{itemNumber:2,label:"Very long description",top:170,bottom:1220,height:1120}],images:[]}
 ]}]},{pageSize:"A4",orientation:"portrait",printMargins:{top:4,bottom:4,left:4,right:4}});
 const warning=result.warnings.find(issue=>issue.id==="oversized-item-row-1-items-2");
 assert.ok(warning);
 assert.equal(warning.severity,"error");
 assert.equal(warning.itemNumber,2);
 assert.ok(warning.usablePageHeight>0);
 assert.ok(!result.warnings.some(issue=>issue.id==="oversized-item-row-1-items-1"));
});


test("browser invoice measurement captures repeating headers, keep-together rows and cell overflow",async()=>{
 const {measureRenderedInvoiceDocument,analyzeRenderedInvoiceMetrics}=await import("../../frontend/src/utils/invoiceRenderedPrintCheck.js");
 const rect=(left,top,right,bottom)=>({left,top,right,bottom,width:right-left,height:bottom-top});
 const cell={scrollWidth:180,clientWidth:120,scrollHeight:24,clientHeight:24};
 const row={
  getBoundingClientRect:()=>rect(20,220,780,250),
  getAttribute:key=>({"data-item-number":"4","data-item-label":"Long fabric description"}[key]||null),
  querySelectorAll:()=>[cell]
 };
 const header={getBoundingClientRect:()=>rect(20,200,780,220),querySelectorAll:()=>[{textContent:"Description"}]};
 const table={querySelector:selector=>selector==="thead"?header:null,querySelectorAll:selector=>selector==="tbody tr"?[row]:[]};
 const block={getBoundingClientRect:()=>rect(20,200,780,500),getAttribute:key=>({"data-block-id":"items","data-block-type":"items_table"}[key]||null),querySelector:selector=>selector===".design-items"?table:null,querySelectorAll:()=>[],scrollHeight:300,clientHeight:300,scrollWidth:760,clientWidth:760};
 const sheet={getBoundingClientRect:()=>rect(0,0,800,1100),querySelectorAll:selector=>selector===".design-block"?[block]:[],clientWidth:800,clientHeight:1100};
 const styles=new Map([[header,{display:"table-header-group"}],[row,{breakInside:"avoid",pageBreakInside:"avoid"}]]);
 const documentRef={defaultView:{getComputedStyle:element=>styles.get(element)||{}},querySelectorAll:selector=>selector===".design-sheet"?[sheet]:[]};
 const measured=measureRenderedInvoiceDocument(documentRef);
 const itemTable=measured.pages[0].blocks[0];
 assert.equal(itemTable.tablePresent,true);
 assert.equal(itemTable.headerDisplay,"table-header-group");
 assert.equal(itemTable.rows[0].breakInside,"avoid");
 assert.deepEqual(itemTable.rows[0].cellOverflowAxes,["width"]);
 const audit=analyzeRenderedInvoiceMetrics(measured);
 assert.ok(audit.warnings.some(issue=>issue.id==="item-cell-overflow-1-items-4"));
 assert.ok(!audit.warnings.some(issue=>issue.id==="item-row-break-1-items-4"));
});

test("actual print audit warns when continuation headings or rows are not protected from page splitting",async()=>{
 const {analyzeRenderedInvoiceMetrics}=await import("../../frontend/src/utils/invoiceRenderedPrintCheck.js");
 const result=analyzeRenderedInvoiceMetrics({pages:[{pageNumber:1,width:794,height:1123,blocks:[
  {id:"items",type:"items_table",tablePresent:true,headerPresent:true,headerVisible:true,headerDisplay:"table-row-group",bounds:{left:10,top:100,right:780,bottom:900},contentHeight:800,clientHeight:800,contentWidth:770,clientWidth:770,rows:[{itemNumber:2,label:"Fabric",top:120,bottom:180,left:10,right:780,breakInside:"auto",pageBreakInside:"auto"}],images:[]}
 ]}]});
 assert.ok(result.warnings.some(issue=>issue.id==="table-header-repeat-1-items"));
 assert.ok(result.warnings.some(issue=>issue.id==="item-row-break-1-items-2"));
});

test("unmeasured item rows are reported without false page-boundary or overlap errors",async()=>{
 const {analyzeRenderedInvoiceMetrics}=await import("../../frontend/src/utils/invoiceRenderedPrintCheck.js");
 const result=analyzeRenderedInvoiceMetrics({pages:[{pageNumber:1,width:794,height:1123,blocks:[
  {id:"items",type:"items_table",bounds:{left:10,top:100,right:780,bottom:900},contentHeight:800,clientHeight:800,contentWidth:770,clientWidth:770,headerVisible:true,rows:[{itemNumber:1,label:"Pending",geometryAvailable:false,height:null,cellOverflowAxes:["height"],breakInside:"avoid"}],images:[]}
 ]}]});
 assert.ok(result.warnings.some(issue=>issue.id==="item-row-unmeasured-1-items-1"));
 assert.ok(result.warnings.some(issue=>issue.id==="item-cell-overflow-1-items-1"));
 assert.ok(!result.warnings.some(issue=>issue.id==="row-page-overflow-1-items-1"));
 assert.ok(!result.warnings.some(issue=>issue.id==="item-row-width-1-items-1"));
});

test("print margin checks flag unsupported paper sizes and orientations instead of silently assuming A4 portrait",async()=>{
 const {getInvoiceMarginWarnings}=await import("../../frontend/src/utils/invoicePrintFit.js");
 const warnings=getInvoiceMarginWarnings("A3","sideways",{top:4,right:4,bottom:4,left:4});
 assert.ok(warnings.some(issue=>issue.id==="unsupported-paper-size"));
 assert.ok(warnings.some(issue=>issue.id==="unsupported-page-orientation"));
});
