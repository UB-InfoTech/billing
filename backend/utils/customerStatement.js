const { getInvoiceRevenue } = require("./syncClientData");
const { getLegacySettlementHistory } = require("./creditNoteSettlementHistory");
const round2 = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

function validDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function eventDate(value, fallback) { return validDate(value) || validDate(fallback); }

function getCreditNoteEvents(note = {}) {
  const existing = Array.isArray(note.settlementHistory) && note.settlementHistory.length
    ? note.settlementHistory : getLegacySettlementHistory(note);
  const ordered = existing.map((event, index) => ({
    ...event, effectiveAt: validDate(event.effectiveAt), _index: index
  })).filter(event => event.effectiveAt).sort((a, b) =>
    a.effectiveAt.getTime() - b.effectiveAt.getTime() || a._index - b._index
  );
  let previousAdjustment = 0, previousCustomerCredit = 0, previousRefund = 0;
  return ordered.map(event => {
    const posted = event.status !== "Cancelled";
    const nextAdjustment = posted ? round2(event.adjustmentAmount) : 0;
    const nextCustomerCredit = posted ? round2(event.customerCreditAmount) : 0;
    const nextRefund = posted ? round2(event.refundAmount) : 0;
    const result = {
      eventType: event.eventType || "legacy-snapshot", effectiveAt: event.effectiveAt,
      status: posted ? "Posted" : "Cancelled",
      adjustmentDelta: round2(nextAdjustment - previousAdjustment),
      customerCreditDelta: round2(nextCustomerCredit - previousCustomerCredit),
      refundDelta: round2(nextRefund - previousRefund),
      adjustmentAmount: nextAdjustment, customerCreditAmount: nextCustomerCredit,
      refundAmount: nextRefund, reconstructed: Boolean(event.reconstructed)
    };
    previousAdjustment = nextAdjustment;
    previousCustomerCredit = nextCustomerCredit;
    previousRefund = nextRefund;
    return result;
  });
}

function sortTransactions(events) {
  const priority = {
    Invoice: 1, "Invoice adjustment": 2, "Credit Note": 3,
    Payment: 4, "Payment adjustment": 5, "Payment reversal": 6,
    "Manual credit adjustment": 1
  };
  return events.sort((a, b) =>
    a.date.getTime() - b.date.getTime()
    || (priority[a.type] || 9) - (priority[b.type] || 9)
    || String(a.reference || "").localeCompare(String(b.reference || ""))
    || a.sequence - b.sequence
  );
}
function calculateRunningBalance(events, opening, debitField, creditField) {
  let balance = round2(opening);
  return events.map(event => {
    balance = round2(balance + Number(event[debitField] || 0) - Number(event[creditField] || 0));
    return { ...event, balanceAfter: balance };
  });
}
function normalizeInvoiceSnapshot(snapshot = {}) {
  return {
    invoiceTotal: round2(snapshot.invoiceTotal),
    clientId: String(snapshot.clientId?._id || snapshot.clientId || ""),
    orderDate: validDate(snapshot.orderDate),
    orderNumber: String(snapshot.orderNumber || "")
  };
}

function getInvoiceLedgerEvents(order = {}, customerId, sequence = { value: 0 }) {
  const history = Array.isArray(order.financialHistory) ? order.financialHistory : [];
  const ordered = history.map((event, index) => ({
    ...event, effectiveAt: validDate(event.effectiveAt), recordedAt: validDate(event.recordedAt), _index: index
  })).filter(event => event.effectiveAt || event.recordedAt).sort((a, b) =>
    (a.effectiveAt || a.recordedAt).getTime() - (b.effectiveAt || b.recordedAt).getTime()
    || a._index - b._index
  );
  const output = [];
  let reconstructed = false;
  const targetId = String(customerId || "");
  const addLine = ({ date, type, reference, description, debit = 0, credit = 0, snapshot }) => {
    if (!date || !snapshot || snapshot.clientId !== targetId) return;
    if (Math.abs(debit) < 0.005 && Math.abs(credit) < 0.005) return;
    output.push({
      date, type, reference: reference || snapshot.orderNumber || String(order._id || ""),
      description, debit: round2(debit), credit: round2(credit),
      orderId: order._id, sequence: sequence.value++
    });
  };

  if (!ordered.length) {
    const snapshot = normalizeInvoiceSnapshot({
      invoiceTotal: getInvoiceRevenue(order), clientId: order.clientId,
      orderDate: order.orderDate || order.createdAt, orderNumber: order.orderNumber
    });
    addLine({
      date: snapshot.orderDate, type: "Invoice", reference: snapshot.orderNumber,
      description: "Invoice " + snapshot.orderNumber, debit: snapshot.invoiceTotal, snapshot
    });
    return { events: output, reconstructed: false };
  }

  const first = ordered[0];
  const firstSnapshot = normalizeInvoiceSnapshot(first.eventType === "created" ? first.next : (first.previous || first.next));
  if (first.eventType !== "created") reconstructed = true;
  addLine({
    date: firstSnapshot.orderDate || order.orderDate || order.createdAt,
    type: "Invoice", reference: firstSnapshot.orderNumber,
    description: "Invoice " + firstSnapshot.orderNumber, debit: firstSnapshot.invoiceTotal, snapshot: firstSnapshot
  });

  for (const event of ordered) {
    if (event.eventType === "created") continue;
    const previous = normalizeInvoiceSnapshot(event.previous || {});
    const next = normalizeInvoiceSnapshot(event.next || {});
    const date = event.recordedAt || event.effectiveAt;
    const reference = next.orderNumber || previous.orderNumber || order.orderNumber || "";
    if (previous.clientId === next.clientId) {
      if (previous.clientId !== targetId) continue;
      const delta = round2(next.invoiceTotal - previous.invoiceTotal);
      addLine({
        date, type: "Invoice adjustment", reference,
        description: "Invoice total revised from " + previous.invoiceTotal.toFixed(2) + " to " + next.invoiceTotal.toFixed(2),
        debit: Math.max(0, delta), credit: Math.max(0, -delta), snapshot: next
      });
    } else {
      addLine({
        date, type: "Invoice adjustment", reference,
        description: "Invoice transferred to another customer", credit: previous.invoiceTotal, snapshot: previous
      });
      addLine({
        date, type: "Invoice adjustment", reference,
        description: "Invoice received from another customer", debit: next.invoiceTotal, snapshot: next
      });
    }
  }
  return { events: output, reconstructed };
}

function normalizePaymentSnapshot(payment = {}) {
  return {
    amount: round2(payment.amount), paymentDate: validDate(payment.paymentDate || payment.createdAt),
    method: String(payment.method || ""), amountReference: String(payment.amountReference || "")
  };
}
function getPaymentLedgerEvents(order = {}, sequence = { value: 0 }) {
  const history = Array.isArray(order.paymentHistory) ? order.paymentHistory : [];
  const groups = new Map();
  for (const [index, event] of history.entries()) {
    const paymentId = String(event.paymentId || "");
    if (!paymentId) continue;
    if (!groups.has(paymentId)) groups.set(paymentId, []);
    groups.get(paymentId).push({
      ...event, _index: index, effectiveAt: validDate(event.effectiveAt), recordedAt: validDate(event.recordedAt)
    });
  }
  const output = [];
  const knownIds = new Set(groups.keys());
  let reconstructed = false;
  const addPayment = ({ date, type, reference, description, debit = 0, credit = 0, paymentId }) => {
    if (!date || (Math.abs(debit) < 0.005 && Math.abs(credit) < 0.005)) return;
    output.push({
      date, type, reference: reference || String(paymentId || ""), description,
      debit: round2(debit), credit: round2(credit), orderId: order._id,
      paymentId, sequence: sequence.value++
    });
  };

  for (const [paymentId, events] of groups) {
    events.sort((a, b) =>
      (a.recordedAt || a.effectiveAt || new Date(0)).getTime()
      - (b.recordedAt || b.effectiveAt || new Date(0)).getTime() || a._index - b._index
    );
    const first = events[0];
    if (first.action !== "added" && first.before) {
      const baseline = normalizePaymentSnapshot(first.before);
      addPayment({
        date: baseline.paymentDate || first.effectiveAt, type: "Payment", reference: baseline.amountReference,
        description: "Payment received" + (baseline.method ? " by " + baseline.method : ""),
        credit: baseline.amount, paymentId
      });
      reconstructed = true;
    }
    for (const event of events) {
      const date = event.recordedAt || event.effectiveAt;
      if (event.action === "added" && event.after) {
        const after = normalizePaymentSnapshot(event.after);
        addPayment({
          date: after.paymentDate || event.effectiveAt, type: "Payment", reference: after.amountReference,
          description: "Payment received" + (after.method ? " by " + after.method : ""),
          credit: after.amount, paymentId
        });
      } else if (event.action === "edited" && event.before && event.after) {
        const before = normalizePaymentSnapshot(event.before), after = normalizePaymentSnapshot(event.after);
        addPayment({
          date, type: "Payment adjustment", reference: after.amountReference || before.amountReference,
          description: "Payment updated: " + before.amount.toFixed(2) + " to " + after.amount.toFixed(2),
          debit: before.amount, credit: after.amount, paymentId
        });
      } else if (event.action === "deleted" && event.before) {
        const before = normalizePaymentSnapshot(event.before);
        addPayment({
          date, type: "Payment reversal", reference: before.amountReference,
          description: "Deleted payment reversed (" + before.amount.toFixed(2) + ")",
          debit: before.amount, paymentId
        });
      }
    }
  }

  for (const payment of Array.isArray(order.payments) ? order.payments : []) {
    const paymentId = String(payment?._id || "");
    if (paymentId && knownIds.has(paymentId)) continue;
    const snapshot = normalizePaymentSnapshot(payment);
    if (!snapshot.paymentDate || snapshot.amount <= 0) continue;
    addPayment({
      date: snapshot.paymentDate, type: "Payment", reference: snapshot.amountReference,
      description: "Payment received" + (snapshot.method ? " by " + snapshot.method : ""),
      credit: snapshot.amount, paymentId
    });
  }
  return { events: output, reconstructed };
}

/**
 * Builds separate invoice-receivables and available-customer-credit ledgers.
 * Payment edits and deletions are posted when recorded, rather than silently
 * rewriting an earlier statement.
 */
function buildCustomerStatement({ client = {}, orders = [], creditNotes = [], fromDate, toDate, now = new Date() } = {}) {
  const from = validDate(fromDate) || validDate(client.createdAt) || new Date(0);
  const to = validDate(toDate) || validDate(now) || new Date();
  const nowDate = validDate(now) || new Date();
  if (from.getTime() > to.getTime()) throw new RangeError("Statement start date must be on or before the end date.");

  const sequence = { value: 0 }, receivableEvents = [], walletEvents = [], warnings = [];
  let excludedCancelledInvoices = 0, reconstructedCreditNotes = 0;
  let reconstructedInvoiceHistory = 0, reconstructedPaymentHistory = 0;
  const activeOrders = [], orderIds = new Set();

  for (const order of Array.isArray(orders) ? orders : []) {
    orderIds.add(String(order._id));
    if (order.status === "Cancelled") { excludedCancelledInvoices += 1; continue; }
    activeOrders.push(order);
    const invoiceLedger = getInvoiceLedgerEvents(order, client._id, sequence);
    receivableEvents.push(...invoiceLedger.events);
    if (invoiceLedger.reconstructed) reconstructedInvoiceHistory += 1;
    const paymentLedger = getPaymentLedgerEvents(order, sequence);
    receivableEvents.push(...paymentLedger.events);
    if (paymentLedger.reconstructed) reconstructedPaymentHistory += 1;
  }

  const linkedOrderIds = new Set(activeOrders.map(order => String(order._id)));
  for (const note of Array.isArray(creditNotes) ? creditNotes : []) {
    const noteEvents = getCreditNoteEvents(note);
    if (noteEvents.some(event => event.reconstructed)) reconstructedCreditNotes += 1;
    const noteNumber = String(note.creditNoteNumber || note._id || "Credit Note");
    const isLinkedInvoice = linkedOrderIds.has(String(note.originalOrderId || ""));
    const isLinkedWallet = String(note.clientId || "") === String(client._id || "")
      || (!note.clientId && orderIds.has(String(note.originalOrderId || "")));

    for (const event of noteEvents) {
      const eventDescription = event.eventType === "cancelled" ? "Credit Note cancelled"
        : event.eventType === "edited" ? "Credit Note settlement edited" : "Credit Note issued";
      const details = [
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
          date: event.effectiveAt, type: "Credit Note", reference: noteNumber,
          description: eventDescription + " (" + details + ")",
          debit: Math.max(0, round2(-event.adjustmentDelta)),
          credit: Math.max(0, round2(event.adjustmentDelta)),
          orderId: note.originalOrderId, creditNoteId: note._id,
          status: event.status, reconstructed: event.reconstructed, sequence: sequence.value++
        });
      }
      if (isLinkedWallet && Math.abs(event.customerCreditDelta) >= 0.005) {
        walletEvents.push({
          date: event.effectiveAt, type: "Credit Note credit", reference: noteNumber,
          description: event.eventType === "cancelled" ? "Customer credit reversed from cancelled Credit Note"
            : event.eventType === "edited" ? "Customer credit changed by Credit Note edit"
              : "Customer credit added from Credit Note",
          debit: Math.max(0, round2(-event.customerCreditDelta)),
          credit: Math.max(0, round2(event.customerCreditDelta)),
          creditNoteId: note._id, reconstructed: event.reconstructed, sequence: sequence.value++
        });
      }
    }
  }

  for (const adjustment of Array.isArray(client.creditBalanceHistory) ? client.creditBalanceHistory : []) {
    const date = eventDate(adjustment.effectiveAt, adjustment.createdAt);
    const amount = round2(adjustment.amount);
    if (!date || Math.abs(amount) < 0.005) continue;
    walletEvents.push({
      date, type: "Manual credit adjustment", reference: "Manual adjustment",
      description: String(adjustment.reason || "Manual customer-credit adjustment"),
      debit: Math.max(0, round2(-amount)), credit: Math.max(0, amount), sequence: sequence.value++
    });
  }

  sortTransactions(receivableEvents); sortTransactions(walletEvents);
  const inPeriod = rows => rows.filter(row => row.date.getTime() >= from.getTime() && row.date.getTime() <= to.getTime());
  const beforePeriod = rows => rows.filter(row => row.date.getTime() < from.getTime())
    .reduce((sum, row) => sum + Number(row.debit || 0) - Number(row.credit || 0), 0);
  const receivableOpening = round2(beforePeriod(receivableEvents));
  const walletKnownDeltas = walletEvents.reduce((sum, row) => sum + Number(row.credit || 0) - Number(row.debit || 0), 0);
  const storedCreditBalance = Math.max(0, round2(client.creditBalance));
  const walletBaseBalance = round2(storedCreditBalance - walletKnownDeltas);
  const walletOpening = round2(walletBaseBalance + walletEvents.filter(row => row.date.getTime() < from.getTime())
    .reduce((sum, row) => sum + Number(row.credit || 0) - Number(row.debit || 0), 0));

  const periodReceivableEvents = inPeriod(receivableEvents), periodWalletEvents = inPeriod(walletEvents);
  const receivableRows = calculateRunningBalance(periodReceivableEvents, receivableOpening, "debit", "credit")
    .map(row => ({ ...row, date: row.date.toISOString() }));
  const walletRows = calculateRunningBalance(periodWalletEvents, walletOpening, "credit", "debit")
    .map(row => ({ ...row, date: row.date.toISOString() }));
  const receivableDebits = round2(periodReceivableEvents.reduce((sum, row) => sum + Number(row.debit || 0), 0));
  const receivableCredits = round2(periodReceivableEvents.reduce((sum, row) => sum + Number(row.credit || 0), 0));
  const walletDebits = round2(periodWalletEvents.reduce((sum, row) => sum + Number(row.debit || 0), 0));
  const walletCredits = round2(periodWalletEvents.reduce((sum, row) => sum + Number(row.credit || 0), 0));
  const receivableClosing = round2(receivableOpening + receivableDebits - receivableCredits);
  const walletClosing = round2(walletOpening + walletCredits - walletDebits);
  const currentOutstanding = round2(receivableEvents.filter(row => row.date.getTime() <= nowDate.getTime())
    .reduce((sum, row) => sum + Number(row.debit || 0) - Number(row.credit || 0), 0));
  const storedOutstanding = round2(client.outstanding_balance);
  const balanceDifference = round2(currentOutstanding - storedOutstanding);

  if (reconstructedCreditNotes > 0) warnings.push(
    reconstructedCreditNotes + " older Credit Note(s) have incomplete settlement history. Their earlier edits are estimated from the saved records."
  );
  if (reconstructedInvoiceHistory > 0) warnings.push(
    reconstructedInvoiceHistory + " invoice(s) started audit history after an earlier edit. The saved pre-edit total is used as the reconstructed starting point."
  );
  if (reconstructedPaymentHistory > 0) warnings.push(
    reconstructedPaymentHistory + " payment history item(s) were first audited during an edit or deletion. Their earlier saved values are used as the reconstructed starting point."
  );
  const trackedManualAdjustments = round2((client.creditBalanceHistory || []).reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const legacyManualAdjustment = round2(Number(client.creditBalanceAdjustment || 0) - trackedManualAdjustments);
  if (Math.abs(legacyManualAdjustment) >= 0.005) warnings.push(
    "Some manual customer-credit adjustments pre-date detailed history. The undated amount is included in the opening customer-credit balance."
  );
  if (excludedCancelledInvoices > 0) warnings.push(
    excludedCancelledInvoices + " cancelled invoice(s) are excluded from the receivables balance, consistent with the customer account summary."
  );
  if (Math.abs(balanceDifference) >= 0.01) warnings.push(
    "The reconstructed receivables balance differs from the saved customer outstanding total by "
      + balanceDifference.toFixed(2) + ". Review legacy invoice edits, payment changes, or unrecorded adjustments."
  );

  return {
    period: { from: from.toISOString(), to: to.toISOString(), timezone: "Asia/Kolkata" },
    receivables: {
      openingBalance: receivableOpening, totalDebits: receivableDebits, totalCredits: receivableCredits,
      closingBalance: receivableClosing, currentOutstanding, storedOutstanding,
      reconcilesWithCustomerSummary: Math.abs(balanceDifference) < 0.01,
      transactions: receivableRows
    },
    customerCredit: {
      openingBalance: walletOpening, additions: walletCredits, deductions: walletDebits,
      closingBalance: walletClosing, currentBalance: storedCreditBalance,
      legacyOpeningComponent: walletBaseBalance, transactions: walletRows
    },
    totals: {
      invoiceDebits: round2(periodReceivableEvents.filter(row => row.type === "Invoice").reduce((sum, row) => sum + row.debit, 0)),
      invoiceAdjustmentDebits: round2(periodReceivableEvents.filter(row => row.type === "Invoice adjustment").reduce((sum, row) => sum + row.debit, 0)),
      invoiceAdjustmentCredits: round2(periodReceivableEvents.filter(row => row.type === "Invoice adjustment").reduce((sum, row) => sum + row.credit, 0)),
      paymentCredits: round2(periodReceivableEvents.filter(row => row.type === "Payment").reduce((sum, row) => sum + row.credit, 0)),
      paymentAdjustmentDebits: round2(periodReceivableEvents.filter(row => row.type === "Payment adjustment").reduce((sum, row) => sum + row.debit, 0)),
      paymentAdjustmentCredits: round2(periodReceivableEvents.filter(row => row.type === "Payment adjustment").reduce((sum, row) => sum + row.credit, 0)),
      paymentReversalDebits: round2(periodReceivableEvents.filter(row => row.type === "Payment reversal").reduce((sum, row) => sum + row.debit, 0)),
      creditNoteCredits: round2(periodReceivableEvents.filter(row => row.type === "Credit Note").reduce((sum, row) => sum + row.credit, 0)),
      creditNoteReversals: round2(periodReceivableEvents.filter(row => row.type === "Credit Note").reduce((sum, row) => sum + row.debit, 0))
    },
    warnings,
    limitations: [
      "The first captured invoice edit records the saved pre-edit total as the starting point. Invoice edits made before audit history began cannot be reconstructed exactly.",
      "Payment additions, edits and deletions are now preserved. Changes made before this history was introduced cannot be reconstructed unless a later edit or deletion preserved the earlier saved value.",
      "Refunds and unallocated customer credit are shown in Credit Note details or the separate customer-credit ledger; they do not reduce invoice receivables."
    ],
    excludedCancelledInvoices
  };
}
module.exports = {
  buildCustomerStatement, getCreditNoteEvents, getInvoiceLedgerEvents, getPaymentLedgerEvents
};
