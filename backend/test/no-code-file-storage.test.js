const test=require("node:test");
const assert=require("node:assert/strict");
const path=require("node:path");
const {
  NO_CODE_FILE_DIR,getNoCodeFileType,isAllowedNoCodeFileType,hasNoCodeFileSignature,
  createNoCodeFileFilename,getOwnedNoCodeFilePath,sanitizeNoCodeOriginalName
}=require("../utils/noCodeFileStorage");
const owner="aaaaaaaaaaaaaaaaaaaaaaaa";
test("no-code file types are intentionally limited to supported images and PDF",()=>{
  assert.equal(getNoCodeFileType("image/jpeg").extension,".jpg");
  assert.equal(getNoCodeFileType("image/png").extension,".png");
  assert.equal(getNoCodeFileType("application/pdf").extension,".pdf");
  assert.equal(isAllowedNoCodeFileType("image","image/webp"),true);
  assert.equal(isAllowedNoCodeFileType("image","application/pdf"),false);
  assert.equal(isAllowedNoCodeFileType("file","application/pdf"),true);
  assert.equal(isAllowedNoCodeFileType("file","text/html"),false);
});
test("file signatures must match the claimed image or PDF MIME type",()=>{
  assert.equal(hasNoCodeFileSignature(Buffer.from([0xff,0xd8,0xff,0x00]),"image/jpeg"),true);
  assert.equal(hasNoCodeFileSignature(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),"image/png"),true);
  assert.equal(hasNoCodeFileSignature(Buffer.from("GIF89a"),"image/gif"),true);
  assert.equal(hasNoCodeFileSignature(Buffer.from("RIFFxxxxWEBP"),"image/webp"),true);
  assert.equal(hasNoCodeFileSignature(Buffer.from("%PDF-1.7"),"application/pdf"),true);
  assert.equal(hasNoCodeFileSignature(Buffer.from("<html>"),"image/png"),false);
  assert.equal(hasNoCodeFileSignature(Buffer.from("not a pdf"),"application/pdf"),false);
});
test("stored file names are random, owner-scoped and cannot escape the private directory",()=>{
  const filename=createNoCodeFileFilename(owner,"image/jpeg");
  assert.match(filename,new RegExp("^"+owner+"-[a-f0-9]{32}\\.jpg$"));
  assert.equal(getOwnedNoCodeFilePath(filename,owner),path.join(NO_CODE_FILE_DIR,filename));
  assert.equal(getOwnedNoCodeFilePath(filename,"bbbbbbbbbbbbbbbbbbbbbbbb"),"");
  assert.equal(getOwnedNoCodeFilePath("../"+filename,owner),"");
  assert.throws(()=>createNoCodeFileFilename("not-an-id","image/jpeg"));
  assert.throws(()=>createNoCodeFileFilename(owner,"text/html"));
});
test("uploaded file display names are reduced to safe base names",()=>{
  assert.equal(sanitizeNoCodeOriginalName("../../invoice.pdf"),"invoice.pdf");
  assert.equal(sanitizeNoCodeOriginalName("folder\\image.png"),"image.png");
  assert.equal(sanitizeNoCodeOriginalName("bad\u0000name.html"),"badname.html");
  assert.equal(sanitizeNoCodeOriginalName(""),"uploaded-file");
});
