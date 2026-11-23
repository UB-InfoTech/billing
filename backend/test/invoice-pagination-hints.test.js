const test=require("node:test");
const assert=require("node:assert/strict");
const {analyzeInvoicePagination}=require("../../frontend/src/utils/invoicePaginationHints.js");
const page=(n,rows)=>({pageNumber:n,blocks:[{type:"items_table",rows}]});
test("pagination hint flags a single isolated item row between populated pages",()=>{
 const result=analyzeInvoicePagination([page(1,[{itemNumber:1}]),page(2,[{itemNumber:2}]),page(3,[{itemNumber:3},{itemNumber:4}])]);
 assert.equal(result.length,1);
 assert.equal(result[0].pageNumber,2);
 assert.equal(result[0].itemNumber,2);
 assert.equal(result[0].fixable,false);
});
test("pagination hints do not flag legitimate single-row final page or empty tables",()=>{
 assert.deepEqual(analyzeInvoicePagination([page(1,[{itemNumber:1},{itemNumber:2}]),page(2,[{itemNumber:3}])]),[]);
 assert.deepEqual(analyzeInvoicePagination([page(1,[{itemNumber:1}]),page(2,[])]),[]);
});
test("pagination hints tolerate missing and malformed page data",()=>{
 assert.deepEqual(analyzeInvoicePagination(null),[]);
 assert.deepEqual(analyzeInvoicePagination([{}, {blocks:"invalid"}]),[]);
});
