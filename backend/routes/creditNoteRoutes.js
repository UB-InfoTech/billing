const express = require("express");
const mongoose = require("mongoose");

const Order = require("../models/Order2");
const CreditNote = require("../models/CreditNote");
const CreditNoteCounter = require("../models/CreditNoteCounter");
const auth = require('../middleware/auth');
const { syncClientData } = require("../utils/syncClientData");


const router = express.Router();

const REASONS = [
  "Sales Return",
  "Post Sale Discount",
  "Deficiency in Service",
  "Correction in Invoice",
  "Change in POS",
  "Finalization of Provisional Assessment",
  "Other",
];

const PAYMENT_METHODS = ["Cash", "Bank Transfer", "UPI", "Cheque"];
const MODES = ["ITEM", "AMOUNT"];
const EPSILON = 0.01;

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getAuthenticatedUserId(req) {
  const id = req.user?._id || req.user?.id || req.user?.userId;
  return id && mongoose.isValidObjectId(id) ? id : null;
}

function isReplicaSetAvailable() {
  const client = mongoose.connection.getClient?.();
  const topology = client?.topology?.description;
  if (!topology) return false;
  return Object.values(topology.servers || {}).some(
    (server) => server.type === "RSPrimary" || server.type === "RSSecondary"
  );
}

function invoiceBilledQty(sub) {
  const qtyUnit = sub?.qtyUnit || "PCS";
  const qty = Number(sub?.quantity || 0);
  const mtr = Number(sub?.MTR || 0);
  const short = Number(sub?.shortPcs || 0);
  return round2(
    qtyUnit === "MTR"
      ? Math.max(0, mtr - short)
      : Math.max(0, qty - short)
  );
}

function requestedQty(item, qtyUnit) {
  return qtyUnit === "MTR"
    ? Number(item?.MTR || 0)
    : Number(item?.quantity || 0);
}

function calculateLine({ quantity, unitPrice, discountRate, taxRate }) {
  const lineTotalBeforeDiscount = round2(quantity * Number(unitPrice || 0));
  const discountAmount = round2(
    (lineTotalBeforeDiscount * Number(discountRate || 0)) / 100
  );
  const taxableAmount = round2(lineTotalBeforeDiscount - discountAmount);
  const taxAmount = round2((taxableAmount * Number(taxRate || 0)) / 100);
  const lineTotal = round2(taxableAmount + taxAmount);

  return {
    lineTotalBeforeDiscount,
    discountAmount,
    taxableAmount,
    taxAmount,
    lineTotal,
  };
}

function calculateManualCredit({ taxableAmount, taxRate }) {
  const taxable = round2(taxableAmount);
  const tax = round2((taxable * Number(taxRate || 0)) / 100);
  const beforeRound = round2(taxable + tax);
  const grandTotal = Math.round(beforeRound);
  const roundOff = round2(grandTotal - beforeRound);

  return {
    taxableAmount: taxable,
    taxAmount: tax,
    grandTotal,
    roundOff,
  };
}

function calculateSettlement(settlement, grandTotal, orderDue) {
  const adjustmentAmount = round2(settlement?.adjustmentAmount);
  const refundAmount = round2(settlement?.refundAmount);
  const customerCreditAmount = round2(settlement?.customerCreditAmount);
  const totalAllocated = round2(
    adjustmentAmount + refundAmount + customerCreditAmount
  );

  if (adjustmentAmount < 0 || refundAmount < 0 || customerCreditAmount < 0) {
    throw new Error("Settlement amounts cannot be negative.");
  }

  if (totalAllocated > grandTotal + EPSILON) {
    throw new Error("Settlement amounts cannot exceed the credit note total.");
  }

  if (round2(totalAllocated) !== round2(grandTotal)) {
    throw new Error(
      `Allocate the full credit note amount. Remaining: ₹ ${round2(
        grandTotal - totalAllocated
      )}.`
    );
  }

  if (adjustmentAmount > round2(orderDue) + EPSILON) {
    throw new Error(
      `Outstanding adjustment cannot exceed the current invoice due amount of ₹ ${round2(
        orderDue
      )}.`
    );
  }

  if (refundAmount > 0 && !PAYMENT_METHODS.includes(settlement?.refundMethod)) {
    throw new Error("A valid refund method is required for a refund.");
  }

  const adjustmentType = ["Outstanding", "Advance", "Other"].includes(
    settlement?.adjustmentType
  )
    ? settlement.adjustmentType
    : "Outstanding";

  return {
    adjustmentType,
    adjustmentAmount,
    refundMethod: refundAmount > 0 ? settlement.refundMethod : null,
    refundAmount,
    customerCreditAmount,
  };
}

async function getPreviouslyCredited(orderId, session) {
  const rows = await CreditNote.find({
    originalOrderId: orderId,
    status: { $ne: "Cancelled" },
  })
    .select("items totals.grandTotal creditMode")
    .session(session || null)
    .lean();

  const map = new Map();
  let total = 0;

  for (const note of rows) {
    total += Number(note?.totals?.grandTotal || 0);
    for (const item of note.items || []) {
      const id = String(item.sourceSubOrderId || "");
      if (!id) continue;
      const row = map.get(id) || { quantity: 0, MTR: 0 };
      row.quantity += Number(item.quantity || 0);
      row.MTR += Number(item.MTR || 0);
      map.set(id, row);
    }
  }

  return { map, total: round2(total) };
}

async function nextNumber(session) {
  const year = new Date().getFullYear();
  const counterKey = `CN-${year}`;

  const counter = await CreditNoteCounter.findOneAndUpdate(
    { _id: counterKey },
    { $inc: { value: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true, session }
  );

  return `CN-${year}-${String(counter.value).padStart(5, "0")}`;
}

async function searchInvoiceRows(search, limit = 25) {
  const regex = new RegExp(escapeRegex(search.trim()), "i");
  return Order.find({
    $or: [
      { orderNumber: regex },
      { companyName: regex },
      { gstNumber: regex },
      { Address: regex },
    ],
  })
    .select(
      "orderNumber orderDate companyName gstNumber clientId Address State City pinCode stateCode status paymentStatus payments paidAmount dueAmount finalRevenue roundOffFinalRevenue discountRate taxPercentage subOrders"
    )
    .sort({ orderDate: -1, createdAt: -1 })
    .limit(limit)
    .lean();
}

/**
 * GET /api/credit-notes/invoices/search?q=INV-1001
 * Self-contained invoice lookup. The frontend does not depend on the
 * existing Order search route implementation.
 */
router.get("/invoices/search", auth, async (req, res) => {
  try {
    const q = String(req.query.q || req.query.search || "").trim();
    const limit = Math.min(Math.max(Number(req.query.limit || 25), 1), 50);

    if (q.length < 2) {
      return res.json({ orders: [] });
    }

    const orders = await searchInvoiceRows(q, limit);
    return res.json({ orders });
  } catch (error) {
    console.error("Credit note invoice search error:", error);
    return res.status(500).json({ message: "Unable to search invoices." });
  }
});

/** GET /api/credit-notes */
router.get("/", auth, async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 25), 1), 100);
    const skip = (page - 1) * limit;
    const filter = {};

    if (req.query.reason) {
      if (!REASONS.includes(req.query.reason)) {
        return res.status(400).json({ message: "Invalid credit note reason." });
      }
      filter.reason = req.query.reason;
    }

    if (req.query.status) {
      if (!["Draft", "Posted", "Cancelled"].includes(req.query.status)) {
        return res.status(400).json({ message: "Invalid status." });
      }
      filter.status = req.query.status;
    }

    if (req.query.from || req.query.to) {
      filter.creditNoteDate = {};
      if (req.query.from) {
        const from = new Date(`${req.query.from}T00:00:00.000`);
        if (Number.isNaN(from.getTime())) {
          return res.status(400).json({ message: "Invalid from date." });
        }
        filter.creditNoteDate.$gte = from;
      }
      if (req.query.to) {
        const to = new Date(`${req.query.to}T23:59:59.999`);
        if (Number.isNaN(to.getTime())) {
          return res.status(400).json({ message: "Invalid to date." });
        }
        filter.creditNoteDate.$lte = to;
      }
    }

    const search = String(req.query.search || "").trim();
    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      const orderRows = await Order.find({
        $or: [
          { orderNumber: regex },
          { companyName: regex },
          { gstNumber: regex },
        ],
      })
        .select("_id")
        .limit(300)
        .lean();

      filter.$or = [
        { creditNoteNumber: regex },
        { companyName: regex },
        { gstNumber: regex },
        { originalInvoiceNumber: regex },
        { originalOrderId: { $in: orderRows.map((x) => x._id) } },
      ];
    }

    const [rows, total] = await Promise.all([
      CreditNote.find(filter)
        .populate(
          "originalOrderId",
          "orderNumber orderDate companyName gstNumber Address State City pinCode stateCode"
        )
        .sort({ creditNoteDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CreditNote.countDocuments(filter),
    ]);

    const creditNotes = rows.map((note) => ({
      ...note,
      originalOrder: note.originalOrderId,
      originalInvoiceNumber: note.originalInvoiceNumber || note.originalOrderId?.orderNumber || "",
      originalInvoiceDate: note.originalInvoiceDate || note.originalOrderId?.orderDate || null,
      adjustmentAmount: Number(note.settlement?.adjustmentAmount || 0),
      refundAmount: Number(note.settlement?.refundAmount || 0),
    }));

    return res.json({
      creditNotes,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error("Credit note list error:", error);
    return res.status(500).json({ message: "Unable to load credit notes." });
  }
});

/** GET /api/credit-notes/next-number */
router.get("/next-number", auth, async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const key = `CN-${year}`;
    const counter = await CreditNoteCounter.findOne({ _id: key }).lean();
    const next = Number(counter?.value || 0) + 1;
    return res.json({
      creditNoteNumber: `CN-${year}-${String(next).padStart(5, "0")}`,
      reserved: false,
    });
  } catch (error) {
    console.error("Credit note next-number error:", error);
    return res.status(500).json({ message: "Unable to generate next number." });
  }
});

/** GET /api/credit-notes/available/:orderId */
router.get("/available/:orderId", auth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.orderId)) {
      return res.status(400).json({ message: "Invalid invoice ID." });
    }

    const order = await Order.findOne({ _id: req.params.orderId, createdBy: req.user.id }).lean();
    if (!order) return res.status(404).json({ message: "Invoice not found." });

    const { map, total } = await getPreviouslyCredited(order._id);
    const invoiceTotal = round2(
      order.roundOffFinalRevenue ?? order.finalRevenue ?? order.totalAmount ?? 0
    );

    const items = (order.subOrders || []).map((sub) => {
      const key = String(sub._id);
      const previous = map.get(key) || { quantity: 0, MTR: 0 };
      const billedQty = invoiceBilledQty(sub);
      const creditedQty =
        (sub.qtyUnit || "PCS") === "MTR"
          ? round2(previous.MTR)
          : round2(previous.quantity);

      return {
        ...sub,
        billedQuantity: billedQty,
        previouslyCreditedQuantity:
          (sub.qtyUnit || "PCS") === "MTR" ? 0 : creditedQty,
        previouslyCreditedMTR:
          (sub.qtyUnit || "PCS") === "MTR" ? creditedQty : 0,
        availableQuantity: Math.max(0, round2(billedQty - creditedQty)),
      };
    });

    return res.json({
      order: {
        ...order,
        invoiceTotal,
        previouslyCreditedTotal: total,
        remainingCreditTotal: Math.max(0, round2(invoiceTotal - total)),
      },
      items,
    });
  } catch (error) {
    console.error("Credit note available items error:", error);
    return res.status(500).json({ message: "Unable to load invoice details." });
  }
});

/** GET /api/credit-notes/:id */
router.get("/:id", auth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid credit note ID." });
    }

    const note = await CreditNote.findOne({ _id: req.params.id, createdBy: req.user.id })
      .populate(
        "originalOrderId",
        "orderNumber orderDate companyName gstNumber Address State City pinCode stateCode payments paidAmount dueAmount roundOffFinalRevenue finalRevenue"
      )
      .lean();

    if (!note) return res.status(404).json({ message: "Credit note not found." });

    return res.json({
      creditNote: {
        ...note,
        originalOrder: note.originalOrderId,
      },
    });
  } catch (error) {
    console.error("Credit note details error:", error);
    return res.status(500).json({ message: "Unable to load credit note." });
  }
});

/** POST /api/credit-notes */
router.post("/", auth, async (req, res) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(401).json({
      message: "Authentication required. req.user must be populated by your auth middleware.",
    });
  }

  if (!isReplicaSetAvailable()) {
    return res.status(503).json({
      message:
        "Credit notes require MongoDB transactions. Start MongoDB as a replica set or use MongoDB Atlas before posting credit notes.",
    });
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const {
      creditNoteNumber: requestedNumber,
      creditNoteDate,
      reason,
      creditMode,
      originalOrderId,
      stockAffecting,
      settlement,
      manualCredit,
      items,
      note,
    } = req.body || {};

    if (!REASONS.includes(reason)) throw new Error("Invalid credit note reason.");
    if (!MODES.includes(creditMode)) throw new Error("Invalid credit mode.");
    if (!mongoose.isValidObjectId(originalOrderId)) {
      throw new Error("Invalid original invoice.");
    }

    const order = await Order.findOne({ _id: originalOrderId, createdBy: userId }).session(session);
    if (!order) throw new Error("Original invoice not found.");

    const { map: previousCredits, total: previousCreditTotal } =
      await getPreviouslyCredited(originalOrderId, session);

    const invoiceTotal = round2(
      order.roundOffFinalRevenue ?? order.finalRevenue ?? order.totalAmount ?? 0
    );
    const remainingCreditTotal = Math.max(
      0,
      round2(invoiceTotal - previousCreditTotal)
    );

    if (remainingCreditTotal <= EPSILON) {
      throw new Error("This invoice has already been fully credited.");
    }

    const finalItems = [];
    let subtotal = 0;
    let discountAmount = 0;
    let taxableAmount = 0;
    let taxAmount = 0;

    if (creditMode === "ITEM") {
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error("At least one item is required for item-based credit.");
      }

      const seen = new Set();

      for (const requested of items) {
        const sourceId = String(requested?.sourceSubOrderId || "");
        if (!sourceId || seen.has(sourceId)) {
          throw new Error("Each invoice item can appear only once.");
        }
        seen.add(sourceId);

        const source = order.subOrders.id(sourceId);
        if (!source) throw new Error("One or more selected items are invalid.");

        const qtyUnit = source.qtyUnit || "PCS";
        const requestedQuantity = requestedQty(requested, qtyUnit);
        const billedQty = invoiceBilledQty(source);
        const previousQty =
          qtyUnit === "MTR"
            ? Number(previousCredits.get(sourceId)?.MTR || 0)
            : Number(previousCredits.get(sourceId)?.quantity || 0);
        const available = Math.max(0, round2(billedQty - previousQty));

        if (requestedQuantity <= 0) continue;
        if (requestedQuantity > available + EPSILON) {
          throw new Error(
            `Credit quantity exceeded for ${source.orderName || source.designNumber || "item"}. Available: ${available} ${qtyUnit}.`
          );
        }

        const unitPrice = Number(source.unitPrice || 0);
        const discountRate = Number(
          requested.discountRate ?? order.discountRate ?? 0
        );
        const taxRate = Number(
          requested.taxRate ?? order.taxPercentage ?? 0
        );

        if (unitPrice < 0) throw new Error("Invoice contains an invalid item rate.");
        if (discountRate < 0 || discountRate > 100) {
          throw new Error("Invalid discount rate.");
        }
        if (taxRate < 0 || taxRate > 100) throw new Error("Invalid tax rate.");

        const calculated = calculateLine({
          quantity: requestedQuantity,
          unitPrice,
          discountRate,
          taxRate,
        });

        finalItems.push({
          sourceSubOrderId: source._id,
          productId: source.productId || null,
          designNumber: source.designNumber || "",
          orderName: source.orderName || "",
          hsnCode: source.hsnCode ?? null,
          qtyUnit,
          quantity: qtyUnit === "MTR" ? 0 : requestedQuantity,
          MTR: qtyUnit === "MTR" ? requestedQuantity : 0,
          cut: Number(source.cut || 0),
          shortPcs: Number(source.shortPcs || 0),
          unitPrice,
          discountRate,
          taxRate,
          ...calculated,
        });

        subtotal += calculated.lineTotalBeforeDiscount;
        discountAmount += calculated.discountAmount;
        taxableAmount += calculated.taxableAmount;
        taxAmount += calculated.taxAmount;
      }

      if (!finalItems.length) {
        throw new Error("Enter a credit quantity for at least one item.");
      }
    } else {
      const manualTaxable = Number(manualCredit?.taxableAmount || 0);
      const manualTaxRate = Number(
        manualCredit?.taxRate ?? order.taxPercentage ?? 0
      );

      if (manualTaxable <= 0) {
        throw new Error("Enter a valid taxable credit amount.");
      }
      if (manualTaxRate < 0 || manualTaxRate > 100) {
        throw new Error("Invalid manual credit tax rate.");
      }

      const manual = calculateManualCredit({
        taxableAmount: manualTaxable,
        taxRate: manualTaxRate,
      });

      taxableAmount = manual.taxableAmount;
      taxAmount = manual.taxAmount;
      subtotal = manual.taxableAmount;
      discountAmount = 0;
    }

    subtotal = round2(subtotal);
    discountAmount = round2(discountAmount);
    taxableAmount = round2(taxableAmount);
    taxAmount = round2(taxAmount);

    let beforeRound = round2(taxableAmount + taxAmount);
    let grandTotal = Math.round(beforeRound);
    let roundOff = round2(grandTotal - beforeRound);

    if (grandTotal <= 0) throw new Error("Credit note total must be greater than zero.");
    if (grandTotal > remainingCreditTotal + EPSILON) {
      throw new Error(
        `Credit note amount cannot exceed the remaining invoice credit limit of ₹ ${remainingCreditTotal}.`
      );
    }

    const paymentTotal = (order.payments || []).reduce(
      (sum, payment) => sum + (Number(payment.amount) || 0),
      0
    );
    const currentDue = Math.max(
      0,
      round2(
        Number(order.roundOffFinalRevenue || 0) -
          Number(paymentTotal || 0) -
          Number(order.creditAppliedAmount || 0)
      )
    );

    const finalSettlement = calculateSettlement(
      settlement,
      grandTotal,
      currentDue
    );

    const shouldAffectStock = Boolean(stockAffecting);
    let inventoryStatus = "Not Applicable";
    const inventoryMovements = [];

    if (shouldAffectStock) {
      if (reason !== "Sales Return") {
        throw new Error("Stock reversal is allowed only for Sales Return.");
      }
      if (creditMode !== "ITEM") {
        throw new Error("Stock reversal requires item-based credit.");
      }

      let Product;
      try {
        Product = require("../models/Product");
      } catch {
        throw new Error(
          "Product model not found. Add the Product model before enabling stock reversal."
        );
      }

      for (const item of finalItems) {
        if (!item.productId) {
          throw new Error(
            `Product mapping is missing for ${item.orderName || item.designNumber || "an invoice item"}. Add productId to Order.subOrders or turn off stock reversal.`
          );
        }

        if (!Product.schema.path("quantity")) {
          throw new Error(
            "Product.quantity field was not found. Update the stock integration to match your Product model."
          );
        }

        const stockQty = item.qtyUnit === "MTR" ? Number(item.MTR || 0) : Number(item.quantity || 0);
        if (stockQty <= 0) continue;

        const updatedProduct = await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { quantity: stockQty } },
          { new: true, session }
        );

        if (!updatedProduct) {
          throw new Error(`Product not found for ${item.orderName || item.designNumber || "item"}.`);
        }

        inventoryMovements.push({
          productId: item.productId,
          unit: item.qtyUnit,
          quantity: stockQty,
        });
      }

      inventoryStatus = "Processed";
    }

    const number = requestedNumber?.trim()
      ? requestedNumber.trim().toUpperCase()
      : await nextNumber(session);

    const duplicate = await CreditNote.findOne({
      creditNoteNumber: number,
    })
      .session(session)
      .lean();
    if (duplicate) throw new Error("Credit Note number already exists.");

    if (finalSettlement.customerCreditAmount > 0) {
      if (!order.clientId) {
        throw new Error("Customer credit requires the invoice to have a clientId.");
      }
      let Client;
      try {
        Client = require("../models/Client");
      } catch {
        throw new Error("Client model not found for customer credit allocation.");
      }
      if (!Client.schema.path("creditBalance")) {
        throw new Error(
          "Add Client.creditBalance to your Client schema before using Customer Credit settlement."
        );
      }
      await Client.findByIdAndUpdate(
        order.clientId,
        { $inc: { creditBalance: finalSettlement.customerCreditAmount } },
        { session }
      );
    }

    if (finalSettlement.adjustmentAmount > 0) {
      const nextCreditApplied = round2(
        Number(order.creditAppliedAmount || 0) +
          finalSettlement.adjustmentAmount
      );

      await Order.findByIdAndUpdate(
        order._id,
        {
          $set: {
            creditAppliedAmount: nextCreditApplied,
            dueAmount: Math.max(
              0,
              round2(
                Number(order.roundOffFinalRevenue || 0) -
                  paymentTotal -
                  nextCreditApplied
              )
            ),
          },
          $inc: { creditNoteCount: 1 },
        },
        { session }
      );
    } else {
      await Order.findByIdAndUpdate(
        order._id,
        { $inc: { creditNoteCount: 1 } },
        { session }
      );
    }

    const settled = round2(
      finalSettlement.adjustmentAmount +
        finalSettlement.refundAmount +
        finalSettlement.customerCreditAmount
    );

    const noteDoc = new CreditNote({
      creditNoteNumber: number,
      creditNoteDate: creditNoteDate ? new Date(creditNoteDate) : new Date(),
      reason,
      creditMode,
      originalOrderId: order._id,
      clientId: order.clientId || null,
      companyName: order.companyName || "",
      Address: order.Address || "",
      State: order.State || "",
      City: order.City || "",
      pinCode: order.pinCode || "",
      stateCode: order.stateCode || "",
      gstNumber: order.gstNumber || "",
      originalInvoiceNumber: order.orderNumber || "",
      originalInvoiceDate: order.orderDate || null,
      originalInvoiceTotal: invoiceTotal,
      manualCredit:
        creditMode === "AMOUNT"
          ? {
              taxableAmount,
              taxRate: Number(manualCredit?.taxRate ?? order.taxPercentage ?? 0),
              taxAmount,
            }
          : undefined,
      stockAffecting: shouldAffectStock,
      inventoryStatus,
      inventoryMovements,
      settlement: finalSettlement,
      items: finalItems,
      totals: {
        subtotal,
        discountAmount,
        taxableAmount,
        taxAmount,
        roundOff,
        grandTotal,
      },
      status: "Posted",
      settlementStatus:
        settled >= grandTotal - EPSILON ? "Settled" : "Partially Settled",
      note: String(note || "").trim(),
      createdBy: userId,
    });

    await noteDoc.save({ session });
    await session.commitTransaction();

    const saved = await CreditNote.findById(noteDoc._id)
      .populate(
        "originalOrderId",
        "orderNumber orderDate companyName gstNumber Address State City pinCode stateCode paymentTerms roundOffFinalRevenue finalRevenue dueAmount creditAppliedAmount"
      )
      .lean();

    await syncClientData(noteDoc.clientId);

    return res.status(201).json({
      message: "Credit note created successfully.",
      creditNote: {
        ...saved,
        originalOrder: saved.originalOrderId,
      },
    });
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch {
      // Transaction may already be closed.
    }

    console.error("Credit note create error:", error);
    const status =
      error?.code === 11000
        ? 409
        : /authentication required/i.test(error?.message || "")
        ? 401
        : /not found|invalid|cannot|requires|exceed|exceeded|allocate|enter|product|stock|settlement|credit note number/i.test(
            error?.message || ""
          )
        ? 400
        : 500;

    return res.status(status).json({
      message: error?.message || "Unable to create credit note.",
    });
  } finally {
    await session.endSession();
  }
});

/** POST /api/credit-notes/:id/cancel */
router.post("/:id/cancel", auth, async (req, res) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(401).json({ message: "Authentication required." });
  }
  if (!isReplicaSetAvailable()) {
    return res.status(503).json({
      message:
        "Credit note cancellation requires MongoDB transactions. Start MongoDB as a replica set or use MongoDB Atlas.",
    });
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid credit note ID." });
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const note = await CreditNote.findById(req.params.id).session(session);
    if (!note) throw new Error("Credit note not found.");
    if (note.status === "Cancelled") throw new Error("Credit note is already cancelled.");
    if (note.status !== "Posted") throw new Error("Only posted credit notes can be cancelled.");

    const order = await Order.findById(note.originalOrderId).session(session);
    if (!order) throw new Error("Original invoice no longer exists.");

    const adjustmentAmount = Number(note.settlement?.adjustmentAmount || 0);
    const currentCreditApplied = Number(order.creditAppliedAmount || 0);
    const nextCreditApplied = Math.max(
      0,
      round2(currentCreditApplied - adjustmentAmount)
    );

    const paymentsTotal = (order.payments || []).reduce(
      (sum, p) => sum + (Number(p.amount) || 0),
      0
    );
    const dueAmount = Math.max(
      0,
      round2(
        Number(order.roundOffFinalRevenue || 0) -
          paymentsTotal -
          nextCreditApplied
      )
    );

    if (note.stockAffecting && note.inventoryMovements?.length) {
      let Product;
      try {
        Product = require("../models/Product");
      } catch {
        throw new Error("Product model not found; cannot reverse stock movement.");
      }

      for (const movement of note.inventoryMovements) {
        const updated = await Product.findByIdAndUpdate(
          movement.productId,
          { $inc: { quantity: -Number(movement.quantity || 0) } },
          { new: true, session }
        );
        if (!updated) throw new Error("A stock product no longer exists.");
        if (Number(updated.quantity || 0) < -EPSILON) {
          throw new Error(
            `Cancelling this credit note would make product stock negative for ${movement.productId}.`
          );
        }
      }

      note.inventoryStatus = "Not Applicable";
    }

    if (Number(note.settlement?.customerCreditAmount || 0) > 0) {
      if (!note.clientId) throw new Error("Customer credit client is missing.");
      let Client;
      try {
        Client = require("../models/Client");
      } catch {
        throw new Error("Client model not found; cannot reverse customer credit.");
      }
      if (!Client.schema.path("creditBalance")) {
        throw new Error(
          "Client.creditBalance is required to reverse this customer credit."
        );
      }
      await Client.findByIdAndUpdate(
        note.clientId,
        { $inc: { creditBalance: -Number(note.settlement.customerCreditAmount) } },
        { session }
      );
    }

    await Order.findByIdAndUpdate(
      order._id,
      {
        $set: {
          creditAppliedAmount: nextCreditApplied,
          dueAmount,
          creditNoteCount: Math.max(0, Number(order.creditNoteCount || 0) - 1),
        },
      },
      { session }
    );

    note.status = "Cancelled";
    note.settlementStatus = "Cancelled";
    note.cancellationReason = String(req.body?.reason || "").trim();
    note.cancelledAt = new Date();
    note.cancelledBy = userId;

    await note.save({ session });
    await session.commitTransaction();
    await syncClientData(order.clientId);

    const cancelled = await CreditNote.findById(note._id)
      .populate(
        "originalOrderId",
        "orderNumber orderDate companyName gstNumber Address State City pinCode stateCode paymentTerms roundOffFinalRevenue finalRevenue dueAmount creditAppliedAmount"
      )
      .lean();

    return res.json({
      message: "Credit note cancelled successfully.",
      creditNote: { ...cancelled, originalOrder: cancelled?.originalOrderId }
    });
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch {}
    console.error("Credit note cancellation error:", error);
    return res.status(400).json({ message: error.message });
  } finally {
    await session.endSession();
  }
});

// Posted credit notes are intentionally immutable. Use /:id/cancel instead of DELETE.
router.delete("/:id", auth, async (req, res) => {
  return res.status(405).json({
    message:
      "Credit notes cannot be deleted. Cancel the posted credit note to preserve the audit trail.",
  });
});

module.exports = router;
