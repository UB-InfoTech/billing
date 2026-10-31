const test = require("node:test");
const assert = require("node:assert/strict");
const { toPublicProfile } = require("../utils/publicProfile");

test("never returns an E-Way Bill password to the browser", () => {
  const source = {
    companyName: "Example Company",
    eWayUserName: "account-name",
    eWayPassword: "top-secret-password"
  };

  const result = toPublicProfile(source);
  assert.equal(result.companyName, "Example Company");
  assert.equal(result.eWayUserName, "account-name");
  assert.equal(result.eWayPassword, "");
  assert.equal(result.hasEWayPassword, true);
  assert.equal(JSON.stringify(result).includes("top-secret-password"), false);
  assert.equal(source.eWayPassword, "top-secret-password");
});

test("reports when a password is not configured without exposing one", () => {
  const result = toPublicProfile({
    companyName: "New Company",
    eWayPassword: ""
  });

  assert.equal(result.hasEWayPassword, false);
  assert.equal(result.eWayPassword, "");
});

test("returns organization profile details while preserving existing public profile behavior", () => {
  const result = toPublicProfile({
    companyName: "Trade Name",
    legalName: "Registered Legal Name",
    organizationType: "Private Limited Company",
    emailAddress: "accounts@example.com",
    website: "https://example.com",
    city: "Vadodara",
    state: "Gujarat",
    eWayPassword: "must-not-leak"
  });

  assert.equal(result.companyName, "Trade Name");
  assert.equal(result.legalName, "Registered Legal Name");
  assert.equal(result.organizationType, "Private Limited Company");
  assert.equal(result.emailAddress, "accounts@example.com");
  assert.equal(result.website, "https://example.com");
  assert.equal(result.city, "Vadodara");
  assert.equal(result.state, "Gujarat");
  assert.equal(result.eWayPassword, "");
  assert.equal(result.hasEWayPassword, true);
  assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
});

test("supports plain objects returned by lean database queries", () => {
  const result = toPublicProfile({
    _id: "profile-id",
    createdBy: "owner-id",
    eWayPassword: "secret"
  });

  assert.equal(result._id, "profile-id");
  assert.equal(result.createdBy, "owner-id");
  assert.equal(result.hasEWayPassword, true);
  assert.equal(result.eWayPassword, "");
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("serializes custom profile fields stored in a Mongoose-style map",()=>{
  const result=toPublicProfile({
    companyName:"Configured company",
    customFields:new Map([["annualValue",750],["gstRegistered",true]]),
    eWayPassword:"hidden-secret"
  });

  assert.deepEqual(result.customFields,{annualValue:750,gstRegistered:true});
  assert.equal(result.eWayPassword,"");
  assert.equal(result.hasEWayPassword,true);
  assert.equal(JSON.stringify(result).includes("hidden-secret"),false);
});
