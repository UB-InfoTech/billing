const test=require("node:test");
const assert=require("node:assert/strict");
const {buildNoCodeFileReferenceQuery}=require("../scripts/cleanup-no-code-files");
const owner="aaaaaaaaaaaaaaaaaaaaaaaa";
const id="bbbbbbbbbbbbbbbbbbbbbbbb";
test("cleanup maps regular form uploads to owner-scoped custom field paths",()=>{
  const file={_id:id,createdBy:owner,fieldKey:"invoiceAttachment",formKey:"clients.form"};
  const result=buildNoCodeFileReferenceQuery(file);
  assert.equal(result.model.modelName,"Client");
  assert.deepEqual(result.query,{createdBy:owner,"customFields.invoiceAttachment":id});
});
test("cleanup maps order item uploads to the nested item field path",()=>{
  const file={_id:id,createdBy:owner,fieldKey:"designImage",formKey:"orders.items"};
  const result=buildNoCodeFileReferenceQuery(file);
  assert.equal(result.model.modelName,"Order2");
  assert.deepEqual(result.query,{createdBy:owner,subOrders:{$elemMatch:{"customFields.designImage":id}}});
});
test("cleanup leaves unknown forms and incomplete file metadata untouched",()=>{
  assert.equal(buildNoCodeFileReferenceQuery({_id:id,createdBy:owner,fieldKey:"x",formKey:"unmapped"}),null);
  assert.equal(buildNoCodeFileReferenceQuery({_id:id,createdBy:owner,formKey:"clients.form"}),null);
});
