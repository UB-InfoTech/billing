const ORDER_STATUSES = ["Pending", "In Process", "Completed", "Cancelled", "Dispatched"];

// Fields maintained by the application or derived from financial transactions
// must not be edited directly by automations. Status changes use the dedicated
// change_status action so the status history is recorded consistently.
const PROTECTED_FIELDS = new Set([
  "_id", "id", "__v", "createdBy", "customFields",
  "status", "statusHistory",
  "payments", "paymentHistory", "lastPaymentDate",
  "paymentStatus", "paidAmount", "dueAmount",
  "discountAmount", "taxAmount", "totalCost", "totalAmount",
  "finalRevenue", "roundOffFinalRevenue", "roundOff",
  "creditAppliedAmount", "creditNoteCount",
  "creditBalance", "creditBalanceAdjustment", "outstanding_balance",
  "pendingPayments", "totalPaid", "totalRevenue", "orderCount",
  "lastOrderDate", "averageOrderValue", "preferredProducts", "orderFrequency",
  "ewbDetails"
]);

function isProtectedWorkflowField(value) {
  const key = String(value ?? "").trim();
  if (!key || PROTECTED_FIELDS.has(key)) return true;
  if (["__proto__", "prototype", "constructor"].includes(key)) return true;
  if (key.startsWith("$") || key.includes(".")) return true;
  return false;
}

function validateWorkflowPayload(workflow) {
  const resource = workflow?.trigger?.resource;
  const conditions=Array.isArray(workflow?.conditions)?workflow.conditions:[];
  if(!["all","any"].includes(workflow?.matchMode||"all")){
    throw new Error("Choose whether all conditions or any condition must match.");
  }
  if(conditions.length>20)throw new Error("A workflow can have no more than 20 conditions.");
  for(const condition of conditions){
    if(!String(condition?.fieldKey||"").trim()){
      throw new Error("Choose a field for every condition or remove the unfinished condition.");
    }
    if(!["equals","not_equals","contains","not_contains","greater_than","less_than","empty","not_empty"].includes(condition?.operator)){
      throw new Error("Choose a valid condition.");
    }
    if(!["empty","not_empty"].includes(condition.operator)&&!String(condition?.value??"").trim()){
      throw new Error("Enter a value for every condition or choose an empty/not empty condition.");
    }
  }
  const actions = Array.isArray(workflow?.actions) ? workflow.actions : [];
  if (!actions.length) throw new Error("Add at least one working action.");

  for (const action of actions) {
    if (action.type === "set_value") {
      if (!String(action.fieldKey ?? "").trim()) {
        throw new Error("Choose which field this workflow should update.");
      }
      if (isProtectedWorkflowField(action.fieldKey)) {
        throw new Error(
          "This field is maintained by the software and cannot be changed directly by a workflow. Use Change status for invoice status."
        );
      }
      continue;
    }

    if (action.type === "change_status") {
      if (resource !== "orders") {
        throw new Error("Automatic status changes are available for invoices only.");
      }
      if (!ORDER_STATUSES.includes(String(action.value ?? ""))) {
        throw new Error("Choose a valid invoice status for this workflow.");
      }
      continue;
    }

    throw new Error("This workflow action is not supported yet. Choose Set a field or Change status.");
  }

  return workflow;
}

module.exports = {
  ORDER_STATUSES,
  PROTECTED_FIELDS,
  isProtectedWorkflowField,
  validateWorkflowPayload
};
