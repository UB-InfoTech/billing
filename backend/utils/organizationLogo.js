const LOGO_PATH_PREFIX="/uploads/organization-logos/";
const LOGO_FILENAME_PATTERN=/^([a-f0-9]{24})-([a-f0-9]{24})\.(?:jpg|png|webp)$/i;

function getOwnedOrganizationLogoFilename(value,ownerId){
  const raw=String(value??"").trim();
  const owner=String(ownerId??"").trim();
  if(!/^[a-f0-9]{24}$/i.test(owner)||!raw.startsWith(LOGO_PATH_PREFIX))return "";
  const filename=raw.slice(LOGO_PATH_PREFIX.length);
  if(filename.includes("/")||filename.includes("\\"))return "";
  const match=filename.match(LOGO_FILENAME_PATTERN);
  if(!match||match[1].toLowerCase()!==owner.toLowerCase())return "";
  return filename;
}

function hasSupportedOrganizationLogoSignature(buffer,extension){
  if(!Buffer.isBuffer(buffer))return false;
  const ext=String(extension||"").toLowerCase();
  if(ext===".jpg"){
    return buffer.length>=3&&buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff;
  }
  if(ext===".png"){
    return buffer.length>=8
      &&buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  }
  if(ext===".webp"){
    return buffer.length>=12
      &&buffer.toString("ascii",0,4)==="RIFF"
      &&buffer.toString("ascii",8,12)==="WEBP";
  }
  return false;
}

function getPublicOrganizationLogoUrl(value,ownerId){
  const filename=getOwnedOrganizationLogoFilename(value,ownerId);
  return filename?LOGO_PATH_PREFIX+filename:"";
}

module.exports={
  getOwnedOrganizationLogoFilename,
  getPublicOrganizationLogoUrl,
  hasSupportedOrganizationLogoSignature
};
