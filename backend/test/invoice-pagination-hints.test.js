const test=require("node:test");
const assert=require("node:assert/strict");
const {analyzeInvoicePagination}=require("../../frontend/src/utils/invoicePaginationHints.js");
const page=(n,rows,extraBlocks=[])=>({pageNumber:n,blocks:[{id:"items-"+n,type:"items_table",rows},...extraBlocks]});

test("pagination hint flags a single isolated item row only between populated item pages",()=>{
 const result=analyzeInvoicePagination([page(1,[{itemNumber:1}]),page(2,[{itemNumber:2}]),page(3,[{itemNumber:3},{itemNumber:4}])]);
 assert.equal(result.length,1);
 assert.equal(result[0].pageNumber,2);
 assert.equal(result[0].itemNumber,2);
 assert.equal(result[0].fixable,false);
});

test("pagination hints do not flag a legitimate single-row first or final page",()=>{
 assert.deepEqual(analyzeInvoicePagination([page(1,[{itemNumber:1}]),page(2,[{itemNumber:2},{itemNumber:3}])]),[]);
 assert.deepEqual(analyzeInvoicePagination([page(1,[{itemNumber:1},{itemNumber:2}]),page(2,[{itemNumber:3}])]),[]);
 assert.deepEqual(analyzeInvoicePagination([page(1,[{itemNumber:1}]),page(2,[])]),[]);
});

test("pagination hints tolerate missing and malformed page data",()=>{
 assert.deepEqual(analyzeInvoicePagination(null),[]);
 assert.deepEqual(analyzeInvoicePagination([{}, {blocks:"invalid"}]),[]);
});

test("totals section before the final item page receives a placement warning",()=>{
 const result=analyzeInvoicePagination([
  page(1,[{itemNumber:1}], [{id:"totals-1",type:"totals"}]),
  page(2,[{itemNumber:2},{itemNumber:3}])
 ]);
 const warning=result.find(issue=>issue.id==="totals-before-final-items-1-totals");
 assert.ok(warning);
 assert.equal(warning.pageNumber,1);
 assert.equal(warning.blockId,"totals-1");
 assert.equal(warning.fixable,false);
});

test("totals on the final item page are not warned",()=>{
 const result=analyzeInvoicePagination([
  page(1,[{itemNumber:1}]),
  page(2,[{itemNumber:2}], [{id:"totals-2",type:"totals"}])
 ]);
 assert.deepEqual(result,[]);
});

test("totals overlapping the last item row are reported without changing layout",()=>{
 const result=analyzeInvoicePagination([
  {pageNumber:1,blocks:[
   {id:"items",type:"items_table",rows:[{itemNumber:1,bottom:320}]},
   {id:"totals",type:"totals",bounds:{top:300}}
  ]}
 ]);
 const warning=result.find(issue=>issue.id==="totals-overlap-items-1-totals");
 assert.ok(warning);
 assert.equal(warning.severity,"error");
 assert.equal(warning.fixable,false);
});
