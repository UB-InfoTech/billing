const LOGO_PATH_PREFIX="/uploads/organization-logos/";
const LOGO_FILENAME_PATTERN=/^([a-f0-9]{24})-([a-f0-9]{24})\\.(?:jpg|png|webp)$/i;

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

function getPublicOrganizationLogoUrl(value,ownerId){
  const filename=getOwnedOrganizationLogoFilename(value,ownerId);
  return filename?LOGO_PATH_PREFIX+filename:"";
}

module.exports={
  getOwnedOrganizationLogoFilename,
  getPublicOrganizationLogoUrl
};
