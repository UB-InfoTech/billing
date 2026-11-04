const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isProtectedWorkflowField,
  validateWorkflowPayload
} = require("../utils/workflowPolicy");

const payload = (resource, actions) => ({
  name: "Test workflow",
  trigger: { resource, event: "record_updated" },
  actions
});

test("blocks ownership, identity, and derived accounting fields from direct workflow edits", () => {
  for (const field of [
    "createdBy",
    "_id",
    "status",
    "statusHistory",
    "payments",
    "paymentStatus",
    "paidAmount",
    "dueAmount",
    "roundOffFinalRevenue",
    "creditBalance",
    "creditAppliedAmount",
    "customFields"
  ]) {
    assert.equal(isProtectedWorkflowField(field), true, field + " must be protected");
  }
});

test("blocks object prototype keys and unsupported nested field paths", () => {
  assert.equal(isProtectedWorkflowField("__proto__"), true);
  assert.equal(isProtectedWorkflowField("constructor"), true);
  assert.equal(isProtectedWorkflowField("customFields.creditBalance"), true);
  assert.equal(isProtectedWorkflowField("$where"), true);
});

test("allows approved built-in edits while custom fields require form configuration", () => {
  assert.equal(isProtectedWorkflowField("accountStatus"), false);
  assert.equal(isProtectedWorkflowField("custom_salesPerson"), false);
  assert.doesNotThrow(() => validateWorkflowPayload(payload("clients", [
    { type: "set_value", fieldKey: "accountStatus", value: "Inactive" }
  ])));
  assert.throws(() => validateWorkflowPayload(payload("clients", [
    { type: "set_value", fieldKey: "custom_salesPerson", value: "Team A" }
  ])), /cannot be changed by an automation/i);
});

test("workflow conditions default to all matching and support any matching",()=>{
  const {matchesWorkflowConditions}=require("../utils/workflowEngine");
  const doc={status:"Completed",paymentStatus:"Unpaid"};
  const conditions=[
    {fieldKey:"status",operator:"equals",value:"Pending"},
    {fieldKey:"paymentStatus",operator:"equals",value:"Unpaid"}
  ];
  assert.equal(matchesWorkflowConditions(conditions,doc,"all"),false);
  assert.equal(matchesWorkflowConditions(conditions,doc,"any"),true);
  assert.equal(matchesWorkflowConditions([],doc,"all"),true);
});

test("rejects unfinished workflow conditions instead of silently dropping them",()=>{
  assert.throws(()=>validateWorkflowPayload({
    ...payload("clients",[{type:"set_value",fieldKey:"accountStatus",value:"Inactive"}]),
    conditions:[{fieldKey:"",operator:"equals",value:"Active"}]
  }),/choose a field for every condition/i);
  assert.throws(()=>validateWorkflowPayload({
    ...payload("clients",[{type:"set_value",fieldKey:"accountStatus",value:"Inactive"}]),
    conditions:[{fieldKey:"accountStatus",operator:"equals",value:""}]
  }),/enter a value for every condition/i);
});

test("requires a field for a Set a field action", () => {
  assert.throws(
    () => validateWorkflowPayload(payload("clients", [{ type: "set_value", fieldKey: "", value: "Inactive" }])),
    /choose which field/i
  );
});

test("rejects direct edits to protected totals and status history", () => {
  assert.throws(
    () => validateWorkflowPayload(payload("orders", [{ type: "set_value", fieldKey: "dueAmount", value: 0 }])),
    /maintained by the software/i
  );
  assert.throws(
    () => validateWorkflowPayload(payload("orders", [{ type: "set_value", fieldKey: "status", value: "Completed" }])),
    /maintained by the software/i
  );
});

test("permits approved invoice status changes through the dedicated action", () => {
  assert.doesNotThrow(() => validateWorkflowPayload(payload("orders", [
    { type: "change_status", fieldKey: "", value: "Completed" }
  ])));
});

test("rejects invalid statuses or status changes for other resources", () => {
  assert.throws(
    () => validateWorkflowPayload(payload("orders", [{ type: "change_status", value: "Deleted" }])),
    /valid invoice status/i
  );
  assert.throws(
    () => validateWorkflowPayload(payload("clients", [{ type: "change_status", value: "Completed" }])),
    /invoices only/i
  );
});

test("does not silently accept actions that the automation engine cannot perform", () => {
  assert.throws(
    () => validateWorkflowPayload(payload("clients", [{ type: "show_message", message: "Done" }])),
    /not supported yet/i
  );
});
