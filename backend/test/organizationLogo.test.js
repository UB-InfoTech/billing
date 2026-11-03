const test=require("node:test");
const assert=require("node:assert/strict");
const {
  getOwnedOrganizationLogoFilename,
  getPublicOrganizationLogoUrl,
  hasSupportedOrganizationLogoSignature
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

test("checks uploaded image content instead of trusting the browser MIME type",()=>{
  assert.equal(
    hasSupportedOrganizationLogoSignature(Buffer.from([0xff,0xd8,0xff,0x00]),".jpg"),
    true
  );
  assert.equal(
    hasSupportedOrganizationLogoSignature(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),".png"),
    true
  );
  assert.equal(
    hasSupportedOrganizationLogoSignature(Buffer.from("RIFF0000WEBP"),".webp"),
    true
  );
  assert.equal(
    hasSupportedOrganizationLogoSignature(Buffer.from("not really an image"),".png"),
    false
  );
  assert.equal(
    hasSupportedOrganizationLogoSignature(Buffer.from([0xff,0xd8,0xff]),".png"),
    false
  );
});
