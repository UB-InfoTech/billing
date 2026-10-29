const mongoose = require("mongoose");

const recoveryFailureSchema = new mongoose.Schema({
  step: { type: String, required: true, trim: true, maxlength: 100 },
  entityType: { type: String, default: "", trim: true, maxlength: 50 },
  entityId: { type: String, default: "", trim: true, maxlength: 100 },
  message: { type: String, required: true, trim: true, maxlength: 1000 }
}, { _id: false });

const financialRecoveryIssueSchema = new mongoose.Schema({
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  operation: {
    type: String,
    enum: ["credit-note-create", "credit-note-edit", "credit-note-cancel", "bulk-payment"],
    required: true,
    index: true
  },
  status: { type: String, enum: ["Open", "Resolved"], default: "Open", index: true },
  summary: { type: String, required: true, trim: true, maxlength: 500 },
  originalError: { type: String, default: "", trim: true, maxlength: 1000 },
  invoiceIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order2" }],
  creditNoteId: { type: mongoose.Schema.Types.ObjectId, ref: "CreditNote", default: null },
  clientIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Client" }],
  productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
  recoveryFailures: { type: [recoveryFailureSchema], default: [] },
  resolutionNote: { type: String, default: "", trim: true, maxlength: 1000 },
  resolvedAt: { type: Date, default: null },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true });

financialRecoveryIssueSchema.index({ createdBy: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("FinancialRecoveryIssue", financialRecoveryIssueSchema);
