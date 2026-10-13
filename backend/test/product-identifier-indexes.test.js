const test=require("node:test");
const assert=require("node:assert/strict");
const Product=require("../models/Product");

test("product codes are unique per business rather than globally",()=>{
  const indexes=Product.schema.indexes();
  const globalUnique=indexes.some(([keys,options])=>
    Object.keys(keys).length===1&&keys.productCode===1&&options?.unique===true
  );
  assert.equal(globalUnique,false);

  const workspaceUnique=indexes.some(([keys,options])=>
    keys.createdBy===1&&keys.productCode===1&&options?.unique===true
  );
  assert.equal(workspaceUnique,true);
});

test("serial numbers are unique per business and ignore missing values",()=>{
  const indexes=Product.schema.indexes();
  const globalUnique=indexes.some(([keys,options])=>
    Object.keys(keys).length===1&&keys.serialNumber===1&&options?.unique===true
  );
  assert.equal(globalUnique,false);

  const workspaceUnique=indexes.some(([keys,options])=>
    keys.createdBy===1&&keys.serialNumber===1&&options?.unique===true
    &&options.partialFilterExpression?.serialNumber?.$type==="string"
  );
  assert.equal(workspaceUnique,true);
});

test("non-empty barcodes are unique per business with orphaned records excluded",()=>{
  const indexes=Product.schema.indexes();
  const globalUnique=indexes.some(([keys,options])=>
    Object.keys(keys).length===1&&keys.barcode===1&&options?.unique===true
  );
  assert.equal(globalUnique,false);

  const workspaceUnique=indexes.some(([keys,options])=>
    keys.createdBy===1&&keys.barcode===1&&options?.unique===true
    &&options.partialFilterExpression?.createdBy?.$type==="objectId"
    &&options.partialFilterExpression?.barcode?.$type==="string"
    &&options.partialFilterExpression?.barcode?.$gt===""
  );
  assert.equal(workspaceUnique,true);
});
