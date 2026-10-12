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

test("supports plain objects returned by lean database queries", () => {
  const result = toPublicProfile({
    _id: "profile-id",
    createdBy: "owner-id",
    eWayPassword: "secret"
  });

  assert.equal(result._id, "profile-id");
  assert.equal(result.createdBy, "owner-id");
  assert.equal(result.hasEWayPassword, true);
  assert.equal("secret" in result, false);
});
