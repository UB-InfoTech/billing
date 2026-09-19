const mongoose = require("mongoose");

const creditNoteItemSchema = new mongoose.Schema(
  {
    sourceSubOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },
    designNumber: { type: String, trim: true, default: "" },
    orderName: { type: String, trim: true, default: "" },
    hsnCode: { type: Number, default: null },
    qtyUnit: {
      type: String,
      enum: ["PCS", "MTR"],
      default: "PCS",
    },
    quantity: { type: Number, default: 0, min: 0 },
    MTR: { type: Number, default: 0, min: 0 },
    cut: { type: Number, default: 0, min: 0 },
    shortPcs: { type: Number, default: 0, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    discountRate: { type: Number, default: 0, min: 0, max: 100 },
    taxRate: { type: Number, default: 0, min: 0, max: 100 },
    lineTotalBeforeDiscount: { type: Number, default: 0, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    taxableAmount: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    lineTotal: { type: Number, default: 0, min: 0 },
  },
  { _id: true }
);

const creditNoteSchema = new mongoose.Schema(
  {
    creditNoteNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    creditNoteDate: { type: Date, required: true, default: Date.now },
    reason: {
      type: String,
      enum: [
        "Sales Return",
        "Post Sale Discount",
        "Deficiency in Service",
        "Correction in Invoice",
        "Change in POS",
        "Finalization of Provisional Assessment",
        "Other",
      ],
      required: true,
      index: true,
    },
    creditMode: {
      type: String,
      enum: ["ITEM", "AMOUNT"],
      default: "ITEM",
    },
    originalOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order2",
      required: true,
      index: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
      index: true,
    },

    // Snapshot fields keep the document printable even if master data changes later.
    companyName: { type: String, default: "" },
    Address: { type: String, default: "" },
    State: { type: String, default: "" },
    City: { type: String, default: "" },
    pinCode: { type: String, default: "" },
    stateCode: { type: String, default: "" },
    gstNumber: { type: String, default: "" },
    originalInvoiceNumber: { type: String, default: "" },
    originalInvoiceDate: { type: Date, default: null },
    originalInvoiceTotal: { type: Number, default: 0, min: 0 },

    manualCredit: {
      taxableAmount: { type: Number, default: 0, min: 0 },
      taxRate: { type: Number, default: 0, min: 0, max: 100 },
      taxAmount: { type: Number, default: 0, min: 0 },
    },

    stockAffecting: { type: Boolean, default: false },
    inventoryStatus: {
      type: String,
      enum: ["Not Applicable", "Processed", "Failed"],
      default: "Not Applicable",
    },
    inventoryMovements: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        unit: { type: String, enum: ["PCS", "MTR"], required: true },
        quantity: { type: Number, required: true, min: 0 },
      },
    ],

    settlement: {
      adjustmentType: {
        type: String,
        enum: ["Outstanding", "Advance", "Other"],
        default: "Outstanding",
      },
      adjustmentAmount: { type: Number, default: 0, min: 0 },
      refundMethod: {
        type: String,
        enum: ["Cash", "Bank Transfer", "UPI", "Cheque", null],
        default: null,
      },
      refundAmount: { type: Number, default: 0, min: 0 },
      customerCreditAmount: { type: Number, default: 0, min: 0 },
    },

    items: {
      type: [creditNoteItemSchema],
      default: [],
    },

    totals: {
      subtotal: { type: Number, default: 0, min: 0 },
      discountAmount: { type: Number, default: 0, min: 0 },
      taxableAmount: { type: Number, default: 0, min: 0 },
      taxAmount: { type: Number, default: 0, min: 0 },
      roundOff: { type: Number, default: 0 },
      grandTotal: { type: Number, default: 0, min: 0 },
    },

    status: {
      type: String,
      enum: ["Draft", "Posted", "Cancelled"],
      default: "Posted",
      index: true,
    },
    settlementStatus: {
      type: String,
      enum: ["Unsettled", "Partially Settled", "Settled", "Cancelled"],
      default: "Unsettled",
      index: true,
    },

    note: { type: String, trim: true, default: "" },
    cancellationReason: { type: String, trim: true, default: "" },
    cancelledAt: { type: Date, default: null },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

creditNoteSchema.index({ originalOrderId: 1, status: 1 });
creditNoteSchema.index({ creditNoteDate: -1, createdAt: -1 });

creditNoteSchema.pre("validate", function (next) {
  const total = Number(this.totals?.grandTotal || 0);
  const adjustment = Number(this.settlement?.adjustmentAmount || 0);
  const refund = Number(this.settlement?.refundAmount || 0);
  const customerCredit = Number(this.settlement?.customerCreditAmount || 0);

  if (total < 0) return next(new Error("Credit note total cannot be negative."));
  if (adjustment + refund + customerCredit > total + 0.01) {
    return next(
      new Error("Settlement amounts cannot exceed the credit note total.")
    );
  }

  if (this.reason === "Sales Return" && this.stockAffecting && !this.items.length) {
    return next(new Error("Sales Return requires at least one item."));
  }

  next();
});

module.exports = mongoose.model("CreditNote", creditNoteSchema);
