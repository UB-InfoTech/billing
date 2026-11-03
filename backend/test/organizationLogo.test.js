const test=require("node:test");
const assert=require("node:assert/strict");
const {
  getOwnedOrganizationLogoFilename,
  getPublicOrganizationLogoUrl
}=require("../utils/organizationLogo");

const owner="0123456789abcdef01234567";
const otherOwner="1123456789abcdef01234567";
const filename=owner+"-abcdef012345abcdef012345.png";
const logoUrl="/uploads/organization-logos/"+filename;

test("accepts an organization logo only for its owning account",()=>{
  assert.equal(getOwnedOrganizationLogoFilename(logoUrl,owner),filename);
  assert.equal(getPublicOrganizationLogoUrl(logoUrl,owner),logoUrl);
});

test("does not expose another account's organization logo",()=>{
  assert.equal(getOwnedOrganizationLogoFilename(logoUrl,otherOwner),"");
  assert.equal(getPublicOrganizationLogoUrl(logoUrl,otherOwner),"");
});

test("rejects absolute URLs, traversal, unsupported files and malformed owners",()=>{
  assert.equal(getPublicOrganizationLogoUrl("https://example.com"+logoUrl,owner),"");
  assert.equal(getPublicOrganizationLogoUrl("/uploads/organization-logos/../"+filename,owner),"");
  assert.equal(getPublicOrganizationLogoUrl(logoUrl.replace(".png",".pdf"),owner),"");
  assert.equal(getPublicOrganizationLogoUrl(logoUrl,"not-an-account-id"),"");
});
