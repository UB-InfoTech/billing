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
