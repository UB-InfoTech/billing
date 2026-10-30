const mongoose = require("mongoose");
const FinancialRecoveryIssue = require("../models/FinancialRecoveryIssue");

function safeMessage(value) {
  const message = value && typeof value === "object"
    ? (value.message || String(value))
    : String(value || "Unknown error");
  return message.slice(0, 1000);
}

function validIds(values) {
  const source = Array.isArray(values) ? values : [];
  const unique = new Set(source.map(value => String(value || "")).filter(mongoose.isValidObjectId));
  return [...unique].map(value => new mongoose.Types.ObjectId(value));
}

/**
 * Store a durable, tenant-owned recovery alert when financial compensation fails.
 * This helper intentionally never masks the original transaction error if the
 * recovery log itself cannot be written; that second failure is emitted as a
 * structured error for centralized application-log monitoring.
 */
async function recordFinancialRecoveryIssue(input = {}) {
  const createdBy = input.createdBy;
  const operation = String(input.operation || "");
  const summary = String(input.summary || "Automatic financial recovery was incomplete.").slice(0, 500);
  const originalError = safeMessage(input.originalError);

  try {
    if (!mongoose.isValidObjectId(createdBy)) {
      throw new TypeError("A valid business owner is required to record a financial recovery issue.");
    }

    const failures = (Array.isArray(input.recoveryFailures) ? input.recoveryFailures : [])
      .slice(0, 50)
      .map(failure => ({
        step: String(failure?.step || "unknown-step").slice(0, 100),
        entityType: String(failure?.entityType || "").slice(0, 50),
        entityId: String(failure?.entityId || "").slice(0, 100),
        message: safeMessage(failure?.message)
      }));

    return await FinancialRecoveryIssue.create({
      createdBy,
      operation,
      summary,
      originalError,
      invoiceIds: validIds(input.invoiceIds),
      creditNoteId: mongoose.isValidObjectId(input.creditNoteId) ? input.creditNoteId : null,
      clientIds: validIds(input.clientIds),
      productIds: validIds(input.productIds),
      recoveryFailures: failures,
      status: "Open"
    });
  } catch (loggingError) {
    console.error("[FINANCIAL_RECOVERY_RECORD_WRITE_FAILED]", JSON.stringify({
      operation,
      createdBy: String(createdBy || ""),
      summary,
      originalError,
      recoveryFailureCount: Array.isArray(input.recoveryFailures) ? input.recoveryFailures.length : 0,
      loggingError: safeMessage(loggingError)
    }));
    return null;
  }
}

module.exports = { recordFinancialRecoveryIssue };
