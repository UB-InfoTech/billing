const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEVELOPMENT_ORIGINS,
  getCorsPolicy,
  isCorsOriginAllowed
} = require("../utils/corsPolicy");

test("development defaults are limited to local Vite origins", () => {
  const policy = getCorsPolicy({
    nodeEnv: "development",
    frontendUrls: "",
    frontendUrl: ""
  });

  assert.deepEqual(policy.allowedOrigins, DEVELOPMENT_ORIGINS);
  assert.equal(policy.configurationError, "");
});

test("configured frontend origins are split, trimmed and deduplicated", () => {
  const policy = getCorsPolicy({
    nodeEnv: "production",
    frontendUrls: " https://billing.example.com,https://billing.example.com, https://admin.example.com "
  });

  assert.deepEqual(policy.allowedOrigins, [
    "https://billing.example.com",
    "https://admin.example.com"
  ]);
  assert.equal(policy.configurationError, "");
});

test("production requires explicit frontend origins", () => {
  const policy = getCorsPolicy({
    nodeEnv: "production",
    frontendUrls: "",
    frontendUrl: ""
  });

  assert.deepEqual(policy.allowedOrigins, []);
  assert.match(policy.configurationError, /FRONTEND_URLS/i);
});

test("production rejects wildcard origins", () => {
  const policy = getCorsPolicy({
    nodeEnv: "production",
    frontendUrls: "*"
  });

  assert.deepEqual(policy.allowedOrigins, []);
  assert.match(policy.configurationError, /wildcard/i);
});

test("only configured browser origins are allowed", () => {
  const allowed = ["https://billing.example.com"];
  assert.equal(isCorsOriginAllowed("https://billing.example.com", allowed), true);
  assert.equal(isCorsOriginAllowed("https://untrusted.example", allowed), false);
  assert.equal(isCorsOriginAllowed(undefined, allowed), true);
});
