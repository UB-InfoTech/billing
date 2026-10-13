const test = require("node:test");
const assert = require("node:assert/strict");

test("the Express app and all registered routes can be imported without starting a server", () => {
  // Importing server.js must register every route without requiring a live
  // MongoDB connection or opening a listening port. This catches startup-time
  // ReferenceErrors that syntax-only CI cannot detect.
  const app = require("../server");
  assert.equal(typeof app, "function");
  assert.ok(app.router, "Express app router should be initialized");
});
