const path=require("path");
const crypto=require("crypto");
const NO_CODE_FILE_DIR=path.join(__dirname,"../private_uploads/no-code");
const FILE_TYPES=Object.freeze({
  "image/jpeg":{extension:".jpg",image:true},
  "image/png":{extension:".png",image:true},
  "image/gif":{extension:".gif",image:true},
  "image/webp":{extension:".webp",image:true},
  "application/pdf":{extension:".pdf",image:false}
});
const FILE_NAME_PATTERN=/^([a-f0-9]{24})-([a-f0-9]{32})\.(jpg|png|gif|webp|pdf)$/i;
function getNoCodeFileType(mimeType){return FILE_TYPES[String(mimeType||"").toLowerCase()]||null;}
function isAllowedNoCodeFileType(fieldType,mimeType){
  const type=getNoCodeFileType(mimeType);
  if(!type)return false;
  if(fieldType==="image")return type.image;
  return fieldType==="file";
}
function hasNoCodeFileSignature(buffer,mimeType){
  if(!Buffer.isBuffer(buffer))return false;
  const type=String(mimeType||"").toLowerCase();
  if(type==="image/jpeg")return buffer.length>=3&&buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff;
  if(type==="image/png")return buffer.length>=8&&buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if(type==="image/gif")return buffer.length>=6&&["GIF87a","GIF89a"].includes(buffer.toString("ascii",0,6));
  if(type==="image/webp")return buffer.length>=12&&buffer.toString("ascii",0,4)==="RIFF"&&buffer.toString("ascii",8,12)==="WEBP";
  if(type==="application/pdf")return buffer.length>=5&&buffer.toString("ascii",0,5)==="%PDF-";
  return false;
}
function createNoCodeFileFilename(ownerId,mimeType){
  const owner=String(ownerId||"").trim();
  const type=getNoCodeFileType(mimeType);
  if(!/^[a-f0-9]{24}$/i.test(owner)||!type)throw new Error("The upload account or file type could not be verified.");
  return owner+"-"+crypto.randomBytes(16).toString("hex")+type.extension;
}
function getOwnedNoCodeFilePath(filename,ownerId){
  const name=String(filename||"").trim();
  const owner=String(ownerId||"").trim();
  const match=name.match(FILE_NAME_PATTERN);
  if(!match||!(/^[a-f0-9]{24}$/i).test(owner)||match[1].toLowerCase()!==owner.toLowerCase())return "";
  if(path.basename(name)!==name)return "";
  return path.join(NO_CODE_FILE_DIR,name);
}
function sanitizeNoCodeOriginalName(value){
  const name=path.basename(String(value||"").replace(/\\/g,"/"))
    .replace(/[\x00-\x1f\x7f]/g,"")
    .replace(/[<>:"|?*]/g,"_")
    .trim()
    .slice(0,180);
  return name||"uploaded-file";
}
module.exports={NO_CODE_FILE_DIR,FILE_NAME_PATTERN,getNoCodeFileType,isAllowedNoCodeFileType,hasNoCodeFileSignature,createNoCodeFileFilename,getOwnedNoCodeFilePath,sanitizeNoCodeOriginalName};
