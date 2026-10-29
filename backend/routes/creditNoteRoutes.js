const express = require("express");
const mongoose = require("mongoose");

const Order = require("../models/Order2");
const CreditNote = require("../models/CreditNote");
const CreditNoteCounter = require("../models/CreditNoteCounter");
const auth = require('../middleware/auth');
const { syncClientDataSafely } = require("../utils/syncClientData");
const { exceedsCurrencyLimit, meetsCurrencyTarget } = require("../utils/currencyValidation");
const { buildInvoiceCreditWriteFilter, buildPreviouslyCreditedFilter } = require("../utils/creditNoteConcurrency");
const { buildClientCreditBalanceMutation } = require("../utils/clientCreditBalance");


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
    (server) => server.type === "RSPrimary" || server.type === "RSSecondary" || server.type === "Mongos"
  );
}

async function applyCustomerCreditChange({
  clientId,
  userId,
  amount,
  adjustmentDelta = 0,
  minimumBalance = 0,
  insufficientBalanceMessage,
  notFoundMessage = "Customer for this Credit Note was not found in your account.",
  missingBalanceMessage = "Client.creditBalance is required for customer credit settlement.",
  session = null
}) {
  if (!clientId) throw new Error("Customer credit requires a client.");

  const Client = require("../models/Client");
  if (!Client.schema.path("creditBalance")) throw new Error(missingBalanceMessage);

  const clientQuery = Client.findOne({ _id: clientId, createdBy: userId })
    .select("creditBalance creditBalanceAdjustment createdBy +financialSummaryVersion");
  if (session) clientQuery.session(session);
  const client = await clientQuery.lean();
  if (!client) throw new Error(notFoundMessage);

  let postedNotes = [];
  const hasStoredAdjustment = client.creditBalanceAdjustment !== undefined
    && client.creditBalanceAdjustment !== null
    && Number.isFinite(Number(client.creditBalanceAdjustment));
  if (!hasStoredAdjustment) {
    const postedNotesQuery = CreditNote.find({
      clientId: client._id,
      createdBy: userId,
      status: "Posted"
    }).select("settlement.customerCreditAmount");
    if (session) postedNotesQuery.session(session);
    postedNotes = await postedNotesQuery.lean();
  }

  const mutation = buildClientCreditBalanceMutation({
    client,
    creditNotes: postedNotes,
    amount,
    adjustmentDelta,
    minimumBalance,
    insufficientBalanceMessage
  });

  const updateOptions = { new: true, runValidators: true };
  if (session) updateOptions.session = session;
  const updatedClient = await Client.findOneAndUpdate(
    mutation.filter,
    mutation.update,
    updateOptions
  );
  if (!updatedClient) {
    const conflict = new Error(
      "The customer balance changed while this operation was being processed. Refresh and try again."
    );
    conflict.status = 409;
    throw conflict;
  }
  return updatedClient;
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

// Some legacy orders have roundOffFinalRevenue = 0 even though finalRevenue or
// totalAmount is populated. Prefer a positive calculated total so Credit Notes
// work correctly for both old and newly-created invoices.
function getOrderInvoiceTotal(order) {
  const rounded = Number(order?.roundOffFinalRevenue);
  if (Number.isFinite(rounded) && rounded > EPSILON) return round2(rounded);

  const totalAmount = Number(order?.totalAmount);
  if (Number.isFinite(totalAmount) && totalAmount > EPSILON) {
    return Math.round(totalAmount);
  }

  const finalRevenue = Number(order?.finalRevenue);
  if (Number.isFinite(finalRevenue) && finalRevenue > EPSILON) {
    return Math.round(finalRevenue);
  }

  return 0;
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

  if (exceedsCurrencyLimit(totalAllocated, grandTotal)) {
    throw new Error("Settlement amounts cannot exceed the credit note total.");
  }

  if (round2(totalAllocated) !== round2(grandTotal)) {
    throw new Error(
      `Allocate the full credit note amount. Remaining: ₹ ${round2(
        grandTotal - totalAllocated
      )}.`
    );
  }

  if (exceedsCurrencyLimit(adjustmentAmount, round2(orderDue))) {
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

async function getPreviouslyCredited(orderId, session, excludeCreditNoteId = null, createdBy = null) {
  const filter = buildPreviouslyCreditedFilter({
    orderId,
    createdBy,
    excludeCreditNoteId:
      excludeCreditNoteId && mongoose.isValidObjectId(excludeCreditNoteId)
        ? excludeCreditNoteId
        : null,
  });

  const rows = await CreditNote.find(filter)
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

async function searchInvoiceRows(search, limit = 25, createdBy) {
  const regex = new RegExp(escapeRegex(search.trim()), "i");
  return Order.find({
    createdBy,
    $or: [
      { orderNumber: regex },
      { companyName: regex },
      { gstNumber: regex },
      { Address: regex },
    ],
  })
    .select(
      "orderNumber orderDate companyName gstNumber clientId Address State City pinCode stateCode status paymentStatus payments paidAmount dueAmount finalRevenue roundOffFinalRevenue totalAmount discountRate taxPercentage subOrders"
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

    const orders = await searchInvoiceRows(q, limit, req.user.id);
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
    const filter = { createdBy: req.user.id };

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
        createdBy: req.user.id,
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
          "orderNumber orderDate companyName gstNumber Address State City pinCode stateCode paymentTerms"
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

    const excludeCreditNoteId = String(req.query.excludeCreditNoteId || "").trim();
    const { map, total } = await getPreviouslyCredited(
      order._id,
      null,
      excludeCreditNoteId || null,
      req.user.id
    );
    const invoiceTotal = getOrderInvoiceTotal(order);

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

    let editableDueAmount = Number(order.dueAmount || 0);
    if (excludeCreditNoteId && mongoose.isValidObjectId(excludeCreditNoteId)) {
      const excluded = await CreditNote.findOne({
        _id: excludeCreditNoteId,
        originalOrderId: order._id,
        createdBy: req.user.id,
      }).select("settlement.adjustmentAmount").lean();
      if (excluded) {
        editableDueAmount = Math.max(
          0,
          round2(editableDueAmount + Number(excluded.settlement?.adjustmentAmount || 0))
        );
      }
    }

    return res.json({
      order: {
        ...order,
        dueAmount: editableDueAmount,
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function creditDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function creditMoney(value) {
  return `₹ ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function creditWords(value) {
  const ones=["Zero","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  const below100=n=>n<20?ones[n]:tens[Math.floor(n/10)]+(n%10?` ${ones[n%10]}`:"");
  let amount=Math.max(0,Number(value||0));
  const rupees=Math.floor(amount);
  let n=rupees;
  const parts=[];
  const crore=Math.floor(n/10000000); if(crore){parts.push(`${below100(crore)} Crore`);n%=10000000;}
  const lakh=Math.floor(n/100000); if(lakh){parts.push(`${below100(lakh)} Lakh`);n%=100000;}
  const thousand=Math.floor(n/1000); if(thousand){parts.push(`${below100(thousand)} Thousand`);n%=1000;}
  const hundred=Math.floor(n/100); if(hundred){parts.push(`${ones[hundred]} Hundred`);n%=100;}
  if(n)parts.push(below100(n));
  let result=`Indian Rupees ${parts.length?parts.join(" "):"Zero"}`;
  const paise=Math.round((amount-rupees)*100);
  if(paise)result+=` and ${below100(paise)} Paise`;
  return result+" Only";
}

function renderCreditNoteHtml(note, profile, order) {
  const items=Array.isArray(note.items)?note.items:[];
  const totals=note.totals||{};
  const settlement=note.settlement||{};
  const itemRows=items.length?items.map((item,index)=>{
    const qty=item.qtyUnit==="MTR"
      ? `${Number(item.MTR||0).toFixed(2)} MTR`
      : `${Number(item.quantity||0).toFixed(2)} ${item.qtyUnit||"PCS"}`;
    return `<tr>
      <td>${index+1}</td>
      <td>${escapeHtml(item.designNumber||"-")}</td>
      <td>${escapeHtml(item.orderName||"-")}</td>
      <td>${escapeHtml(item.hsnCode??"-")}</td>
      <td>${qty}</td>
      <td class="num">${creditMoney(item.unitPrice)}</td>
      <td class="num">${Number(item.discountRate||0).toFixed(2)}%</td>
      <td class="num">${Number(item.taxRate||0).toFixed(2)}%</td>
      <td class="num">${creditMoney(item.taxableAmount)}</td>
      <td class="num">${creditMoney(item.taxAmount)}</td>
      <td class="num">${creditMoney(item.lineTotal)}</td>
    </tr>`;
  }).join(""):`<tr><td colspan="11" class="empty">Amount-based Credit Note</td></tr>`;

  const customerAddress=[note.Address,note.City,note.State,note.pinCode].filter(Boolean).join(", ");
  const originalTotal=Number(note.originalInvoiceTotal||getOrderInvoiceTotal(order));
  const cancelled=note.status==="Cancelled";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Credit Note ${escapeHtml(note.creditNoteNumber||"")}</title>
<style>
@page{size:A4;margin:10mm}
*{box-sizing:border-box}
body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#111827;background:#f3f4f6;font-size:11px}
.page{width:210mm;min-height:277mm;margin:12px auto;background:#fff;padding:12mm;position:relative}
.header{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #111827;padding-bottom:14px}
.company{flex:1}.company-name{font-size:22px;font-weight:800}.company-title{font-weight:600;color:#4b5563;margin-top:2px}
.company-meta{color:#4b5563;line-height:1.5;margin-top:6px}
.document{text-align:right;min-width:245px}.document-title{font-size:25px;font-weight:900;letter-spacing:.6px}
.meta{display:flex;justify-content:flex-end;gap:8px;margin-top:3px}.meta span{color:#6b7280}.meta strong{color:#111827}
.status{display:inline-block;margin-top:7px;padding:4px 9px;border:1px solid #6b7280;font-weight:800;font-size:9px}
.cancelled{border-color:#b91c1c;color:#b91c1c}
.stamp{position:absolute;right:50px;top:125px;transform:rotate(-14deg);border:4px solid #b91c1c;color:#b91c1c;padding:8px 15px;font-size:25px;font-weight:900;letter-spacing:2px;opacity:.16}
.grid{display:grid;grid-template-columns:1.2fr .8fr;gap:12px;margin:14px 0}
.box{border:1px solid #d1d5db;border-radius:5px;padding:10px}.label{text-transform:uppercase;color:#6b7280;font-size:9px;font-weight:800;letter-spacing:.7px;margin-bottom:5px}
.bold{font-weight:800}.muted{color:#6b7280}
table{width:100%;border-collapse:collapse}th{background:#111827;color:#fff;padding:6px;font-size:9px;text-align:left}td{border:1px solid #d1d5db;padding:6px;vertical-align:top}.num{text-align:right;white-space:nowrap}
.empty{text-align:center;color:#6b7280;padding:18px}
.bottom{display:grid;grid-template-columns:1fr 290px;gap:15px;margin-top:14px}
.settlement-row,.total-row{display:flex;justify-content:space-between;gap:10px;padding:4px 0}
.amount-words{margin-top:11px;padding-top:9px;border-top:1px dashed #d1d5db}
.grand{border-top:2px solid #111827;margin-top:5px;padding-top:8px;font-size:16px;font-weight:900}
.note{margin-top:10px;padding:8px;background:#f8fafc;border-left:3px solid #111827}
.footer{display:flex;justify-content:space-between;gap:20px;border-top:1px solid #d1d5db;margin-top:20px;padding-top:12px}
.signature{text-align:center;min-width:200px;padding-top:24px}.print-footer{text-align:center;color:#6b7280;font-size:9px;margin-top:15px}
@media print{body{background:#fff}.page{margin:0;padding:0;width:auto;min-height:auto}.no-print{display:none}}
</style>
</head>
<body>
<div class="page">
  ${cancelled?'<div class="stamp">CANCELLED</div>':""}
  <div class="header">
    <div class="company">
      <div class="company-name">${escapeHtml(profile.companyName||"Company")}</div>
      ${profile.headerTitle?`<div class="company-title">${escapeHtml(profile.headerTitle)}</div>`:""}
      <div class="company-meta">${escapeHtml(profile.companyAddress||"")}</div>
      ${profile.phoneNumber1?`<div class="company-meta">Phone: ${escapeHtml(profile.phoneNumber1)}</div>`:""}
      ${profile.phoneNumber2?`<div class="company-meta">Phone: ${escapeHtml(profile.phoneNumber2)}</div>`:""}
      ${profile.gstin?`<div class="company-meta">GSTIN: ${escapeHtml(profile.gstin)}</div>`:""}
      ${profile.pan?`<div class="company-meta">PAN: ${escapeHtml(profile.pan)}</div>`:""}
    </div>
    <div class="document">
      <div class="document-title">CREDIT NOTE</div>
      <div class="meta"><span>Credit Note No.</span><strong>${escapeHtml(note.creditNoteNumber||"-")}</strong></div>
      <div class="meta"><span>Date</span><strong>${creditDate(note.creditNoteDate)}</strong></div>
      <div class="meta"><span>Reason</span><strong>${escapeHtml(note.reason||"-")}</strong></div>
      <div class="status ${cancelled?"cancelled":""}">${escapeHtml(note.status||"Posted").toUpperCase()}</div>
    </div>
  </div>

  <div class="grid">
    <div class="box">
      <div class="label">Recipient / Customer</div>
      <div class="bold">${escapeHtml(note.companyName||"-")}</div>
      <div>${escapeHtml(customerAddress||"-")}</div>
      <div class="muted">GSTIN: ${escapeHtml(note.gstNumber||"-")}</div>
    </div>
    <div class="box">
      <div class="label">Corresponding Tax Invoice</div>
      <div><span class="muted">Invoice No.:</span> <strong>${escapeHtml(note.originalInvoiceNumber||order?.orderNumber||"-")}</strong></div>
      <div><span class="muted">Invoice Date:</span> ${creditDate(note.originalInvoiceDate||order?.orderDate)}</div>
      <div><span class="muted">Invoice Total:</span> ${creditMoney(originalTotal)}</div>
      ${order?.paymentTerms?`<div><span class="muted">Payment Terms:</span> ${escapeHtml(order.paymentTerms)}</div>`:""}
    </div>
  </div>

  <table>
    <thead><tr><th>#</th><th>Design</th><th>Description</th><th>HSN</th><th>Qty</th><th>Rate</th><th>Disc.</th><th>Tax Rate</th><th>Taxable</th><th>Tax</th><th>Amount</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="bottom">
    <div>
      <div class="box">
        <div class="label">Settlement</div>
        <div class="settlement-row"><span>Adjustment against invoice</span><strong>${creditMoney(settlement.adjustmentAmount)}</strong></div>
        <div class="settlement-row"><span>Refund</span><strong>${creditMoney(settlement.refundAmount)}</strong></div>
        ${Number(settlement.refundAmount||0)>0?`<div class="settlement-row"><span>Refund Method</span><strong>${escapeHtml(settlement.refundMethod||"-")}</strong></div>`:""}
        ${Number(settlement.customerCreditAmount||0)>0?`<div class="settlement-row"><span>Customer Credit</span><strong>${creditMoney(settlement.customerCreditAmount)}</strong></div>`:""}
      </div>
      ${note.note?`<div class="note"><strong>Note:</strong> ${escapeHtml(note.note)}</div>`:""}
      <div class="amount-words"><div class="label">Amount in Words</div><strong>${escapeHtml(creditWords(totals.grandTotal))}</strong></div>
    </div>
    <div class="box">
      <div class="total-row"><span>Subtotal</span><span>${creditMoney(totals.subtotal)}</span></div>
      <div class="total-row"><span>Discount</span><span>${creditMoney(totals.discountAmount)}</span></div>
      <div class="total-row"><span>Taxable Amount</span><span>${creditMoney(totals.taxableAmount)}</span></div>
      <div class="total-row"><span>Tax</span><span>${creditMoney(totals.taxAmount)}</span></div>
      <div class="total-row"><span>Round Off</span><span>${creditMoney(totals.roundOff)}</span></div>
      <div class="total-row grand"><span>Total Credit</span><span>${creditMoney(totals.grandTotal)}</span></div>
    </div>
  </div>

  <div class="footer">
    <div>
      ${profile.bankName?`<div class="bold">${escapeHtml(profile.bankName)}</div>`:""}
      ${profile.accountNo?`<div>A/C No.: ${escapeHtml(profile.accountNo)}</div>`:""}
      ${profile.branchName?`<div>Branch: ${escapeHtml(profile.branchName)}</div>`:""}
      ${profile.ifsc?`<div>IFSC: ${escapeHtml(profile.ifsc)}</div>`:""}
    </div>
    <div class="signature">Authorized Signatory<br><span class="muted">${escapeHtml(profile.companyName||"")}</span></div>
  </div>
  <div class="print-footer">This Credit Note is issued with reference to the corresponding tax invoice shown above.</div>
</div>
<script>window.addEventListener("load",()=>setTimeout(()=>{window.focus();window.print()},200));</script>
</body>
</html>`;
}

/** GET /api/credit-notes/:id/print */
router.get("/:id/print", auth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid credit note ID." });
    }

    const note = await CreditNote.findOne({
      _id: req.params.id,
      createdBy: req.user.id,
    }).lean();

    if (!note) return res.status(404).json({ message: "Credit note not found." });

    const order = await Order.findOne({
      _id: note.originalOrderId,
      createdBy: req.user.id,
    })
      .select("orderNumber orderDate paymentTerms")
      .lean();

    const profile = (await require("../models/Profile")
      .findOne({ createdBy: req.user.id })
      .lean()) || {};

    res.set("Cache-Control", "no-store");
    return res.type("html").send(renderCreditNoteHtml(note, profile, order));
  } catch (error) {
    console.error("Credit note print error:", error);
    return res.status(500).json({
      message: error?.message || "Unable to generate Credit Note print view.",
    });
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
        "orderNumber orderDate companyName gstNumber Address State City pinCode stateCode payments paidAmount dueAmount roundOffFinalRevenue finalRevenue totalAmount"
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

  // Atlas/replica-set deployments get full MongoDB transactions. Local standalone
  // MongoDB instances use a sequential fallback so development is not blocked.
  const transactional = isReplicaSetAvailable();
  const session = transactional ? await mongoose.startSession() : null;
  const appliedStockChanges = [];
  let customerCreditAdded = 0;
  let customerCreditClientId = null;
  let orderForRollback = null;
  let originalCreditApplied = 0;
  let originalCreditNoteCount = 0;
  let orderUpdated = false;
  let orderAfterWrite = null;
  let noteSavedId = null;

  try {
    if (session) session.startTransaction();

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
    orderForRollback = order;
    originalCreditApplied = Number(order.creditAppliedAmount || 0);
    originalCreditNoteCount = Number(order.creditNoteCount || 0);

    const { map: previousCredits, total: previousCreditTotal } =
      await getPreviouslyCredited(originalOrderId, session, null, userId);

    const invoiceTotal = getOrderInvoiceTotal(order);
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
    if (exceedsCurrencyLimit(grandTotal, remainingCreditTotal)) {
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
        getOrderInvoiceTotal(order) -
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

        const updatedProduct = await Product.findOneAndUpdate(
          { _id: item.productId, createdBy: userId },
          { $inc: { quantity: stockQty } },
          { new: true, session }
        );

        if (!updatedProduct) {
          throw new Error(`Product not found for ${item.orderName || item.designNumber || "item"}.`);
        }

        appliedStockChanges.push({ productId: item.productId, quantity: stockQty });
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
    if (duplicate) {
      const conflict = new Error("Credit Note number already exists.");
      conflict.status = 409;
      throw conflict;
    }

    if (finalSettlement.customerCreditAmount > 0) {
      if (!order.clientId) {
        throw new Error("Customer credit requires the invoice to have a clientId.");
      }
      await applyCustomerCreditChange({
        clientId: order.clientId,
        userId,
        amount: finalSettlement.customerCreditAmount,
        session,
        notFoundMessage: "Customer for this Credit Note was not found in your account.",
        missingBalanceMessage: "Add Client.creditBalance to your Client schema before using Customer Credit settlement."
      });
      customerCreditAdded = Number(finalSettlement.customerCreditAmount);
      customerCreditClientId = order.clientId;
    }

    const nextCreditApplied = round2(
      Number(order.creditAppliedAmount || 0) +
        finalSettlement.adjustmentAmount
    );
    const updatedOrder = await Order.findOneAndUpdate(
      buildInvoiceCreditWriteFilter(order, userId),
      {
        $set: { creditAppliedAmount: nextCreditApplied },
        $inc: { creditNoteCount: 1 },
      },
      { new: true, runValidators: true, session }
    );
    if (!updatedOrder) {
      const conflict = new Error(
        "This invoice changed while the Credit Note was being posted. Refresh the invoice and try again."
      );
      conflict.status = 409;
      throw conflict;
    }
    orderAfterWrite = updatedOrder;
    orderUpdated = true;

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
        meetsCurrencyTarget(settled, grandTotal) ? "Settled" : "Partially Settled",
      note: String(note || "").trim(),
      createdBy: userId,
    });

    await noteDoc.save(session ? { session } : undefined);
    noteSavedId = noteDoc._id;

    // Resolve the response before committing so a response-shaping query cannot
    // make a successfully committed credit note look like a failed operation.
    const saved = await CreditNote.findById(noteDoc._id)
      .populate(
        "originalOrderId",
        "orderNumber orderDate companyName gstNumber Address State City pinCode stateCode paymentTerms roundOffFinalRevenue finalRevenue dueAmount creditAppliedAmount"
      )
      .session(session || null)
      .lean();

    if (session) await session.commitTransaction();
    await syncClientDataSafely(noteDoc.clientId);

    return res.status(201).json({
      message: "Credit note created successfully.",
      creditNote: {
        ...saved,
        originalOrder: saved.originalOrderId,
      },
    });
  } catch (error) {
    if (session) {
      try {
        if (session.inTransaction()) await session.abortTransaction();
      } catch {
        // Transaction may already be closed.
      }
    }

    if (!session) {
      // Standalone MongoDB does not support multi-document transactions. Undo
      // only the changes made by this request if a later write fails.
      if (noteSavedId) {
        try {
          await CreditNote.deleteOne({ _id: noteSavedId, createdBy: userId });
        } catch (rollbackError) {
          console.error("Credit note rollback could not remove the note:", rollbackError);
        }
      }
      if (orderUpdated && orderForRollback) {
        try {
          const restoredOrder = await Order.findOneAndUpdate(
            buildInvoiceCreditWriteFilter(orderAfterWrite, userId),
            { $set: { creditAppliedAmount: originalCreditApplied, creditNoteCount: originalCreditNoteCount } },
            { new: true, runValidators: true }
          );
          if (!restoredOrder) {
            console.error("Credit Note rollback skipped invoice restoration because the invoice changed again.");
          }
        } catch (rollbackError) {
          console.error("Credit note rollback could not restore invoice balances:", rollbackError);
        }
      }
      if (customerCreditAdded > 0 && customerCreditClientId) {
        try {
          const Client = require("../models/Client");
          await Client.findOneAndUpdate(
            { _id: customerCreditClientId, createdBy: userId },
            { $inc: { creditBalance: -customerCreditAdded, financialSummaryVersion: 1 } },
            { new: true }
          );
        } catch (rollbackError) {
          console.error("Credit note rollback could not restore customer credit:", rollbackError);
        }
      }
      if (appliedStockChanges.length) {
        try {
          const Product = require("../models/Product");
          for (const movement of appliedStockChanges.reverse()) {
            await Product.findOneAndUpdate(
              { _id: movement.productId, createdBy: userId },
              { $inc: { quantity: -Number(movement.quantity || 0) } },
              { new: true }
            );
          }
        } catch (rollbackError) {
          console.error("Credit note rollback could not restore stock:", rollbackError);
        }
      }
    }

    console.error("Credit note create error:", error);
    const status =
      Number(error?.status) ||
      (error?.code === 11000
        ? 409
        : /authentication required/i.test(error?.message || "")
        ? 401
        : /not found|invalid|cannot|requires|exceed|exceeded|allocate|enter|product|stock|settlement|credit note number/i.test(
            error?.message || ""
          )
        ? 400
        : 500);

    return res.status(status).json({
      message: error?.message || "Unable to create credit note.",
    });
  } finally {
    if (session) await session.endSession();
  }
});

async function prepareCreditNoteUpdate({
  order, reason, creditMode, items, manualCredit, stockAffecting, settlement, excludeCreditNoteId, session,
}) {
  if (!REASONS.includes(reason)) throw new Error("Invalid credit note reason.");
  if (!MODES.includes(creditMode)) throw new Error("Invalid credit mode.");
  if (!order) throw new Error("Original invoice not found.");

  const { map: previousCredits, total: previousCreditTotal } =
    await getPreviouslyCredited(order._id, session, excludeCreditNoteId, order.createdBy);

  const invoiceTotal = getOrderInvoiceTotal(order);
  const remainingCreditTotal = Math.max(0, round2(invoiceTotal - previousCreditTotal));
  if (remainingCreditTotal <= EPSILON) throw new Error("This invoice has no remaining creditable value.");

  const finalItems = [];
  let subtotal = 0, discountAmount = 0, taxableAmount = 0, taxAmount = 0;

  if (creditMode === "ITEM") {
    if (!Array.isArray(items) || !items.length) throw new Error("At least one item is required for item-based credit.");
    const seen = new Set();

    for (const requested of items) {
      const sourceId = String(requested?.sourceSubOrderId || "");
      if (!sourceId || seen.has(sourceId)) throw new Error("Each invoice item can appear only once.");
      seen.add(sourceId);

      const source = order.subOrders.id(sourceId);
      if (!source) throw new Error("One or more selected invoice items are invalid.");

      const qtyUnit = source.qtyUnit || "PCS";
      const quantity = requestedQty(requested, qtyUnit);
      const billedQty = invoiceBilledQty(source);
      const previousQty = qtyUnit === "MTR"
        ? Number(previousCredits.get(sourceId)?.MTR || 0)
        : Number(previousCredits.get(sourceId)?.quantity || 0);
      const available = Math.max(0, round2(billedQty - previousQty));

      if (quantity <= 0) continue;
      if (quantity > available + EPSILON) {
        throw new Error(`Credit quantity exceeded for ${source.orderName || source.designNumber || "item"}. Available: ${available} ${qtyUnit}.`);
      }

      const unitPrice = Number(source.unitPrice || 0);
      const discountRate = Number(requested.discountRate ?? order.discountRate ?? 0);
      const taxRate = Number(requested.taxRate ?? order.taxPercentage ?? 0);
      if (unitPrice < 0) throw new Error("Invoice contains an invalid item rate.");
      if (discountRate < 0 || discountRate > 100) throw new Error("Invalid discount rate.");
      if (taxRate < 0 || taxRate > 100) throw new Error("Invalid tax rate.");

      const calculated = calculateLine({ quantity, unitPrice, discountRate, taxRate });
      finalItems.push({
        sourceSubOrderId: source._id,
        productId: source.productId || null,
        designNumber: source.designNumber || "",
        orderName: source.orderName || "",
        hsnCode: source.hsnCode ?? null,
        qtyUnit,
        quantity: qtyUnit === "MTR" ? 0 : quantity,
        MTR: qtyUnit === "MTR" ? quantity : 0,
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

    if (!finalItems.length) throw new Error("Enter a credit quantity for at least one item.");
  } else {
    const manualTaxable = Number(manualCredit?.taxableAmount || 0);
    const manualTaxRate = Number(manualCredit?.taxRate ?? order.taxPercentage ?? 0);
    if (manualTaxable <= 0) throw new Error("Enter a valid taxable credit amount.");
    if (manualTaxRate < 0 || manualTaxRate > 100) throw new Error("Invalid manual credit tax rate.");

    const manual = calculateManualCredit({ taxableAmount: manualTaxable, taxRate: manualTaxRate });
    subtotal = manual.taxableAmount;
    taxableAmount = manual.taxableAmount;
    taxAmount = manual.taxAmount;
  }

  subtotal = round2(subtotal);
  discountAmount = round2(discountAmount);
  taxableAmount = round2(taxableAmount);
  taxAmount = round2(taxAmount);

  const beforeRound = round2(taxableAmount + taxAmount);
  const grandTotal = Math.round(beforeRound);
  const roundOff = round2(grandTotal - beforeRound);

  if (grandTotal <= 0) throw new Error("Credit note total must be greater than zero.");
  if (exceedsCurrencyLimit(grandTotal, remainingCreditTotal)) {
    throw new Error(`Credit note amount cannot exceed the remaining invoice credit limit of ₹ ${remainingCreditTotal}.`);
  }

  const paymentTotal = (order.payments || []).reduce(
    (sum, payment) => sum + (Number(payment.amount) || 0),
    0
  );

  const oldAdjustment = excludeCreditNoteId
    ? Number((await CreditNote.findOne({ _id: excludeCreditNoteId, createdBy: order.createdBy })
      .select("settlement.adjustmentAmount")
      .session(session || null)
      .lean())?.settlement?.adjustmentAmount || 0)
    : 0;

  const replacementDue = Math.max(
    0,
    round2(getOrderInvoiceTotal(order) - paymentTotal - Number(order.creditAppliedAmount || 0) + oldAdjustment)
  );

  const finalSettlement = calculateSettlement(settlement, grandTotal, replacementDue);

  if (Boolean(stockAffecting) && (reason !== "Sales Return" || creditMode !== "ITEM")) {
    throw new Error("Stock return is allowed only for item-based Sales Return credits.");
  }

  const inventoryMovements = [];
  let inventoryStatus = "Not Applicable";

  if (Boolean(stockAffecting)) {
    let Product;
    try { Product = require("../models/Product"); }
    catch { throw new Error("Product model not found. Stock return cannot be enabled."); }

    if (!Product.schema.path("quantity")) throw new Error("Product.quantity field was not found.");

    for (const item of finalItems) {
      if (!item.productId) throw new Error(`Product mapping is missing for ${item.orderName || item.designNumber || "an invoice item"}.`);
      const stockQty = item.qtyUnit === "MTR" ? Number(item.MTR || 0) : Number(item.quantity || 0);
      if (stockQty <= 0) continue;

      const product = await Product.findOne({ _id: item.productId, createdBy: order.createdBy })
        .select("_id quantity")
        .session(session || null)
        .lean();
      if (!product) throw new Error(`Product not found for ${item.orderName || item.designNumber || "item"}.`);

      inventoryMovements.push({ productId: item.productId, unit: item.qtyUnit, quantity: stockQty });
    }

    inventoryStatus = "Processed";
  }

  const settled = round2(
    finalSettlement.adjustmentAmount +
    finalSettlement.refundAmount +
    finalSettlement.customerCreditAmount
  );

  return {
    invoiceTotal, finalItems, subtotal, discountAmount, taxableAmount, taxAmount,
    roundOff, grandTotal, finalSettlement, settled, inventoryStatus, inventoryMovements,
  };
}

/** PUT /api/credit-notes/:id */
router.put("/:id", auth, async (req, res) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) return res.status(401).json({ message: "Authentication required." });
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid credit note ID." });
  }

  const transactional = isReplicaSetAvailable();
  const session = transactional ? await mongoose.startSession() : null;
  const changedStock = [];
  const changedCustomerCredit = [];
  let previousOrderFinancials = null;
  let previousOrderId = null;
  let previousNote = null;
  let orderSaved = false;
  let orderAfterWrite = null;
  let noteAfterWrite = null;
  let noteSaved = false;

  try {
    if (session) session.startTransaction();

    const note = await CreditNote.findOne({
      _id: req.params.id,
      createdBy: userId,
    }).session(session);

    if (!note) throw new Error("Credit note not found.");
    if (note.status !== "Posted") throw new Error("Only posted Credit Notes can be edited.");

    // The original invoice link is kept fixed because the document is an issued
    // financial reference. All Credit Note content, amounts, quantities and
    // settlement information can be changed and are recalculated server-side.
    const order = await Order.findOne({
      _id: note.originalOrderId,
      createdBy: userId,
    }).session(session);
    if (!order) throw new Error("Original invoice no longer exists.");
    previousNote = note.toObject();
    previousOrderId = order._id;
    previousOrderFinancials = {
      creditAppliedAmount: Number(order.creditAppliedAmount || 0),
      creditNoteCount: Number(order.creditNoteCount || 0),
    };

    const dateValue = req.body?.creditNoteDate !== undefined
      ? new Date(req.body.creditNoteDate)
      : new Date(note.creditNoteDate);
    if (Number.isNaN(dateValue.getTime())) throw new Error("Invalid credit note date.");

    const number = String(req.body?.creditNoteNumber ?? note.creditNoteNumber ?? "").trim().toUpperCase();
    if (!number) throw new Error("Credit Note number is required.");
    if (number.length > 16) throw new Error("Credit Note number cannot exceed 16 characters.");

    const duplicate = await CreditNote.findOne({
      creditNoteNumber: number,
      _id: { $ne: note._id },
    }).session(session).lean();
    if (duplicate) {
      const conflict = new Error("Credit Note number already exists.");
      conflict.status = 409;
      throw conflict;
    }

    const reason = req.body?.reason ?? note.reason;
    const creditMode = req.body?.creditMode ?? note.creditMode;
    const stockAffecting = req.body?.stockAffecting !== undefined
      ? Boolean(req.body.stockAffecting)
      : Boolean(note.stockAffecting);

    const settlement = req.body?.settlement || {
      adjustmentType: note.settlement?.adjustmentType || "Outstanding",
      adjustmentAmount: Number(note.settlement?.adjustmentAmount || 0),
      refundMethod: note.settlement?.refundMethod || null,
      refundAmount: Number(note.settlement?.refundAmount || 0),
      customerCreditAmount: Number(note.settlement?.customerCreditAmount || 0),
    };

    const manualCredit = req.body?.manualCredit || {
      taxableAmount: Number(note.manualCredit?.taxableAmount || 0),
      taxRate: Number(note.manualCredit?.taxRate ?? order.taxPercentage ?? 0),
    };

    const requestedItems = Array.isArray(req.body?.items)
      ? req.body.items
      : (note.items || []).map(item => ({
          sourceSubOrderId: item.sourceSubOrderId,
          quantity: item.quantity,
          MTR: item.MTR,
          discountRate: item.discountRate,
          taxRate: item.taxRate,
        }));

    const prepared = await prepareCreditNoteUpdate({
      order, reason, creditMode, items: requestedItems, manualCredit,
      stockAffecting, settlement, excludeCreditNoteId: note._id, session,
    });

    const oldAdjustment = Number(note.settlement?.adjustmentAmount || 0);
    const oldCustomerCredit = Number(note.settlement?.customerCreditAmount || 0);

    // Reverse old stock/customer-credit effects only after the replacement
    // content has passed every validation above.
    if (note.stockAffecting && note.inventoryMovements?.length) {
      const Product = require("../models/Product");
      for (const movement of note.inventoryMovements) {
        const updated = await Product.findOneAndUpdate(
          { _id: movement.productId, createdBy: userId },
          { $inc: { quantity: -Number(movement.quantity || 0) } },
          { new: true, session }
        );
        if (!updated) throw new Error("A stock product no longer exists.");
        changedStock.push({
          productId: movement.productId,
          delta: -Number(movement.quantity || 0),
        });
        if (Number(updated.quantity || 0) < -EPSILON) {
          throw new Error("Editing this Credit Note would make stock negative.");
        }
      }
    }

    const newCustomerCredit = Number(prepared.finalSettlement.customerCreditAmount || 0);
    const creditClientId = note.clientId || order.clientId;
    if (oldCustomerCredit > 0 || newCustomerCredit > 0) {
      if (!creditClientId) throw new Error("Customer credit client is missing.");
      if (newCustomerCredit > 0 && !order.clientId) {
        throw new Error("Customer credit requires an invoice client.");
      }
      if (
        note.clientId &&
        order.clientId &&
        String(note.clientId) !== String(order.clientId)
      ) {
        throw new Error("This Credit Note is linked to a different customer than its invoice.");
      }

      // Update the old and new credit as one delta. Splitting this into a
      // reversal followed by a re-add creates a temporary false balance and
      // lets a concurrent manual adjustment calculate the wrong offset.
      await applyCustomerCreditChange({
        clientId: creditClientId,
        userId,
        amount: round2(newCustomerCredit - oldCustomerCredit),
        minimumBalance: oldCustomerCredit,
        insufficientBalanceMessage: "This Credit Note cannot be changed because some of its customer credit has already been used. Restore the customer's balance first.",
        notFoundMessage: "Customer for this Credit Note no longer exists.",
        missingBalanceMessage: "Client.creditBalance is required for this Credit Note.",
        session
      });
      changedCustomerCredit.push({
        clientId: creditClientId,
        delta: round2(newCustomerCredit - oldCustomerCredit),
      });
    }

    order.creditAppliedAmount = Math.max(
      0,
      round2(Number(order.creditAppliedAmount || 0) - oldAdjustment)
    );

    const nextCreditApplied = round2(
      Number(order.creditAppliedAmount || 0) +
      prepared.finalSettlement.adjustmentAmount
    );

    if (prepared.inventoryMovements.length) {
      const Product = require("../models/Product");
      for (const movement of prepared.inventoryMovements) {
        const updated = await Product.findOneAndUpdate(
          { _id: movement.productId, createdBy: userId },
          { $inc: { quantity: Number(movement.quantity || 0) } },
          { new: true, session }
        );
        if (!updated) throw new Error("A stock product no longer exists.");
        changedStock.push({
          productId: movement.productId,
          delta: Number(movement.quantity || 0),
        });
      }
    }

    const updatedOrder = await Order.findOneAndUpdate(
      buildInvoiceCreditWriteFilter(order, userId),
      { $set: { creditAppliedAmount: nextCreditApplied } },
      { new: true, runValidators: true, session }
    );
    if (!updatedOrder) {
      const conflict = new Error(
        "This invoice changed while the Credit Note was being edited. Refresh the invoice and try again."
      );
      conflict.status = 409;
      throw conflict;
    }
    orderAfterWrite = updatedOrder;
    orderSaved = true;

    note.creditNoteNumber = number;
    note.creditNoteDate = dateValue;
    note.reason = reason;
    note.creditMode = creditMode;
    note.stockAffecting = stockAffecting;
    note.inventoryStatus = prepared.inventoryStatus;
    note.inventoryMovements = prepared.inventoryMovements;
    note.settlement = prepared.finalSettlement;
    note.items = prepared.finalItems;
    note.totals = {
      subtotal: prepared.subtotal,
      discountAmount: prepared.discountAmount,
      taxableAmount: prepared.taxableAmount,
      taxAmount: prepared.taxAmount,
      roundOff: prepared.roundOff,
      grandTotal: prepared.grandTotal,
    };
    note.originalInvoiceTotal = prepared.invoiceTotal;
    note.manualCredit = creditMode === "AMOUNT"
      ? {
          taxableAmount: prepared.taxableAmount,
          taxRate: Number(manualCredit?.taxRate ?? order.taxPercentage ?? 0),
          taxAmount: prepared.taxAmount,
        }
      : {
          taxableAmount: 0,
          taxRate: Number(order.taxPercentage || 0),
          taxAmount: 0,
        };
    note.settlementStatus =
      meetsCurrencyTarget(prepared.settled, prepared.grandTotal) ? "Settled" : "Partially Settled";
    note.note = String(req.body?.note ?? note.note ?? "").trim().slice(0, 1000);

    const noteUpdateFields = {
      creditNoteNumber: note.creditNoteNumber,
      creditNoteDate: note.creditNoteDate,
      reason: note.reason,
      creditMode: note.creditMode,
      stockAffecting: note.stockAffecting,
      inventoryStatus: note.inventoryStatus,
      inventoryMovements: note.inventoryMovements,
      settlement: note.settlement,
      items: note.items,
      totals: note.totals,
      originalInvoiceTotal: note.originalInvoiceTotal,
      manualCredit: note.manualCredit,
      settlementStatus: note.settlementStatus,
      note: note.note,
    };
    const savedNote = await CreditNote.findOneAndUpdate(
      {
        _id: note._id,
        createdBy: userId,
        status: "Posted",
        updatedAt: previousNote.updatedAt,
      },
      { $set: noteUpdateFields },
      { new: true, runValidators: true, session }
    );
    if (!savedNote) {
      const conflict = new Error(
        "This Credit Note changed while it was being edited. Reload it and try again."
      );
      conflict.status = 409;
      throw conflict;
    }
    noteAfterWrite = savedNote;
    noteSaved = true;

    // Shape the response before committing. A later read failure must not make
    // a successfully saved financial change look like a failed request.
    const originalOrder = orderAfterWrite.toObject();
    const updatedNote = noteAfterWrite.toObject();
    const responseBody = {
      message: "Credit Note updated successfully.",
      creditNote: {
        ...updatedNote,
        originalOrderId: originalOrder,
        originalOrder,
      },
    };

    if (session) await session.commitTransaction();
    await syncClientDataSafely(order.clientId, "a Credit Note edit");
    return res.json(responseBody);
  } catch (error) {
    if (session) {
      try { if (session.inTransaction()) await session.abortTransaction(); } catch {}
    } else {
      // Standalone MongoDB has no multi-document rollback. Best-effort inverse
      // writes restore only the effects this request had already applied.
      if (noteSaved && previousNote) {
        try {
          const restoreNoteFields = {};
          [
            "creditNoteNumber", "creditNoteDate", "reason", "creditMode",
            "stockAffecting", "inventoryStatus", "inventoryMovements",
            "settlement", "items", "totals", "originalInvoiceTotal",
            "manualCredit", "settlementStatus", "note"
          ].forEach(key => { restoreNoteFields[key] = previousNote[key]; });
          const restoredNote = await CreditNote.findOneAndUpdate(
            { _id: req.params.id, createdBy: userId, status: "Posted", updatedAt: noteAfterWrite.updatedAt },
            { $set: restoreNoteFields },
            { new: true, runValidators: true }
          );
          if (!restoredNote) console.error("Credit Note edit rollback skipped note restoration because it changed again.");
        } catch (rollbackError) {
          console.error("Credit Note edit rollback could not restore the note:", rollbackError);
        }
      }
      if (orderSaved && previousOrderFinancials && previousOrderId) {
        try {
          const restoredOrder = await Order.findOneAndUpdate(
            buildInvoiceCreditWriteFilter(orderAfterWrite, userId),
            { $set: previousOrderFinancials },
            { new: true, runValidators: true }
          );
          if (!restoredOrder) {
            console.error("Credit Note edit rollback skipped invoice restoration because the invoice changed again.");
          }
        } catch (rollbackError) {
          console.error("Credit Note edit rollback could not restore invoice balances:", rollbackError);
        }
      }
      for (const change of changedStock.reverse()) {
        try {
          await require("../models/Product").findOneAndUpdate(
            { _id: change.productId, createdBy: userId },
            { $inc: { quantity: -Number(change.delta || 0) } },
            { new: true }
          );
        } catch (rollbackError) {
          console.error("Credit Note edit rollback could not restore stock:", rollbackError);
        }
      }
      for (const change of changedCustomerCredit.reverse()) {
        try {
          await require("../models/Client").findOneAndUpdate(
            { _id: change.clientId, createdBy: userId },
            { $inc: { creditBalance: -Number(change.delta || 0), financialSummaryVersion: 1 } },
            { new: true }
          );
        } catch (rollbackError) {
          console.error("Credit Note edit rollback could not restore customer credit:", rollbackError);
        }
      }
    }
    console.error("Credit note update error:", error);
    return res.status(error.status || (error.code === 11000 ? 409 : 400)).json({ message: error.message || "Unable to update Credit Note." });
  } finally {
    if (session) await session.endSession();
  }
});


async function cancelCreditNote(req, res) {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid credit note ID." });
  }

  const transactional = isReplicaSetAvailable();
  const session = transactional ? await mongoose.startSession() : null;
  const changedStock = [];
  const changedCustomerCredit = [];
  let previousNote = null;
  let previousOrderFinancials = null;
  let previousOrderId = null;
  let orderUpdated = false;
  let orderAfterWrite = null;
  let noteAfterWrite = null;
  let noteSaved = false;

  try {
    if (session) session.startTransaction();

    const note = await CreditNote.findOne({ _id: req.params.id, createdBy: userId }).session(session);
    if (!note) throw new Error("Credit note not found.");
    if (note.status === "Cancelled") throw new Error("Credit note is already cancelled.");
    if (note.status !== "Posted") throw new Error("Only posted credit notes can be cancelled.");
    previousNote = note.toObject();

    const order = await Order.findOne({ _id: note.originalOrderId, createdBy: userId }).session(session);
    if (!order) throw new Error("Original invoice no longer exists.");
    previousOrderId = order._id;
    previousOrderFinancials = {
      creditAppliedAmount: Number(order.creditAppliedAmount || 0),
      creditNoteCount: Number(order.creditNoteCount || 0),
    };

    const adjustmentAmount = Number(note.settlement?.adjustmentAmount || 0);
    const currentCreditApplied = Number(order.creditAppliedAmount || 0);
    const nextCreditApplied = Math.max(
      0,
      round2(currentCreditApplied - adjustmentAmount)
    );

    if (note.stockAffecting && note.inventoryMovements?.length) {
      let Product;
      try {
        Product = require("../models/Product");
      } catch {
        throw new Error("Product model not found; cannot reverse stock movement.");
      }

      for (const movement of note.inventoryMovements) {
        const updated = await Product.findOneAndUpdate(
          { _id: movement.productId, createdBy: userId },
          { $inc: { quantity: -Number(movement.quantity || 0) } },
          { new: true, session }
        );
        if (!updated) throw new Error("A stock product no longer exists.");
        changedStock.push({
          productId: movement.productId,
          delta: -Number(movement.quantity || 0),
        });
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
      const creditToReverse = Number(note.settlement.customerCreditAmount);
      await applyCustomerCreditChange({
        clientId: note.clientId,
        userId,
        amount: -creditToReverse,
        minimumBalance: creditToReverse,
        insufficientBalanceMessage: "This Credit Note cannot be cancelled because some of its customer credit has already been used. Restore the customer's balance first.",
        notFoundMessage: "Customer for this Credit Note was not found in your account.",
        missingBalanceMessage: "Client.creditBalance is required to reverse this customer credit.",
        session
      });
      changedCustomerCredit.push({
        clientId: note.clientId,
        delta: -creditToReverse,
      });
    }

    const updatedOrder = await Order.findOneAndUpdate(
      buildInvoiceCreditWriteFilter(order, userId),
      {
        $set: {
          creditAppliedAmount: nextCreditApplied,
          creditNoteCount: Math.max(0, Number(order.creditNoteCount || 0) - 1),
        },
      },
      { new: true, runValidators: true, session }
    );
    if (!updatedOrder) {
      const conflict = new Error(
        "This invoice changed while the Credit Note was being cancelled. Refresh the invoice and try again."
      );
      conflict.status = 409;
      throw conflict;
    }
    orderAfterWrite = updatedOrder;
    orderUpdated = true;

    note.status = "Cancelled";
    note.settlementStatus = "Cancelled";
    note.cancellationReason = String(req.body?.reason || "").trim();
    note.cancelledAt = new Date();
    note.cancelledBy = userId;

    const savedNote = await CreditNote.findOneAndUpdate(
      {
        _id: note._id,
        createdBy: userId,
        status: "Posted",
        updatedAt: previousNote.updatedAt,
      },
      {
        $set: {
          status: "Cancelled",
          settlementStatus: "Cancelled",
          cancellationReason: note.cancellationReason,
          cancelledAt: note.cancelledAt,
          cancelledBy: note.cancelledBy,
          inventoryStatus: note.inventoryStatus,
        },
      },
      { new: true, runValidators: true, session }
    );
    if (!savedNote) {
      const conflict = new Error(
        "This Credit Note changed while it was being cancelled. Reload it and try again."
      );
      conflict.status = 409;
      throw conflict;
    }
    noteAfterWrite = savedNote;
    noteSaved = true;

    const orderForResponse = updatedOrder.toObject();
    const cancelledNote = noteAfterWrite.toObject();
    const responseBody = {
      message: "Credit note cancelled successfully.",
      creditNote: {
        ...cancelledNote,
        originalOrderId: orderForResponse,
        originalOrder: orderForResponse,
      },
    };

    if (session) await session.commitTransaction();
    await syncClientDataSafely(order.clientId, "a Credit Note cancellation");
    return res.json(responseBody);
  } catch (error) {
    if (session) {
      try {
        if (session.inTransaction()) await session.abortTransaction();
      } catch {}
    } else {
      if (noteSaved && previousNote) {
        try {
          const restoredNote = await CreditNote.findOneAndUpdate(
            { _id: req.params.id, createdBy: userId, status: "Cancelled", updatedAt: noteAfterWrite.updatedAt },
            { $set: {
              status: previousNote.status,
              settlementStatus: previousNote.settlementStatus,
              cancellationReason: previousNote.cancellationReason,
              cancelledAt: previousNote.cancelledAt,
              cancelledBy: previousNote.cancelledBy,
              inventoryStatus: previousNote.inventoryStatus,
            } },
            { new: true, runValidators: true }
          );
          if (!restoredNote) console.error("Credit Note cancellation rollback skipped note restoration because it changed again.");
        } catch (rollbackError) {
          console.error("Credit Note cancellation rollback could not restore the note:", rollbackError);
        }
      }
      if (orderUpdated && previousOrderFinancials && previousOrderId) {
        try {
          const restoredOrder = await Order.findOneAndUpdate(
            buildInvoiceCreditWriteFilter(orderAfterWrite, userId),
            { $set: previousOrderFinancials },
            { new: true, runValidators: true }
          );
          if (!restoredOrder) {
            console.error("Credit Note cancellation rollback skipped invoice restoration because the invoice changed again.");
          }
        } catch (rollbackError) {
          console.error("Credit Note cancellation rollback could not restore invoice balances:", rollbackError);
        }
      }
      for (const change of changedStock.reverse()) {
        try {
          await require("../models/Product").findOneAndUpdate(
            { _id: change.productId, createdBy: userId },
            { $inc: { quantity: -Number(change.delta || 0) } },
            { new: true }
          );
        } catch (rollbackError) {
          console.error("Credit Note cancellation rollback could not restore stock:", rollbackError);
        }
      }
      for (const change of changedCustomerCredit.reverse()) {
        try {
          await require("../models/Client").findOneAndUpdate(
            { _id: change.clientId, createdBy: userId },
            { $inc: { creditBalance: -Number(change.delta || 0), financialSummaryVersion: 1 } },
            { new: true }
          );
        } catch (rollbackError) {
          console.error("Credit Note cancellation rollback could not restore customer credit:", rollbackError);
        }
      }
    }
    console.error("Credit note cancellation error:", error);
    return res.status(error.status || (error.code === 11000 ? 409 : 400)).json({ message: error.message });
  } finally {
    if (session) await session.endSession();
  }
}

router.post("/:id/cancel", auth, cancelCreditNote);
router.delete("/:id", auth, cancelCreditNote);


module.exports = router;
