import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

// const API_ENV = String(import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
// const API_ENV = `http://localhost:5000/api/credit-notes/`;
const API_ENV = `http://localhost:5000`;
const API_ROOT = API_ENV.endsWith("/api") ? API_ENV : `${API_ENV}/api`.replace(/^\/api\/api$/, "/api");

const REASONS = [
  "Sales Return",
  "Post Sale Discount",
  "Deficiency in Service",
  "Correction in Invoice",
  "Change in POS",
  "Finalization of Provisional Assessment",
  "Other",
];

const REFUND_METHODS = ["Cash", "Bank Transfer", "UPI", "Cheque"];
const CREDIT_MODES = ["ITEM", "AMOUNT"];
const SETTLEMENT_TYPES = ["Outstanding", "Refund", "Customer Credit"];

function url(path) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${API_ROOT}${clean}`;
}

function readToken() {
  const keys = ["accessToken", "token", "authToken", "jwt"];
  for (const key of keys) {
    const value = localStorage.getItem(key);
    if (value && value !== "null" && value !== "undefined") return value;
  }

  for (const key of ["user", "userInfo", "authUser"]) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.token) return parsed.token;
      if (parsed?.accessToken) return parsed.accessToken;
    } catch {
      // Ignore malformed local-storage values.
    }
  }
  return "";
}

async function api(path, options = {}) {
  const token = readToken();
  const headers = {
    Accept: "application/json",
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(url(path), {
    credentials: "include",
    ...options,
    headers,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error ||
      (typeof payload === "string" && payload.trim()
        ? payload
        : `Request failed with status ${response.status}`);
    throw new Error(message);
  }

  return payload;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function round2(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

function formatMoney(value) {
  return toNumber(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("en-IN");
}

function today() {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function initialForm() {
  return {
    creditNoteNumber: "",
    creditNoteDate: today(),
    reason: "Sales Return",
    creditMode: "ITEM",
    stockAffecting: false,
    settlementType: "Outstanding",
    refundMethod: "Cash",
    manualTaxableAmount: 0,
    manualTaxRate: 0,
    note: "",
    items: [],
  };
}

function invoiceBilledQty(item) {
  const qtyUnit = item?.qtyUnit || "PCS";
  const qty = toNumber(item?.quantity);
  const mtr = toNumber(item?.MTR);
  const short = toNumber(item?.shortPcs);
  return round2(
    qtyUnit === "MTR"
      ? Math.max(0, mtr - short)
      : Math.max(0, qty - short)
  );
}

function itemRequestedQty(item) {
  return item.qtyUnit === "MTR" ? toNumber(item.MTR) : toNumber(item.quantity);
}

function itemAvailableQty(item) {
  const previous =
    item.qtyUnit === "MTR"
      ? toNumber(item.previouslyCreditedMTR)
      : toNumber(item.previouslyCreditedQuantity);
  return Math.max(0, round2(invoiceBilledQty(item) - previous));
}

function calculateItem(item) {
  const qty = itemRequestedQty(item);
  const gross = round2(qty * toNumber(item.unitPrice));
  const discount = round2((gross * toNumber(item.discountRate)) / 100);
  const taxable = round2(gross - discount);
  const tax = round2((taxable * toNumber(item.taxRate)) / 100);
  return {
    ...item,
    lineTotalBeforeDiscount: gross,
    discountAmount: discount,
    taxableAmount: taxable,
    taxAmount: tax,
    lineTotal: round2(taxable + tax),
  };
}

function normalizeInvoiceSearch(payload) {
  return payload?.orders || payload?.data || (Array.isArray(payload) ? payload : []);
}

function normalizeList(payload) {
  return {
    rows: payload?.creditNotes || payload?.data || [],
    pagination: payload?.pagination || { page: 1, pages: 1, total: 0, limit: 25 },
  };
}

export default function CreditNote() {
  const [mode, setMode] = useState("list");
  const [form, setForm] = useState(initialForm);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceResults, setInvoiceResults] = useState([]);
  const [invoiceSearching, setInvoiceSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [nextNumber, setNextNumber] = useState("");
  const [preview, setPreview] = useState(null);
  const [list, setList] = useState({
    rows: [],
    pagination: { page: 1, pages: 1, total: 0, limit: 25 },
  });
  const [filters, setFilters] = useState({
    search: "",
    reason: "",
    status: "",
    from: "",
    to: "",
    page: 1,
  });

  const invoiceSearchController = useRef(null);

  const loadList = useCallback(async (overrideFilters = null) => {
    const current = overrideFilters || filters;
    try {
      setLoading(true);
      setError("");
      const query = new URLSearchParams();
      query.set("page", String(current.page || 1));
      query.set("limit", "25");
      if (current.search) query.set("search", current.search.trim());
      if (current.reason) query.set("reason", current.reason);
      if (current.status) query.set("status", current.status);
      if (current.from) query.set("from", current.from);
      if (current.to) query.set("to", current.to);

      const payload = await api(`/credit-notes?${query.toString()}`);
      setList(normalizeList(payload));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const loadNextNumber = useCallback(async () => {
    try {
      const payload = await api("/credit-notes/next-number");
      const number = payload?.creditNoteNumber || payload?.data?.creditNoteNumber || "";
      setNextNumber(number);
      setForm((current) => ({
        ...current,
        creditNoteNumber: current.creditNoteNumber || number,
      }));
    } catch {
      setNextNumber("");
    }
  }, []);

  useEffect(() => {
    loadList({ ...filters, page: 1 });
    // Do not add filters/loadList here: this is the initial load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const q = invoiceSearch.trim();
    if (q.length < 2 || selectedInvoice) {
      setInvoiceResults([]);
      if (invoiceSearchController.current) invoiceSearchController.current.abort();
      return undefined;
    }

    const controller = new AbortController();
    invoiceSearchController.current?.abort();
    invoiceSearchController.current = controller;

    const timer = setTimeout(async () => {
      try {
        setInvoiceSearching(true);
        const payload = await api(
          `/credit-notes/invoices/search?q=${encodeURIComponent(q)}&limit=25`,
          { signal: controller.signal }
        );
        if (!controller.signal.aborted) setInvoiceResults(normalizeInvoiceSearch(payload));
      } catch (err) {
        if (err.name !== "AbortError") setError(err.message);
      } finally {
        if (!controller.signal.aborted) setInvoiceSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [invoiceSearch, selectedInvoice]);

  const itemTotals = useMemo(() => {
    if (form.creditMode !== "ITEM") {
      const taxable = round2(toNumber(form.manualTaxableAmount));
      const tax = round2((taxable * toNumber(form.manualTaxRate)) / 100);
      const beforeRound = round2(taxable + tax);
      const grandTotal = Math.round(beforeRound);
      return {
        subtotal: taxable,
        discount: 0,
        taxable,
        tax,
        beforeRound,
        roundOff: round2(grandTotal - beforeRound),
        grandTotal,
      };
    }

    const subtotal = round2(
      form.items.reduce((sum, item) => sum + toNumber(item.lineTotalBeforeDiscount), 0)
    );
    const discount = round2(
      form.items.reduce((sum, item) => sum + toNumber(item.discountAmount), 0)
    );
    const taxable = round2(
      form.items.reduce((sum, item) => sum + toNumber(item.taxableAmount), 0)
    );
    const tax = round2(
      form.items.reduce((sum, item) => sum + toNumber(item.taxAmount), 0)
    );
    const beforeRound = round2(taxable + tax);
    const grandTotal = Math.round(beforeRound);
    return {
      subtotal,
      discount,
      taxable,
      tax,
      beforeRound,
      roundOff: round2(grandTotal - beforeRound),
      grandTotal,
    };
  }, [form]);

  const invoiceDue = useMemo(() => {
    if (!selectedInvoice) return 0;
    return Math.max(0, round2(toNumber(selectedInvoice.currentDue)));
  }, [selectedInvoice]);

  const settlementPreview = useMemo(() => {
    const total = itemTotals.grandTotal;
    if (form.settlementType === "Outstanding") {
      return { adjustmentAmount: total, refundAmount: 0, customerCreditAmount: 0 };
    }
    if (form.settlementType === "Refund") {
      return { adjustmentAmount: 0, refundAmount: total, customerCreditAmount: 0 };
    }
    return { adjustmentAmount: 0, refundAmount: 0, customerCreditAmount: total };
  }, [form.settlementType, itemTotals.grandTotal]);

  const canReverseStock = useMemo(() => {
    if (!selectedInvoice || form.reason !== "Sales Return" || form.creditMode !== "ITEM") {
      return false;
    }
    const selected = form.items.filter((item) => itemRequestedQty(item) > 0);
    return selected.length > 0 && selected.every((item) => Boolean(item.productId));
  }, [selectedInvoice, form.reason, form.creditMode, form.items]);

  useEffect(() => {
    if (!canReverseStock && form.stockAffecting) {
      setForm((current) => ({ ...current, stockAffecting: false }));
    }
  }, [canReverseStock, form.stockAffecting]);

  function resetEditor() {
    setMode("create");
    setForm(initialForm());
    setSelectedInvoice(null);
    setInvoiceSearch("");
    setInvoiceResults([]);
    setPreview(null);
    setError("");
    setSuccess("");
    loadNextNumber();
  }

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function chooseInvoice(invoice) {
    try {
      setLoading(true);
      setError("");
      const payload = await api(`/credit-notes/available/${invoice._id}`);
      const order = payload?.order || payload?.data?.order || invoice;
      const sourceItems = payload?.items || order?.subOrders || [];
      const items = sourceItems.map((item, index) => {
        const qtyUnit = item.qtyUnit || "PCS";
        const existingCredit = qtyUnit === "MTR"
          ? toNumber(item.previouslyCreditedMTR)
          : toNumber(item.previouslyCreditedQuantity);
        const billed = toNumber(item.billedQuantity ?? invoiceBilledQty(item));
        return calculateItem({
          sourceSubOrderId: item._id || String(index),
          productId: item.productId || null,
          designNumber: item.designNumber || "",
          orderName: item.orderName || "",
          hsnCode: item.hsnCode ?? "",
          qtyUnit,
          originalQuantity: toNumber(item.quantity),
          originalMTR: toNumber(item.MTR),
          billedQuantity: billed,
          previouslyCreditedQuantity: qtyUnit === "MTR" ? 0 : existingCredit,
          previouslyCreditedMTR: qtyUnit === "MTR" ? existingCredit : 0,
          availableQuantity: Math.max(0, round2(billed - existingCredit)),
          quantity: 0,
          MTR: 0,
          cut: toNumber(item.cut),
          shortPcs: toNumber(item.shortPcs),
          unitPrice: toNumber(item.unitPrice),
          discountRate: toNumber(order.discountRate),
          taxRate: toNumber(order.taxPercentage),
          lineTotalBeforeDiscount: 0,
          discountAmount: 0,
          taxableAmount: 0,
          taxAmount: 0,
          lineTotal: 0,
        });
      });

      const paymentsTotal = (order.payments || []).reduce(
        (sum, payment) => sum + toNumber(payment.amount),
        0
      );
      const due = Math.max(
        0,
        round2(
          toNumber(order.roundOffFinalRevenue ?? order.finalRevenue ?? order.totalAmount) -
            paymentsTotal -
            toNumber(order.creditAppliedAmount)
        )
      );

      setSelectedInvoice({
        ...order,
        currentDue: due,
        invoiceTotal: round2(
          toNumber(order.roundOffFinalRevenue ?? order.finalRevenue ?? order.totalAmount)
        ),
        remainingCreditTotal: toNumber(order.remainingCreditTotal),
      });
      setInvoiceSearch(order.orderNumber || "");
      setInvoiceResults([]);
      setForm((current) => ({
        ...current,
        originalOrderId: order._id,
        manualTaxRate: toNumber(order.taxPercentage),
        items,
        creditMode: current.reason === "Sales Return" ? "ITEM" : current.creditMode,
        stockAffecting: false,
        settlementType: due > 0 ? "Outstanding" : "Refund",
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function clearInvoice() {
    setSelectedInvoice(null);
    setInvoiceSearch("");
    setInvoiceResults([]);
    setForm((current) => ({
      ...current,
      originalOrderId: "",
      items: [],
      stockAffecting: false,
    }));
  }

  function updateItem(index, field, value) {
    setForm((current) => {
      const items = [...current.items];
      const item = { ...items[index] };
      const numericFields = [
        "quantity",
        "MTR",
        "unitPrice",
        "discountRate",
        "taxRate",
        "cut",
        "shortPcs",
      ];
      item[field] = numericFields.includes(field) ? toNumber(value) : value;

      if (field === "quantity" || field === "MTR") {
        const max = itemAvailableQty(item);
        if (item.qtyUnit === "MTR") item.MTR = Math.min(toNumber(item.MTR), max);
        else item.quantity = Math.min(toNumber(item.quantity), max);
      }

      item.discountRate = Math.min(100, Math.max(0, toNumber(item.discountRate)));
      item.taxRate = Math.min(100, Math.max(0, toNumber(item.taxRate)));
      items[index] = calculateItem(item);
      return { ...current, items };
    });
  }

  function selectAllAvailable() {
    setForm((current) => ({
      ...current,
      items: current.items.map((item) => {
        const available = itemAvailableQty(item);
        return calculateItem({
          ...item,
          quantity: item.qtyUnit === "MTR" ? 0 : available,
          MTR: item.qtyUnit === "MTR" ? available : 0,
        });
      }),
    }));
  }

  function validateForm() {
    if (!form.creditNoteDate) return "Credit note date is required.";
    if (!form.reason) return "Credit note reason is required.";
    if (!selectedInvoice) return "Select an original invoice.";

    const remainingInvoiceCredit =
      selectedInvoice.remainingCreditTotal == null
        ? round2(selectedInvoice.invoiceTotal)
        : Math.max(0, round2(selectedInvoice.remainingCreditTotal));

    if (itemTotals.grandTotal <= 0) return "Credit note total must be greater than zero.";
    if (itemTotals.grandTotal > remainingInvoiceCredit + 0.01) {
      return `Credit note cannot exceed the remaining invoice credit limit of ₹ ${formatMoney(
        remainingInvoiceCredit
      )}.`;
    }

    if (form.creditMode === "ITEM") {
      const active = form.items.filter((item) => itemRequestedQty(item) > 0);
      if (!active.length) return "Enter credit quantity for at least one item.";
      for (const item of active) {
        const requested = itemRequestedQty(item);
        const max = itemAvailableQty(item);
        if (requested > max + 0.01) {
          return `Credit quantity for ${item.orderName || item.designNumber || "item"} cannot exceed ${max} ${item.qtyUnit}.`;
        }
      }
    } else if (toNumber(form.manualTaxableAmount) <= 0) {
      return "Enter a valid taxable credit amount.";
    }

    if (form.settlementType === "Outstanding" && settlementPreview.adjustmentAmount > invoiceDue + 0.01) {
      return `Invoice due is only ₹ ${formatMoney(invoiceDue)}. Choose Refund or Customer Credit for the remaining amount.`;
    }

    if (form.stockAffecting && !canReverseStock) {
      return "Stock reversal is unavailable because a selected item is not linked to a Product.";
    }

    return "";
  }

  function payloadForSave() {
    const activeItems = form.items
      .filter((item) => itemRequestedQty(item) > 0)
      .map((item) => ({
        sourceSubOrderId: item.sourceSubOrderId,
        quantity: item.qtyUnit === "MTR" ? 0 : toNumber(item.quantity),
        MTR: item.qtyUnit === "MTR" ? toNumber(item.MTR) : 0,
        cut: toNumber(item.cut),
        shortPcs: toNumber(item.shortPcs),
        discountRate: toNumber(item.discountRate),
        taxRate: toNumber(item.taxRate),
        unitPrice: toNumber(item.unitPrice),
      }));

    let settlement = {
      adjustmentType: "Outstanding",
      adjustmentAmount: 0,
      refundMethod: null,
      refundAmount: 0,
      customerCreditAmount: 0,
    };

    if (form.settlementType === "Outstanding") {
      settlement.adjustmentType = "Outstanding";
      settlement.adjustmentAmount = itemTotals.grandTotal;
    } else if (form.settlementType === "Refund") {
      settlement.refundMethod = form.refundMethod;
      settlement.refundAmount = itemTotals.grandTotal;
    } else {
      settlement.customerCreditAmount = itemTotals.grandTotal;
    }

    return {
      // The server is the source of truth for numbering. The displayed number
      // is only a preview and is intentionally not posted to avoid race-condition duplicates.
      creditNoteDate: form.creditNoteDate,
      reason: form.reason,
      creditMode: form.creditMode,
      originalOrderId: selectedInvoice._id,
      stockAffecting: form.stockAffecting,
      settlement,
      manualCredit:
        form.creditMode === "AMOUNT"
          ? {
              taxableAmount: toNumber(form.manualTaxableAmount),
              taxRate: toNumber(form.manualTaxRate),
            }
          : undefined,
      items: activeItems,
      note: form.note.trim(),
    };
  }

  async function saveCreditNote(printAfterSave = false) {
    const validation = validateForm();
    if (validation) {
      setError(validation);
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const payload = await api("/credit-notes", {
        method: "POST",
        body: JSON.stringify(payloadForSave()),
      });
      const note = payload?.creditNote || payload?.data || payload;
      setPreview(note);
      setMode("preview");
      setSuccess(`Credit Note ${note?.creditNoteNumber || form.creditNoteNumber} created successfully.`);
      if (printAfterSave) setTimeout(() => window.print(), 250);
      await loadList({ ...filters, page: 1 });
      setFilters((current) => ({ ...current, page: 1 }));
      await loadNextNumber();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function viewNote(id) {
    try {
      setLoading(true);
      setError("");
      const payload = await api(`/credit-notes/${id}`);
      setPreview(payload?.creditNote || payload?.data || payload);
      setMode("preview");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function cancelNote(note) {
    const reason = window.prompt("Enter cancellation reason:");
    if (!reason?.trim()) return;

    try {
      setCancelling(true);
      setError("");
      await api(`/credit-notes/${note._id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      });
      setSuccess("Credit note cancelled successfully.");
      await viewNote(note._id);
      await loadList(filters);
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  }

  function applyFilters(override = null) {
    const next = override || { ...filters, page: 1 };
    setFilters(next);
    loadList(next);
  }

  function resetFilters() {
    const next = { search: "", reason: "", status: "", from: "", to: "", page: 1 };
    setFilters(next);
    loadList(next);
  }

  const orderStatusBadge = selectedInvoice?.paymentStatus === "Paid" ? "success" : "warning";

  return (
    <div className="container-fluid py-3">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3 no-print">
        <div>
          <h3 className="mb-1 fw-bold">Credit Notes</h3>
          <div className="text-muted small">Linked to your existing Invoice / Order records</div>
        </div>
        <div className="d-flex gap-2">
          <button className={`btn ${mode === "list" ? "btn-primary" : "btn-outline-primary"}`} onClick={() => { setMode("list"); setPreview(null); loadList(filters); }}>
            Credit Note List
          </button>
          <button className={`btn ${mode === "create" ? "btn-primary" : "btn-outline-primary"}`} onClick={resetEditor}>
            + New Credit Note
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger alert-dismissible no-print" role="alert">
          {error}
          <button type="button" className="btn-close" onClick={() => setError("")} />
        </div>
      )}
      {success && <div className="alert alert-success no-print">{success}</div>}

      {mode === "list" && (
        <CreditNoteList
          list={list}
          filters={filters}
          setFilters={setFilters}
          loading={loading}
          onFilter={applyFilters}
          onReset={resetFilters}
          onCreate={resetEditor}
          onView={viewNote}
          onCancel={cancelNote}
        />
      )}

      {mode === "create" && (
        <div className="card border-0 shadow-sm">
          <div className="card-body">
            <div className="row g-3">
              <div className="col-12 d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div>
                  <h5 className="mb-1">Create Credit Note</h5>
                  <div className="small text-muted">
                    Server validates the original invoice and all previous credit notes again before posting.
                  </div>
                </div>
                <div className="badge text-bg-primary fs-6">₹ {formatMoney(itemTotals.grandTotal)}</div>
              </div>

              <div className="col-md-3">
                <label className="form-label">Credit Note No.</label>
                <input className="form-control" value={form.creditNoteNumber} readOnly />
                {nextNumber && <div className="form-text">Next number is generated by the server.</div>}
              </div>
              <div className="col-md-3">
                <label className="form-label">Credit Note Date</label>
                <input type="date" className="form-control" value={form.creditNoteDate} onChange={(e) => setField("creditNoteDate", e.target.value)} />
              </div>
              <div className="col-md-3">
                <label className="form-label">Reason</label>
                <select
                  className="form-select"
                  value={form.reason}
                  onChange={(e) => {
                    const reason = e.target.value;
                    setForm((current) => ({
                      ...current,
                      reason,
                      creditMode: reason === "Sales Return" ? "ITEM" : current.creditMode,
                      stockAffecting: false,
                    }));
                  }}
                >
                  {REASONS.map((reason) => <option key={reason}>{reason}</option>)}
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label">Credit Basis</label>
                <select className="form-select" value={form.creditMode} onChange={(e) => setField("creditMode", e.target.value)}>
                  {CREDIT_MODES.map((value) => <option key={value} value={value}>{value === "ITEM" ? "Selected Items" : "Manual Amount"}</option>)}
                </select>
              </div>

              <div className="col-12">
                <div className="card border bg-light">
                  <div className="card-body">
                    <div className="row g-3 align-items-end">
                      <div className="col-lg-7 position-relative">
                        <label className="form-label fw-semibold">Original Invoice / Bill</label>
                        <input
                          className="form-control"
                          value={invoiceSearch}
                          disabled={Boolean(selectedInvoice)}
                          onChange={(e) => setInvoiceSearch(e.target.value)}
                          placeholder="Search invoice no., company or GSTIN..."
                        />
                        {!selectedInvoice && (invoiceSearching || invoiceResults.length > 0) && (
                          <div className="position-absolute w-100 bg-white border rounded shadow-sm mt-1" style={{ zIndex: 30, maxHeight: 320, overflowY: "auto" }}>
                            {invoiceSearching && <div className="p-3 text-muted">Searching invoices...</div>}
                            {!invoiceSearching && invoiceResults.map((invoice) => (
                              <button key={invoice._id} type="button" className="dropdown-item p-3 border-bottom text-start" onClick={() => chooseInvoice(invoice)}>
                                <div className="d-flex justify-content-between">
                                  <span className="fw-semibold">{invoice.orderNumber || invoice._id}</span>
                                  <span className="small">₹ {formatMoney(invoice.roundOffFinalRevenue ?? invoice.finalRevenue ?? invoice.totalAmount)}</span>
                                </div>
                                <div className="small text-muted">{invoice.companyName || "Customer"} {invoice.gstNumber ? `• ${invoice.gstNumber}` : ""}</div>
                                <div className="small text-muted">{formatDate(invoice.orderDate)}</div>
                              </button>
                            ))}
                            {!invoiceSearching && invoiceResults.length === 0 && <div className="p-3 text-muted">No matching invoice found.</div>}
                          </div>
                        )}
                      </div>

                      {selectedInvoice && (
                        <div className="col-lg-5 d-flex justify-content-lg-end">
                          <button type="button" className="btn btn-outline-danger" onClick={clearInvoice}>Change Invoice</button>
                        </div>
                      )}

                      {loading && (
                        <div className="col-12 text-muted"><span className="spinner-border spinner-border-sm me-2" />Loading invoice data...</div>
                      )}

                      {selectedInvoice && (
                        <div className="col-12">
                          <div className="row g-3">
                            <Info label="Invoice No." value={selectedInvoice.orderNumber || "-"} />
                            <Info label="Invoice Date" value={formatDate(selectedInvoice.orderDate)} />
                            <Info label="Customer" value={selectedInvoice.companyName || "-"} />
                            <Info label="GSTIN" value={selectedInvoice.gstNumber || "-"} />
                            <Info label="Invoice Total" value={`₹ ${formatMoney(selectedInvoice.invoiceTotal)}`} />
                            <Info label="Current Due" value={`₹ ${formatMoney(invoiceDue)}`} valueClass={invoiceDue > 0 ? "text-danger fw-semibold" : "text-success fw-semibold"} />
                            <Info label="Previous Credit" value={`₹ ${formatMoney(Math.max(0, selectedInvoice.invoiceTotal - (selectedInvoice.remainingCreditTotal ?? selectedInvoice.invoiceTotal)))}`} />
                            <Info label="Payment Status" value={<span className={`badge text-bg-${orderStatusBadge}`}>{selectedInvoice.paymentStatus || "-"}</span>} />
                            <div className="col-lg-8">
                              <div className="small text-muted">Address</div>
                              <div>{[selectedInvoice.Address, selectedInvoice.City, selectedInvoice.State, selectedInvoice.pinCode].filter(Boolean).join(", ") || "-"}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {form.creditMode === "ITEM" && (
                <div className="col-12">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <div>
                      <h6 className="fw-bold mb-1">Credit Items</h6>
                      <div className="small text-muted">Available quantity = invoice billed quantity − previous non-cancelled credit notes.</div>
                    </div>
                    {selectedInvoice && <button type="button" className="btn btn-sm btn-outline-primary" onClick={selectAllAvailable}>Select all available</button>}
                  </div>
                  <div className="table-responsive border rounded">
                    <table className="table table-sm table-hover align-middle mb-0">
                      <thead className="table-light">
                        <tr>
                          <th>Item</th><th>HSN</th><th>Unit</th><th>Billed</th><th>Credited</th><th>Available</th><th>Credit Qty</th><th>Rate</th><th>Disc %</th><th>Tax %</th><th className="text-end">Taxable</th><th className="text-end">Tax</th><th className="text-end">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {!selectedInvoice && <tr><td colSpan="13" className="text-center py-5 text-muted">Select an invoice to load items.</td></tr>}
                        {selectedInvoice && form.items.map((item, index) => {
                          const available = itemAvailableQty(item);
                          const billed = toNumber(item.billedQuantity);
                          const credited = item.qtyUnit === "MTR" ? toNumber(item.previouslyCreditedMTR) : toNumber(item.previouslyCreditedQuantity);
                          return (
                            <tr key={item.sourceSubOrderId}>
                              <td><div className="fw-semibold">{item.orderName || "-"}</div><div className="small text-muted">{item.designNumber}</div>{item.productId ? <span className="badge text-bg-light border">Product linked</span> : <span className="badge text-bg-warning">No product link</span>}</td>
                              <td>{item.hsnCode || "-"}</td>
                              <td>{item.qtyUnit}</td>
                              <td>{formatMoney(billed)}</td>
                              <td>{formatMoney(credited)}</td>
                              <td className={available > 0 ? "text-success fw-semibold" : "text-danger"}>{formatMoney(available)}</td>
                              <td style={{ minWidth: 105 }}>
                                <input type="number" min="0" step="0.01" className="form-control form-control-sm" value={item.qtyUnit === "MTR" ? item.MTR : item.quantity} max={available} disabled={available <= 0} onChange={(e) => updateItem(index, item.qtyUnit === "MTR" ? "MTR" : "quantity", e.target.value)} />
                              </td>
                              <td style={{ minWidth: 100 }}><input type="number" min="0" step="0.01" className="form-control form-control-sm" value={item.unitPrice} onChange={(e) => updateItem(index, "unitPrice", e.target.value)} /></td>
                              <td style={{ minWidth: 90 }}><input type="number" min="0" max="100" step="0.01" className="form-control form-control-sm" value={item.discountRate} onChange={(e) => updateItem(index, "discountRate", e.target.value)} /></td>
                              <td style={{ minWidth: 90 }}><input type="number" min="0" max="100" step="0.01" className="form-control form-control-sm" value={item.taxRate} onChange={(e) => updateItem(index, "taxRate", e.target.value)} /></td>
                              <td className="text-end">₹ {formatMoney(item.taxableAmount)}</td>
                              <td className="text-end">₹ {formatMoney(item.taxAmount)}</td>
                              <td className="text-end fw-semibold">₹ {formatMoney(item.lineTotal)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {form.creditMode === "AMOUNT" && (
                <div className="col-12">
                  <div className="card border">
                    <div className="card-body">
                      <h6 className="fw-bold">Manual Credit Amount</h6>
                      <div className="row g-3">
                        <div className="col-md-5">
                          <label className="form-label">Taxable Credit Amount</label>
                          <input type="number" min="0" step="0.01" className="form-control" value={form.manualTaxableAmount} onChange={(e) => setField("manualTaxableAmount", toNumber(e.target.value))} />
                        </div>
                        <div className="col-md-3">
                          <label className="form-label">Tax %</label>
                          <input type="number" min="0" max="100" step="0.01" className="form-control" value={form.manualTaxRate} onChange={(e) => setField("manualTaxRate", Math.min(100, Math.max(0, toNumber(e.target.value))))} />
                        </div>
                        <div className="col-md-4 d-flex align-items-end">
                          <div className="alert alert-info mb-0 w-100">Credit total: <strong>₹ {formatMoney(itemTotals.grandTotal)}</strong></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="col-lg-7">
                <div className="card border">
                  <div className="card-body">
                    <h6 className="fw-bold">Settlement</h6>
                    <div className="row g-3">
                      <div className="col-md-6">
                        <label className="form-label">Credit Allocation</label>
                        <select className="form-select" value={form.settlementType} onChange={(e) => setField("settlementType", e.target.value)}>
                          <option value="Outstanding">Apply to outstanding</option>
                          <option value="Refund">Refund customer</option>
                          <option value="Customer Credit">Add customer credit</option>
                        </select>
                        {form.settlementType === "Outstanding" && settlementPreview.adjustmentAmount > invoiceDue && <div className="form-text text-danger">This credit is greater than the current invoice due.</div>}
                      </div>
                      {form.settlementType === "Refund" && (
                        <div className="col-md-6">
                          <label className="form-label">Refund Method</label>
                          <select className="form-select" value={form.refundMethod} onChange={(e) => setField("refundMethod", e.target.value)}>{REFUND_METHODS.map((method) => <option key={method}>{method}</option>)}</select>
                        </div>
                      )}
                      <div className="col-12">
                        <label className="form-label">Note</label>
                        <textarea className="form-control" rows="2" value={form.note} onChange={(e) => setField("note", e.target.value)} placeholder="Reason, reference or internal note..." />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-lg-5">
                <div className="card border bg-light">
                  <div className="card-body">
                    <h6 className="fw-bold">Summary</h6>
                    <SummaryRow label="Subtotal" value={itemTotals.subtotal} />
                    <SummaryRow label="Discount" value={itemTotals.discount} />
                    <SummaryRow label="Taxable Value" value={itemTotals.taxable} />
                    <SummaryRow label="Tax" value={itemTotals.tax} />
                    <SummaryRow label="Round Off" value={itemTotals.roundOff} />
                    <hr />
                    <SummaryRow label="Credit Note Total" value={itemTotals.grandTotal} strong />
                    <SummaryRow label="Settlement" value={itemTotals.grandTotal} />
                  </div>
                </div>
              </div>

              {selectedInvoice && form.reason === "Sales Return" && (
                <div className="col-12">
                  <div className={`alert ${canReverseStock ? "alert-success" : "alert-warning"} mb-0`}>
                    <div className="form-check form-switch">
                      <input id="reverseStock" type="checkbox" className="form-check-input" checked={form.stockAffecting} disabled={!canReverseStock} onChange={(e) => setField("stockAffecting", e.target.checked)} />
                      <label className="form-check-label fw-semibold" htmlFor="reverseStock">Reverse inventory for Sales Return</label>
                    </div>
                    <div className="small mt-1">{canReverseStock ? "All selected return items are linked to Product records." : "Stock reversal becomes available after the invoice items are linked to Product records and at least one return quantity is entered."}</div>
                  </div>
                </div>
              )}

              <div className="col-12 d-flex flex-wrap justify-content-end gap-2 no-print">
                <button type="button" className="btn btn-outline-secondary" onClick={() => { setMode("list"); loadList(filters); }}>Cancel</button>
                <button type="button" className="btn btn-outline-primary" disabled={saving} onClick={() => saveCreditNote(false)}>{saving ? "Saving..." : "Save Credit Note"}</button>
                <button type="button" className="btn btn-primary" disabled={saving} onClick={() => saveCreditNote(true)}>{saving ? "Saving..." : "Save & Print"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {mode === "preview" && preview && (
        <CreditNotePreview note={preview} onBack={() => { setMode("list"); loadList(filters); }} onPrint={() => window.print()} onCancel={() => cancelNote(preview)} cancelling={cancelling} />
      )}
    </div>
  );
}

function Info({ label, value, valueClass = "" }) {
  return (
    <div className="col-sm-6 col-lg-3">
      <div className="small text-muted">{label}</div>
      <div className={valueClass}>{value}</div>
    </div>
  );
}

function SummaryRow({ label, value, strong = false }) {
  return (
    <div className={`d-flex justify-content-between mb-2 ${strong ? "fs-5 fw-bold" : ""}`}>
      <span>{label}</span>
      <span>₹ {formatMoney(value)}</span>
    </div>
  );
}

function CreditNoteList({ list, filters, setFilters, loading, onFilter, onReset, onCreate, onView, onCancel }) {
  return (
    <div className="card border-0 shadow-sm">
      <div className="card-body">
        <div className="row g-2 align-items-end mb-3 no-print">
          <div className="col-lg-4"><label className="form-label">Search</label><input className="form-control" placeholder="Credit note, invoice, customer, GSTIN..." value={filters.search} onChange={(e) => setFilters((c) => ({ ...c, search: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && onFilter()} /></div>
          <div className="col-lg-2"><label className="form-label">Reason</label><select className="form-select" value={filters.reason} onChange={(e) => setFilters((c) => ({ ...c, reason: e.target.value }))}><option value="">All</option>{REASONS.map((reason) => <option key={reason}>{reason}</option>)}</select></div>
          <div className="col-lg-1"><label className="form-label">Status</label><select className="form-select" value={filters.status} onChange={(e) => setFilters((c) => ({ ...c, status: e.target.value }))}><option value="">All</option><option>Draft</option><option>Posted</option><option>Cancelled</option></select></div>
          <div className="col-lg-2"><label className="form-label">From</label><input type="date" className="form-control" value={filters.from} onChange={(e) => setFilters((c) => ({ ...c, from: e.target.value }))} /></div>
          <div className="col-lg-2"><label className="form-label">To</label><input type="date" className="form-control" value={filters.to} onChange={(e) => setFilters((c) => ({ ...c, to: e.target.value }))} /></div>
          <div className="col-lg-1 d-flex gap-1"><button className="btn btn-primary w-100" onClick={onFilter}>Go</button><button className="btn btn-outline-secondary" onClick={onReset}>↺</button></div>
        </div>

        <div className="d-flex justify-content-between align-items-center mb-2">
          <div><h6 className="mb-1">Credit Note History</h6><div className="small text-muted">{list.pagination.total || 0} record(s)</div></div>
          <button className="btn btn-primary btn-sm no-print" onClick={onCreate}>+ New</button>
        </div>

        <div className="table-responsive">
          <table className="table table-hover align-middle">
            <thead className="table-light"><tr><th>Credit Note</th><th>Date</th><th>Invoice</th><th>Customer</th><th>Reason</th><th>Settlement</th><th className="text-end">Amount</th><th>Status</th><th className="text-end no-print">Action</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan="9" className="text-center py-5"><span className="spinner-border spinner-border-sm me-2" />Loading...</td></tr>}
              {!loading && list.rows.length === 0 && <tr><td colSpan="9" className="text-center py-5 text-muted">No credit notes found.</td></tr>}
              {!loading && list.rows.map((note) => {
                const settlement = note.settlement || {};
                const settlementLabel = settlement.refundAmount > 0 ? `Refund • ${settlement.refundMethod || "-"}` : settlement.customerCreditAmount > 0 ? "Customer Credit" : "Outstanding";
                return (
                  <tr key={note._id}>
                    <td className="fw-semibold">{note.creditNoteNumber || "-"}</td>
                    <td>{formatDate(note.creditNoteDate)}</td>
                    <td>{note.originalInvoiceNumber || note.originalOrder?.orderNumber || "-"}</td>
                    <td>{note.companyName || "-"}</td>
                    <td>{note.reason || "-"}</td>
                    <td><span className="badge text-bg-light border">{settlementLabel}</span></td>
                    <td className="text-end fw-semibold">₹ {formatMoney(note.totals?.grandTotal)}</td>
                    <td><span className={`badge ${note.status === "Cancelled" ? "text-bg-danger" : note.status === "Draft" ? "text-bg-warning" : "text-bg-success"}`}>{note.status || "Posted"}</span></td>
                    <td className="text-end no-print"><div className="btn-group btn-group-sm"><button className="btn btn-outline-primary" onClick={() => onView(note._id)}>View</button>{note.status === "Posted" && <button className="btn btn-outline-danger" onClick={() => onCancel(note)}>Cancel</button>}</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {list.pagination.pages > 1 && (
          <div className="d-flex justify-content-between align-items-center mt-3 no-print">
            <span className="small text-muted">Page {list.pagination.page} of {list.pagination.pages}</span>
            <div className="btn-group">
              <button className="btn btn-outline-secondary btn-sm" disabled={list.pagination.page <= 1} onClick={() => { const page = list.pagination.page - 1; onFilter({ ...filters, page }); }}>Previous</button>
              <button className="btn btn-outline-secondary btn-sm" disabled={list.pagination.page >= list.pagination.pages} onClick={() => { const page = list.pagination.page + 1; onFilter({ ...filters, page }); }}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CreditNotePreview({ note, onBack, onPrint, onCancel, cancelling }) {
  const items = note.items || [];
  const settlement = note.settlement || {};
  const totals = note.totals || {};

  return (
    <div>
      <div className="d-flex justify-content-end gap-2 mb-3 no-print">
        <button className="btn btn-outline-secondary" onClick={onBack}>Back</button>
        {note.status === "Posted" && <button className="btn btn-outline-danger" disabled={cancelling} onClick={onCancel}>{cancelling ? "Cancelling..." : "Cancel Credit Note"}</button>}
        <button className="btn btn-primary" onClick={onPrint}>Print</button>
      </div>

      <div className="card border-0">
        <div className="card-body">
          <div className="row border-bottom pb-3 mb-4">
            <div className="col-7"><h2 className="fw-bold mb-1">CREDIT NOTE</h2><div className="text-muted">{note.reason || "-"}</div></div>
            <div className="col-5 text-end"><div className="fw-bold">{note.creditNoteNumber}</div><div>Date: {formatDate(note.creditNoteDate)}</div><div>Original Invoice: {note.originalInvoiceNumber || note.originalOrder?.orderNumber || "-"}</div></div>
          </div>

          <div className="row mb-4">
            <div className="col-md-6"><div className="small text-muted">Customer</div><div className="fw-bold">{note.companyName || note.originalOrder?.companyName || "-"}</div><div>{note.Address}</div><div>{[note.City, note.State, note.pinCode].filter(Boolean).join(", ")}</div><div>GSTIN: {note.gstNumber || "-"}</div></div>
            <div className="col-md-6 text-md-end"><div>Invoice Date: {formatDate(note.originalInvoiceDate || note.originalOrder?.orderDate)}</div><div>Status: {note.status || "Posted"}</div><div>Credit Basis: {note.creditMode === "AMOUNT" ? "Manual Amount" : "Selected Items"}</div></div>
          </div>

          {items.length > 0 && <div className="table-responsive"><table className="table table-bordered align-middle"><thead className="table-light"><tr><th>#</th><th>Description</th><th>HSN</th><th>Qty</th><th>Rate</th><th>Disc.</th><th>Taxable</th><th>Tax</th><th className="text-end">Amount</th></tr></thead><tbody>{items.map((item, index) => <tr key={item._id || index}><td>{index + 1}</td><td><div className="fw-semibold">{item.orderName || "-"}</div><div className="small text-muted">{item.designNumber}</div></td><td>{item.hsnCode || "-"}</td><td>{item.qtyUnit === "MTR" ? `${formatMoney(item.MTR)} MTR` : `${formatMoney(item.quantity)} PCS`}</td><td>₹ {formatMoney(item.unitPrice)}</td><td>{formatMoney(item.discountRate)}%</td><td>₹ {formatMoney(item.taxableAmount)}</td><td>₹ {formatMoney(item.taxAmount)}</td><td className="text-end">₹ {formatMoney(item.lineTotal)}</td></tr>)}</tbody></table></div>}

          <div className="row justify-content-end"><div className="col-md-5 col-lg-4"><SummaryRow label="Subtotal" value={totals.subtotal} /><SummaryRow label="Discount" value={totals.discountAmount} /><SummaryRow label="Taxable" value={totals.taxableAmount} /><SummaryRow label="Tax" value={totals.taxAmount} /><SummaryRow label="Round Off" value={totals.roundOff} /><hr /><SummaryRow label="Total" value={totals.grandTotal} strong /></div></div>

          <div className="row mt-4">
            <div className="col-md-6"><div className="small text-muted">Settlement</div><div>{settlement.adjustmentAmount > 0 ? `Applied to outstanding: ₹ ${formatMoney(settlement.adjustmentAmount)}` : settlement.refundAmount > 0 ? `Refund: ₹ ${formatMoney(settlement.refundAmount)} via ${settlement.refundMethod || "-"}` : settlement.customerCreditAmount > 0 ? `Customer credit: ₹ ${formatMoney(settlement.customerCreditAmount)}` : "-"}</div></div>
            <div className="col-md-6 text-md-end"><div>Inventory: {note.stockAffecting ? note.inventoryStatus || "Processed" : "Not affected"}</div></div>
          </div>

          {note.note && <div className="mt-4"><div className="small text-muted">Note</div><div>{note.note}</div></div>}
          {note.status === "Cancelled" && <div className="alert alert-danger mt-4 mb-0"><strong>Cancelled</strong>{note.cancellationReason ? ` — ${note.cancellationReason}` : ""} {note.cancelledAt ? `(${formatDate(note.cancelledAt)})` : ""}</div>}
          <div className="border-top mt-5 pt-3 text-center small text-muted">Credit note reference: {note.creditNoteNumber}</div>
        </div>
      </div>

      <style>{`@media print { .no-print { display:none !important; } body { background:#fff !important; } .container-fluid { padding:0 !important; } .card { box-shadow:none !important; border:0 !important; } }`}</style>
    </div>
  );
}
