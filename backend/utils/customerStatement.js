const { getInvoiceRevenue } = require("./syncClientData");
const { getLegacySettlementHistory } = require("./creditNoteSettlementHistory");

const round2 = value =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

function validDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function eventDate(value, fallback) {
  return validDate(value) || validDate(fallback);
}

function getCreditNoteEvents(note = {}) {
  const existing = Array.isArray(note.settlementHistory) && note.settlementHistory.length
    ? note.settlementHistory
    : getLegacySettlementHistory(note);
  const ordered = existing
    .map((event, index) => ({
      ...event,
      effectiveAt: validDate(event.effectiveAt),
      _index: index
    }))
    .filter(event => event.effectiveAt)
    .sort((left, right) =>
      left.effectiveAt.getTime() - right.effectiveAt.getTime()
      || left._index - right._index
    );

  let previousAdjustment = 0;
  let previousCustomerCredit = 0;
  let previousRefund = 0;

  return ordered.map(event => {
    const posted = event.status !== "Cancelled";
    const nextAdjustment = posted ? round2(event.adjustmentAmount) : 0;
    const nextCustomerCredit = posted ? round2(event.customerCreditAmount) : 0;
    const nextRefund = posted ? round2(event.refundAmount) : 0;
    const result = {
      eventType: event.eventType || "legacy-snapshot",
      effectiveAt: event.effectiveAt,
      status: posted ? "Posted" : "Cancelled",
      adjustmentDelta: round2(nextAdjustment - previousAdjustment),
      customerCreditDelta: round2(nextCustomerCredit - previousCustomerCredit),
      refundDelta: round2(nextRefund - previousRefund),
      adjustmentAmount: nextAdjustment,
      customerCreditAmount: nextCustomerCredit,
      refundAmount: nextRefund,
      reconstructed: Boolean(event.reconstructed)
    };

    previousAdjustment = nextAdjustment;
    previousCustomerCredit = nextCustomerCredit;
    previousRefund = nextRefund;
    return result;
  });
}

function sortTransactions(events) {
  const priority = {
    Invoice: 1,
    "Credit Note": 2,
    Payment: 3,
    "Manual credit adjustment": 1
  };
  return events.sort((left, right) =>
    left.date.getTime() - right.date.getTime()
    || (priority[left.type] || 9) - (priority[right.type] || 9)
    || String(left.reference || "").localeCompare(String(right.reference || ""))
    || left.sequence - right.sequence
  );
}

function calculateRunningBalance(events, openingBalance, field) {
  let balance = round2(openingBalance);
  return events.map(event => {
    balance = round2(balance + Number(event[field] || 0));
    return { ...event, balanceAfter: balance };
  });
}

/**
 * Builds two separate customer ledgers:
 * 1. Invoice receivables: invoices, receipts, and Credit Note adjustments.
 * 2. Available customer credit: Credit Note wallet grants and manual changes.
 *
 * Refunds and unallocated customer credit are disclosed on Credit Note lines,
 * but do not reduce invoice receivables. This avoids treating a wallet balance
 * or a cash refund as an adjustment against an invoice.
 */
function buildCustomerStatement({
  client = {},
  orders = [],
  creditNotes = [],
  fromDate,
  toDate,
  now = new Date()
} = {}) {
  const from = validDate(fromDate) || validDate(client.createdAt) || new Date(0);
  const to = validDate(toDate) || validDate(now) || new Date();
  const nowDate = validDate(now) || new Date();
  if (from.getTime() > to.getTime()) {
    throw new RangeError("Statement start date must be on or before the end date.");
  }

  const sequence = { value: 0 };
  const receivableEvents = [];
  const walletEvents = [];
  const warnings = [];
  let excludedCancelledInvoices = 0;
  let reconstructedCreditNotes = 0;

  const activeOrders = [];
  const orderIds = new Set();
  for (const order of Array.isArray(orders) ? orders : []) {
    orderIds.add(String(order._id));
    if (order.status === "Cancelled") {
      excludedCancelledInvoices += 1;
      continue;
    }
    activeOrders.push(order);

    const invoiceDate = eventDate(order.orderDate, order.createdAt);
    if (invoiceDate) {
      receivableEvents.push({
        date: invoiceDate,
        type: "Invoice",
        reference: order.orderNumber || String(order._id || ""),
        description: "Invoice " + (order.orderNumber || ""),
        debit: round2(getInvoiceRevenue(order)),
        credit: 0,
        orderId: order._id,
        sequence: sequence.value++
      });
    }

    for (const payment of Array.isArray(order.payments) ? order.payments : []) {
      const date = eventDate(payment.paymentDate, payment.createdAt || order.orderDate);
      const amount = round2(payment.amount);
      if (!date || amount <= 0) continue;
      receivableEvents.push({
        date,
        type: "Payment",
        reference: payment.amountReference || String(payment._id || ""),
        description: "Payment received" + (payment.method ? " by " + payment.method : ""),
        debit: 0,
        credit: amount,
        orderId: order._id,
        paymentId: payment._id,
        method: payment.method || "",
        sequence: sequence.value++
      });
    }
  }

  const linkedOrderIds = new Set(activeOrders.map(order => String(order._id)));
  const noteRows = Array.isArray(creditNotes) ? creditNotes : [];
  for (const note of noteRows) {
    const noteEvents = getCreditNoteEvents(note);
    if (noteEvents.some(event => event.reconstructed)) reconstructedCreditNotes += 1;
    const noteNumber = String(note.creditNoteNumber || note._id || "Credit Note");
    const isLinkedInvoice = linkedOrderIds.has(String(note.originalOrderId || ""));
    const isLinkedWallet = String(note.clientId || "") === String(client._id || "")
      || (!note.clientId && orderIds.has(String(note.originalOrderId || "")));

    for (const event of noteEvents) {
      const eventDescription = event.eventType === "cancelled"
        ? "Credit Note cancelled"
        : event.eventType === "edited"
          ? "Credit Note settlement edited"
          : "Credit Note issued";
      const settlementDetails = [
        "adjustment " + round2(event.adjustmentAmount).toFixed(2),
        "refund " + round2(event.refundAmount).toFixed(2),
        "customer credit " + round2(event.customerCreditAmount).toFixed(2)
      ].join(", ");

      if (isLinkedInvoice && (
        Math.abs(event.adjustmentDelta) >= 0.005
        || Math.abs(event.customerCreditDelta) >= 0.005
        || Math.abs(event.refundDelta) >= 0.005
      )) {
        receivableEvents.push({
          date: event.effectiveAt,
          type: "Credit Note",
          reference: noteNumber,
          description: eventDescription + " (" + settlementDetails + ")",
          debit: Math.max(0, round2(-event.adjustmentDelta)),
          credit: Math.max(0, round2(event.adjustmentDelta)),
          orderId: note.originalOrderId,
          creditNoteId: note._id,
          status: event.status,
          reconstructed: event.reconstructed,
          sequence: sequence.value++
        });
      }

      if (isLinkedWallet && Math.abs(event.customerCreditDelta) >= 0.005) {
        walletEvents.push({
          date: event.effectiveAt,
          type: "Credit Note credit",
          reference: noteNumber,
          description: event.eventType === "cancelled"
            ? "Customer credit reversed from cancelled Credit Note"
            : event.eventType === "edited"
              ? "Customer credit changed by Credit Note edit"
              : "Customer credit added from Credit Note",
          debit: Math.max(0, round2(-event.customerCreditDelta)),
          credit: Math.max(0, round2(event.customerCreditDelta)),
          creditNoteId: note._id,
          reconstructed: event.reconstructed,
          sequence: sequence.value++
        });
      }
    }
  }

  for (const adjustment of Array.isArray(client.creditBalanceHistory) ? client.creditBalanceHistory : []) {
    const date = eventDate(adjustment.effectiveAt, adjustment.createdAt);
    const amount = round2(adjustment.amount);
    if (!date || Math.abs(amount) < 0.005) continue;
    walletEvents.push({
      date,
      type: "Manual credit adjustment",
      reference: "Manual adjustment",
      description: String(adjustment.reason || "Manual customer-credit adjustment"),
      debit: Math.max(0, round2(-amount)),
      credit: Math.max(0, amount),
      sequence: sequence.value++
    });
  }

  sortTransactions(receivableEvents);
  sortTransactions(walletEvents);

  const inPeriod = events => events.filter(event =>
    event.date.getTime() >= from.getTime()
    && event.date.getTime() <= to.getTime()
  );
  const beforePeriod = events => events
    .filter(event => event.date.getTime() < from.getTime())
    .reduce((sum, event) => sum + Number(event.debit || 0) - Number(event.credit || 0), 0);

  const receivableOpening = round2(beforePeriod(receivableEvents));
  const walletKnownDeltas = walletEvents.reduce(
    (sum, event) => sum + Number(event.credit || 0) - Number(event.debit || 0),
    0
  );
  const storedCreditBalance = Math.max(0, round2(client.creditBalance));
  const walletBaseBalance = round2(storedCreditBalance - walletKnownDeltas);
  const walletOpening = round2(
    walletBaseBalance + walletEvents
      .filter(event => event.date.getTime() < from.getTime())
      .reduce((sum, event) => sum + Number(event.credit || 0) - Number(event.debit || 0), 0)
  );

  const periodReceivableEvents = inPeriod(receivableEvents);
  const periodWalletEvents = inPeriod(walletEvents);
  const receivableRows = calculateRunningBalance(
    periodReceivableEvents,
    receivableOpening,
    "debit"
  ).map(row => ({
    ...row,
    balanceAfter: round2(row.balanceAfter - Number(row.credit || 0)),
    date: row.date.toISOString()
  }));
  const walletRows = calculateRunningBalance(
    periodWalletEvents,
    walletOpening,
    "credit"
  ).map(row => ({
    ...row,
    balanceAfter: round2(row.balanceAfter - Number(row.debit || 0)),
    date: row.date.toISOString()
  }));

  const receivableDebits = round2(periodReceivableEvents.reduce((sum, event) => sum + Number(event.debit || 0), 0));
  const receivableCredits = round2(periodReceivableEvents.reduce((sum, event) => sum + Number(event.credit || 0), 0));
  const walletDebits = round2(periodWalletEvents.reduce((sum, event) => sum + Number(event.debit || 0), 0));
  const walletCredits = round2(periodWalletEvents.reduce((sum, event) => sum + Number(event.credit || 0), 0));
  const receivableClosing = round2(receivableOpening + receivableDebits - receivableCredits);
  const walletClosing = round2(walletOpening + walletCredits - walletDebits);

  const currentOutstanding = round2(receivableEvents
    .filter(event => event.date.getTime() <= nowDate.getTime())
    .reduce((sum, event) => sum + Number(event.debit || 0) - Number(event.credit || 0), 0));
  const storedOutstanding = round2(client.outstanding_balance);
  const balanceDifference = round2(currentOutstanding - storedOutstanding);

  if (reconstructedCreditNotes > 0) {
    warnings.push(
      reconstructedCreditNotes + " older Credit Note(s) have incomplete settlement history. Their earlier edits are estimated from the saved records."
    );
  }

  const trackedManualAdjustments = round2((client.creditBalanceHistory || [])
    .reduce((sum, event) => sum + Number(event.amount || 0), 0));
  const storedManualAdjustments = round2(client.creditBalanceAdjustment);
  const legacyManualAdjustment = round2(storedManualAdjustments - trackedManualAdjustments);
  if (Math.abs(legacyManualAdjustment) >= 0.005) {
    warnings.push(
      "Some manual customer-credit adjustments pre-date detailed history. The undated amount is included in the opening customer-credit balance."
    );
  }

  if (excludedCancelledInvoices > 0) {
    warnings.push(
      excludedCancelledInvoices + " cancelled invoice(s) are excluded from the receivables balance, consistent with the customer account summary."
    );
  }

  if (Math.abs(balanceDifference) >= 0.01) {
    warnings.push(
      "The reconstructed receivables balance differs from the saved customer outstanding total by " + balanceDifference.toFixed(2) + ". Review older invoice edits, deleted payments, or unrecorded adjustments."
    );
  }

  return {
    period: {
      from: from.toISOString(),
      to: to.toISOString(),
      timezone: "Asia/Kolkata"
    },
    receivables: {
      openingBalance: receivableOpening,
      totalDebits: receivableDebits,
      totalCredits: receivableCredits,
      closingBalance: receivableClosing,
      currentOutstanding,
      storedOutstanding,
      reconcilesWithCustomerSummary: Math.abs(balanceDifference) < 0.01,
      transactions: receivableRows
    },
    customerCredit: {
      openingBalance: walletOpening,
      additions: walletCredits,
      deductions: walletDebits,
      closingBalance: walletClosing,
      currentBalance: storedCreditBalance,
      legacyOpeningComponent: walletBaseBalance,
      transactions: walletRows
    },
    totals: {
      invoiceDebits: round2(periodReceivableEvents.filter(event => event.type === "Invoice").reduce((sum, event) => sum + event.debit, 0)),
      paymentCredits: round2(periodReceivableEvents.filter(event => event.type === "Payment").reduce((sum, event) => sum + event.credit, 0)),
      creditNoteCredits: round2(periodReceivableEvents.filter(event => event.type === "Credit Note").reduce((sum, event) => sum + event.credit, 0)),
      creditNoteReversals: round2(periodReceivableEvents.filter(event => event.type === "Credit Note").reduce((sum, event) => sum + event.debit, 0))
    },
    warnings,
    limitations: [
      "The statement uses the currently saved invoice totals and payment entries. Previous invoice edits and deleted payment entries cannot be reconstructed unless they were separately recorded.",
      "Refunds and unallocated customer credit are shown in Credit Note details or the separate customer-credit ledger; they do not reduce invoice receivables."
    ],
    excludedCancelledInvoices
  };
}

module.exports = { buildCustomerStatement, getCreditNoteEvents };
