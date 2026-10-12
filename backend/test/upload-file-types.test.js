const test=require("node:test");
const assert=require("node:assert/strict");
const {getSafeUploadExtension,isAllowedUploadType}=require("../utils/uploadFileTypes");

test("only allow known image and PDF MIME types",()=>{
  assert.equal(isAllowedUploadType("image/jpeg"),true);
  assert.equal(isAllowedUploadType("image/png"),true);
  assert.equal(isAllowedUploadType("image/webp"),true);
  assert.equal(isAllowedUploadType("image/gif"),true);
  assert.equal(isAllowedUploadType("application/pdf",true),true);
  assert.equal(isAllowedUploadType("application/pdf",false),false);
  assert.equal(isAllowedUploadType("text/html",true),false);
  assert.equal(isAllowedUploadType("application/javascript",true),false);
});

test("stored file extensions come from validated MIME type, not the supplied filename",()=>{
  assert.equal(getSafeUploadExtension("image/jpeg"),".jpg");
  assert.equal(getSafeUploadExtension("image/png"),".png");
  assert.equal(getSafeUploadExtension("application/pdf"),".pdf");
  assert.equal(getSafeUploadExtension("text/html"),null);
});
