import React, { useEffect, useMemo, useState } from "react";

/**
 * CreditNote.jsx
 *
 * MERN / React Vite
 * - Bootstrap classes only (no react-bootstrap)
 * - Uses native fetch (no axios dependency)
 * - Designed around the supplied Order schema
 *
 * Expected backend endpoints:
 *   GET  /api/credit-notes?search=&reason=&from=&to=
 *   GET  /api/credit-notes/next-number
 *   GET  /api/orders?search=<invoiceNo/customer/company>
 *   GET  /api/orders/:id
 *   GET  /api/credit-notes/available/:orderId
 *   POST /api/credit-notes
 *   GET  /api/credit-notes/:id
 *   DELETE /api/credit-notes/:id   (recommended: draft-only)
 *
 * API response may be either the data itself or { data: ... } / { orders: ... }.
 */

const API_BASE = import.meta.env.VITE_API_URL || "";

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

const emptyItem = () => ({
  sourceSubOrderId: "",
  designNumber: "",
  orderName: "",
  hsnCode: "",
  qtyUnit: "PCS",
  originalQuantity: 0,
  originalMTR: 0,
  originalShortPcs: 0,
  previouslyCreditedQuantity: 0,
  previouslyCreditedMTR: 0,
  quantity: 0,
  MTR: 0,
  cut: 0,
  shortPcs: 0,
  unitPrice: 0,
  discountRate: 0,
  taxRate: 0,
  taxableAmount: 0,
  taxAmount: 0,
  lineTotal: 0,
});

function money(value) {
  const number = Number(value || 0);
  return number.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(value) {
  return Math.round((num(value) + Number.EPSILON) * 100) / 100;
}

function effectiveQty(item) {
  return item.qtyUnit === "MTR" ? num(item.MTR) : num(item.quantity);
}

function availableQty(item) {
  return Math.max(
    0,
    round2(
      effectiveQty(item) -
        (item.qtyUnit === "MTR"
          ? num(item.previouslyCreditedMTR)
          : num(item.previouslyCreditedQuantity))
    )
  );
}

function displayOrderNumber(order) {
  return order?.orderNumber || order?._id || "";
}

function normalizeOrders(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.orders || payload?.data || payload?.results || [];
}

function normalizeCreditNotes(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.creditNotes || payload?.data || payload?.results || [];
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error ||
      (typeof payload === "string" ? payload : "Request failed");
    throw new Error(message);
  }

  return payload;
}

function getInitialForm() {
  return {
    creditNoteNumber: "",
    creditNoteDate: new Date().toISOString().slice(0, 10),
    reason: "Sales Return",
    originalOrderId: "",
    adjustmentType: "Outstanding",
    refundMethod: "Cash",
    adjustmentAmount: 0,
    refundAmount: 0,
    note: "",
    stockAffecting: true,
    items: [],
  };
}

export default function CreditNote() {
  const [view, setView] = useState("list");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [creditNotes, setCreditNotes] = useState([]);
  const [filters, setFilters] = useState({
    search: "",
    reason: "",
    from: "",
    to: "",
  });

  const [form, setForm] = useState(getInitialForm());
  const [orderSearch, setOrderSearch] = useState("");
  const [orders, setOrders] = useState([]);
  const [orderLoading, setOrderLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [creditableLoading, setCreditableLoading] = useState(false);

  const [previewNote, setPreviewNote] = useState(null);

  const totals = useMemo(() => {
    const subtotal = round2(
      form.items.reduce((sum, item) => sum + num(item.lineTotalBeforeDiscount), 0)
    );
    const discount = round2(
      form.items.reduce((sum, item) => sum + num(item.discountAmount), 0)
    );
    const taxable = round2(
      form.items.reduce((sum, item) => sum + num(item.taxableAmount), 0)
    );
    const tax = round2(
      form.items.reduce((sum, item) => sum + num(item.taxAmount), 0)
    );
    const beforeRound = round2(taxable + tax);
    const grandTotal = Math.round(beforeRound);
    const roundOff = round2(grandTotal - beforeRound);

    const adjustment = Math.min(
      round2(num(form.adjustmentAmount)),
      grandTotal
    );
    const refund = Math.min(
      round2(num(form.refundAmount)),
      Math.max(0, grandTotal - adjustment)
    );
    const unallocated = round2(grandTotal - adjustment - refund);

    return {
      subtotal,
      discount,
      taxable,
      tax,
      beforeRound,
      roundOff,
      grandTotal,
      adjustment,
      refund,
      unallocated,
    };
  }, [form]);

  useEffect(() => {
    loadCreditNotes();
    loadNextNumber();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (orderSearch.trim().length >= 2) {
        searchOrders(orderSearch.trim());
      } else {
        setOrders([]);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [orderSearch]);

  async function loadCreditNotes() {
    try {
      setLoading(true);
      setError("");
      const query = new URLSearchParams();
      if (filters.search) query.set("search", filters.search);
      if (filters.reason) query.set("reason", filters.reason);
      if (filters.from) query.set("from", filters.from);
      if (filters.to) query.set("to", filters.to);

      const payload = await api(`/api/credit-notes?${query.toString()}`);
      setCreditNotes(normalizeCreditNotes(payload));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadNextNumber() {
    try {
      const payload = await api("/api/credit-notes/next-number");
      const number =
        payload?.creditNoteNumber ||
        payload?.nextNumber ||
        payload?.data?.creditNoteNumber ||
        "";
      setForm((current) => ({
        ...current,
        creditNoteNumber: number || current.creditNoteNumber,
      }));
    } catch {
      // Keep the page functional even if the backend does not expose numbering yet.
    }
  }

  async function searchOrders(search) {
    try {
      setOrderLoading(true);
      const payload = await api(
        `/api/orders?search=${encodeURIComponent(search)}&limit=20`
      );
      setOrders(normalizeOrders(payload));
    } catch (err) {
      setError(err.message);
    } finally {
      setOrderLoading(false);
    }
  }

  async function selectOrder(order) {
    try {
      setError("");
      setCreditableLoading(true);

      let fullOrder = order;
      if (order?._id) {
        try {
          fullOrder = await api(`/api/orders/${order._id}`);
          fullOrder = fullOrder?.data || fullOrder?.order || fullOrder;
        } catch {
          // Search result can already contain the full order.
        }
      }

      let available = null;
      try {
        const payload = await api(`/api/credit-notes/available/${order._id}`);
        available = payload?.items || payload?.data || payload;
      } catch {
        // Fallback to the Order schema when endpoint is not yet available.
      }

      const sourceItems =
        Array.isArray(available) && available.length
          ? available
          : fullOrder?.subOrders || [];

      const items = sourceItems.map((sub, index) => {
        const existingQty =
          num(sub.previouslyCreditedQuantity) ||
          num(sub.creditedQuantity) ||
          0;
        const existingMTR =
          num(sub.previouslyCreditedMTR) ||
          num(sub.creditedMTR) ||
          0;

        const qtyUnit = sub.qtyUnit || "PCS";
        const sourceQty =
          qtyUnit === "MTR" ? num(sub.MTR) : num(sub.quantity);

        return recalculateItem({
          ...emptyItem(),
          sourceSubOrderId: sub._id || String(index),
          designNumber: sub.designNumber || "",
          orderName: sub.orderName || "",
          hsnCode: sub.hsnCode ?? "",
          qtyUnit,
          originalQuantity: num(sub.quantity),
          originalMTR: num(sub.MTR),
          originalShortPcs: num(sub.shortPcs),
          previouslyCreditedQuantity: existingQty,
          previouslyCreditedMTR: existingMTR,
          quantity: 0,
          MTR: 0,
          cut: num(sub.cut),
          shortPcs: num(sub.shortPcs),
          unitPrice: num(sub.unitPrice),
          discountRate: num(fullOrder?.discountRate),
          taxRate: num(fullOrder?.taxPercentage),
        });
      });

      setSelectedOrder(fullOrder);
      setOrderSearch(displayOrderNumber(fullOrder));
      setOrders([]);
      setForm((current) => ({
        ...current,
        originalOrderId: fullOrder?._id || "",
        adjustmentType: "Outstanding",
        adjustmentAmount: 0,
        refundAmount: 0,
        stockAffecting: current.reason === "Sales Return",
        items,
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setCreditableLoading(false);
    }
  }

  function recalculateItem(item) {
    const taxableBase =
      item.qtyUnit === "MTR" ? num(item.MTR) : num(item.quantity);

    const lineTotalBeforeDiscount = round2(taxableBase * num(item.unitPrice));
    const discountAmount = round2(
      (lineTotalBeforeDiscount * num(item.discountRate)) / 100
    );
    const taxableAmount = round2(lineTotalBeforeDiscount - discountAmount);
    const taxAmount = round2((taxableAmount * num(item.taxRate)) / 100);
    const lineTotal = round2(taxableAmount + taxAmount);

    return {
      ...item,
      lineTotalBeforeDiscount,
      discountAmount,
      taxableAmount,
      taxAmount,
      lineTotal,
    };
  }

  function updateItem(index, field, value) {
    setForm((current) => {
      const items = [...current.items];
      const item = { ...items[index] };
      const numericFields = new Set([
        "quantity",
        "MTR",
        "cut",
        "shortPcs",
        "unitPrice",
        "discountRate",
        "taxRate",
      ]);

      item[field] = numericFields.has(field) ? num(value) : value;

      if (field === "quantity" || field === "MTR") {
        const max = availableQty(item);
        if (item.qtyUnit === "MTR") {
          item.MTR = Math.min(num(item.MTR), max);
        } else {
          item.quantity = Math.min(num(item.quantity), max);
        }
      }

      items[index] = recalculateItem(item);
      return { ...current, items };
    });
  }

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "reason"
        ? {
            stockAffecting: value === "Sales Return",
          }
        : {}),
    }));
  }

  function clearSelectedOrder() {
    setSelectedOrder(null);
    setOrders([]);
    setOrderSearch("");
    setForm((current) => ({
      ...current,
      originalOrderId: "",
      items: [],
      adjustmentAmount: 0,
      refundAmount: 0,
    }));
  }

  function validate() {
    if (!form.creditNoteNumber.trim()) return "Credit Note number is required.";
    if (!form.creditNoteDate) return "Credit Note date is required.";
    if (!form.reason) return "Select a credit note reason.";
    if (!form.originalOrderId) return "Select an original invoice/bill.";
    if (!form.items.length) return "The selected invoice has no creditable items.";

    const activeItems = form.items.filter((item) =>
      item.qtyUnit === "MTR" ? num(item.MTR) > 0 : num(item.quantity) > 0
    );

    if (!activeItems.length) {
      return "Enter a credit quantity for at least one item.";
    }

    for (const item of activeItems) {
      const requested = effectiveQty(item);
      const max = availableQty(item);
      if (requested <= 0) return `Enter a valid quantity for ${item.orderName}.`;
      if (requested > max) {
        return `Credit quantity for "${item.orderName}" cannot exceed ${max}.`;
      }
      if (num(item.unitPrice) < 0) {
        return `Rate cannot be negative for "${item.orderName}".`;
      }
      if (num(item.taxRate) < 0) {
        return `Tax rate cannot be negative for "${item.orderName}".`;
      }
    }

    if (num(form.adjustmentAmount) + num(form.refundAmount) > totals.grandTotal) {
      return "Adjustment + refund cannot exceed the credit note total.";
    }

    return "";
  }

  function getPayload() {
    const activeItems = form.items
      .filter((item) =>
        item.qtyUnit === "MTR" ? num(item.MTR) > 0 : num(item.quantity) > 0
      )
      .map((item) => ({
        sourceSubOrderId: item.sourceSubOrderId || undefined,
        designNumber: item.designNumber,
        orderName: item.orderName,
        hsnCode: item.hsnCode || undefined,
        qtyUnit: item.qtyUnit,
        quantity: num(item.quantity),
        MTR: num(item.MTR),
        cut: num(item.cut),
        shortPcs: num(item.shortPcs),
        unitPrice: num(item.unitPrice),
        discountRate: num(item.discountRate),
        taxRate: num(item.taxRate),
        lineTotalBeforeDiscount: num(item.lineTotalBeforeDiscount),
        discountAmount: num(item.discountAmount),
        taxableAmount: num(item.taxableAmount),
        taxAmount: num(item.taxAmount),
        lineTotal: num(item.lineTotal),
      }));

    return {
      creditNoteNumber: form.creditNoteNumber.trim(),
      creditNoteDate: form.creditNoteDate,
      reason: form.reason,
      originalOrderId: form.originalOrderId,
      stockAffecting: Boolean(form.stockAffecting),
      adjustment: {
        type: form.adjustmentType,
        amount: totals.adjustment,
      },
      refund: {
        method: form.refundAmount > 0 ? form.refundMethod : null,
        amount: totals.refund,
      },
      note: form.note.trim(),
      items: activeItems,
      totals: {
        subtotal: totals.subtotal,
        discountAmount: totals.discount,
        taxableAmount: totals.taxable,
        taxAmount: totals.tax,
        roundOff: totals.roundOff,
        grandTotal: totals.grandTotal,
      },
    };
  }

  async function saveCreditNote({ printAfterSave = false } = {}) {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const payload = await api("/api/credit-notes", {
        method: "POST",
        body: JSON.stringify(getPayload()),
      });

      const created =
        payload?.creditNote || payload?.data || payload;

      setPreviewNote(created);
      setSuccess(
        `Credit Note ${created?.creditNoteNumber || form.creditNoteNumber} saved successfully.`
      );

      await loadCreditNotes();

      if (printAfterSave) {
        setTimeout(() => window.print(), 150);
      } else {
        startNew();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function startNew() {
    setForm(getInitialForm());
    setSelectedOrder(null);
    setOrderSearch("");
    setOrders([]);
    setError("");
    setSuccess("");
    setPreviewNote(null);
    loadNextNumber();
    setView("create");
  }

  function openList() {
    setView("list");
    setPreviewNote(null);
    setError("");
    loadCreditNotes();
  }

  async function openCreditNote(id) {
    try {
      setLoading(true);
      const payload = await api(`/api/credit-notes/${id}`);
      const note = payload?.creditNote || payload?.data || payload;
      setPreviewNote(note);
      setView("preview");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteCreditNote(id) {
    const confirmed = window.confirm(
      "Delete this credit note? This should only be used for draft/unposted notes."
    );
    if (!confirmed) return;

    try {
      setLoading(true);
      await api(`/api/credit-notes/${id}`, { method: "DELETE" });
      await loadCreditNotes();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function resetFilters() {
    setFilters({ search: "", reason: "", from: "", to: "" });
    setTimeout(loadCreditNotes, 0);
  }

  const invoicePayments = selectedOrder?.payments || [];
  const invoiceTotal = num(
    selectedOrder?.roundOffFinalRevenue ??
      selectedOrder?.finalRevenue ??
      selectedOrder?.totalAmount
  );
  const invoicePaid = num(selectedOrder?.paidAmount);
  const invoiceDue = Math.max(
    0,
    num(selectedOrder?.dueAmount ?? invoiceTotal - invoicePaid)
  );

  return (
    <div className="container-fluid py-3">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3 no-print">
        <div>
          <h3 className="mb-1 fw-bold">Credit Notes</h3>
          <div className="text-muted small">
            Returns, invoice corrections, discounts and other customer credits
          </div>
        </div>

        <div className="btn-group">
          <button
            className={`btn btn-sm ${
              view === "list" ? "btn-primary" : "btn-outline-primary"
            }`}
            onClick={openList}
          >
            Credit Notes
          </button>
          <button
            className={`btn btn-sm ${
              view === "create" ? "btn-primary" : "btn-outline-primary"
            }`}
            onClick={startNew}
          >
            + Create Credit Note
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger d-flex justify-content-between gap-2 no-print">
          <span>{error}</span>
          <button className="btn-close" onClick={() => setError("")} />
        </div>
      )}

      {success && (
        <div className="alert alert-success no-print">{success}</div>
      )}

      {view === "list" && (
        <CreditNoteList
          creditNotes={creditNotes}
          filters={filters}
          setFilters={setFilters}
          loading={loading}
          onSearch={loadCreditNotes}
          onReset={resetFilters}
          onCreate={startNew}
          onView={openCreditNote}
          onDelete={deleteCreditNote}
        />
      )}

      {view === "create" && (
        <div className="card border-0 shadow-sm">
          <div className="card-body">
            <div className="row g-3">
              <div className="col-12">
                <div className="d-flex justify-content-between align-items-center">
                  <h5 className="mb-0">Create Credit Note</h5>
                  <span className="badge text-bg-light border">
                    Total: ₹ {money(totals.grandTotal)}
                  </span>
                </div>
                <hr />
              </div>

              <div className="col-md-3">
                <label className="form-label">Credit Note No.</label>
                <input
                  className="form-control"
                  value={form.creditNoteNumber}
                  onChange={(e) =>
                    updateForm("creditNoteNumber", e.target.value)
                  }
                  placeholder="Auto generated"
                />
              </div>

              <div className="col-md-3">
                <label className="form-label">Credit Note Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={form.creditNoteDate}
                  onChange={(e) =>
                    updateForm("creditNoteDate", e.target.value)
                  }
                />
              </div>

              <div className="col-md-3">
                <label className="form-label">Reason</label>
                <select
                  className="form-select"
                  value={form.reason}
                  onChange={(e) => updateForm("reason", e.target.value)}
                >
                  {REASONS.map((reason) => (
                    <option key={reason}>{reason}</option>
                  ))}
                </select>
              </div>

              <div className="col-md-3 d-flex align-items-end">
                <div className="form-check form-switch mb-2">
                  <input
                    id="stockAffecting"
                    className="form-check-input"
                    type="checkbox"
                    checked={form.stockAffecting}
                    onChange={(e) =>
                      updateForm("stockAffecting", e.target.checked)
                    }
                  />
                  <label className="form-check-label" htmlFor="stockAffecting">
                    Reverse stock
                  </label>
                </div>
              </div>

              <div className="col-12">
                <div className="card bg-light border">
                  <div className="card-body">
                    <div className="row g-3 align-items-end">
                      <div className="col-lg-7">
                        <label className="form-label fw-semibold">
                          Original Invoice / Bill
                        </label>
                        <div className="position-relative">
                          <input
                            className="form-control"
                            value={orderSearch}
                            onChange={(e) => setOrderSearch(e.target.value)}
                            placeholder="Search invoice number, company, GSTIN..."
                          />

                          {(orderLoading || orders.length > 0) && (
                            <div
                              className="position-absolute bg-white border rounded shadow-sm w-100 mt-1"
                              style={{
                                zIndex: 20,
                                maxHeight: 280,
                                overflowY: "auto",
                              }}
                            >
                              {orderLoading && (
                                <div className="p-3 text-muted">
                                  Searching invoices...
                                </div>
                              )}

                              {!orderLoading &&
                                orders.map((order) => (
                                  <button
                                    key={order._id}
                                    type="button"
                                    className="dropdown-item p-3 border-bottom text-start"
                                    onClick={() => selectOrder(order)}
                                  >
                                    <div className="fw-semibold">
                                      {displayOrderNumber(order)}
                                    </div>
                                    <div className="small text-muted">
                                      {order.companyName ||
                                        order.company ||
                                        "Customer"}{" "}
                                      {order.gstNumber
                                        ? `• ${order.gstNumber}`
                                        : ""}
                                    </div>
                                    <div className="small">
                                      Date:{" "}
                                      {order.orderDate
                                        ? new Date(
                                            order.orderDate
                                          ).toLocaleDateString("en-IN")
                                        : "-"}
                                    </div>
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {creditableLoading && (
                        <div className="col-lg-5 text-muted">
                          <span className="spinner-border spinner-border-sm me-2" />
                          Loading invoice items and existing credits...
                        </div>
                      )}

                      {selectedOrder && (
                        <div className="col-12">
                          <div className="row g-3">
                            <div className="col-lg-3">
                              <div className="small text-muted">Invoice No.</div>
                              <div className="fw-semibold">
                                {displayOrderNumber(selectedOrder)}
                              </div>
                            </div>
                            <div className="col-lg-3">
                              <div className="small text-muted">Invoice Date</div>
                              <div>
                                {selectedOrder.orderDate
                                  ? new Date(
                                      selectedOrder.orderDate
                                    ).toLocaleDateString("en-IN")
                                  : "-"}
                              </div>
                            </div>
                            <div className="col-lg-3">
                              <div className="small text-muted">Customer</div>
                              <div className="fw-semibold">
                                {selectedOrder.companyName || "-"}
                              </div>
                            </div>
                            <div className="col-lg-3 text-lg-end">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                onClick={clearSelectedOrder}
                              >
                                Change Invoice
                              </button>
                            </div>

                            <div className="col-lg-4">
                              <div className="small text-muted">GSTIN</div>
                              <div>{selectedOrder.gstNumber || "-"}</div>
                            </div>
                            <div className="col-lg-4">
                              <div className="small text-muted">
                                Original Invoice Total
                              </div>
                              <div className="fw-semibold">
                                ₹ {money(invoiceTotal)}
                              </div>
                            </div>
                            <div className="col-lg-2">
                              <div className="small text-muted">Paid</div>
                              <div>₹ {money(invoicePaid)}</div>
                            </div>
                            <div className="col-lg-2">
                              <div className="small text-muted">Due</div>
                              <div className="text-danger fw-semibold">
                                ₹ {money(invoiceDue)}
                              </div>
                            </div>

                            <div className="col-12">
                              <div className="small text-muted">Address</div>
                              <div>
                                {[
                                  selectedOrder.Address,
                                  selectedOrder.City,
                                  selectedOrder.State,
                                  selectedOrder.pinCode,
                                ]
                                  .filter(Boolean)
                                  .join(", ") || "-"}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-12">
                <h6 className="fw-bold mb-2">Credit Items</h6>
                <div className="table-responsive border rounded">
                  <table className="table table-sm table-hover align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th style={{ minWidth: 160 }}>Design / Item</th>
                        <th>HSN</th>
                        <th>Unit</th>
                        <th>Original</th>
                        <th>Already Credited</th>
                        <th>Available</th>
                        <th style={{ width: 105 }}>Credit Qty</th>
                        <th style={{ width: 105 }}>MTR</th>
                        <th style={{ width: 110 }}>Rate</th>
                        <th style={{ width: 90 }}>Disc %</th>
                        <th style={{ width: 90 }}>Tax %</th>
                        <th className="text-end">Taxable</th>
                        <th className="text-end">Tax</th>
                        <th className="text-end">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!selectedOrder && (
                        <tr>
                          <td colSpan="14" className="text-center py-5 text-muted">
                            Select an invoice to load creditable items.
                          </td>
                        </tr>
                      )}

                      {selectedOrder &&
                        form.items.map((item, index) => {
                          const available = availableQty(item);
                          const hasQuantity =
                            item.qtyUnit === "MTR"
                              ? num(item.MTR) > 0
                              : num(item.quantity) > 0;

                          return (
                            <tr key={item.sourceSubOrderId || index}>
                              <td>
                                <div className="fw-semibold">
                                  {item.orderName || "-"}
                                </div>
                                <div className="small text-muted">
                                  {item.designNumber || ""}
                                </div>
                              </td>
                              <td>{item.hsnCode || "-"}</td>
                              <td>{item.qtyUnit}</td>
                              <td>
                                {item.qtyUnit === "MTR"
                                  ? money(item.originalMTR)
                                  : money(item.originalQuantity)}
                              </td>
                              <td>
                                {item.qtyUnit === "MTR"
                                  ? money(item.previouslyCreditedMTR)
                                  : money(item.previouslyCreditedQuantity)}
                              </td>
                              <td>
                                <span
                                  className={
                                    available > 0
                                      ? "text-success fw-semibold"
                                      : "text-danger"
                                  }
                                >
                                  {money(available)}
                                </span>
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="0"
                                  max={
                                    item.qtyUnit === "PCS"
                                      ? available
                                      : undefined
                                  }
                                  step="0.01"
                                  className="form-control form-control-sm"
                                  value={
                                    item.qtyUnit === "MTR" ? "" : item.quantity
                                  }
                                  disabled={item.qtyUnit === "MTR" || available <= 0}
                                  onChange={(e) =>
                                    updateItem(
                                      index,
                                      "quantity",
                                      e.target.value
                                    )
                                  }
                                  placeholder={
                                    item.qtyUnit === "MTR" ? "MTR" : "0"
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="0"
                                  max={
                                    item.qtyUnit === "MTR" ? available : undefined
                                  }
                                  step="0.01"
                                  className="form-control form-control-sm"
                                  value={item.MTR}
                                  disabled={item.qtyUnit !== "MTR" || available <= 0}
                                  onChange={(e) =>
                                    updateItem(index, "MTR", e.target.value)
                                  }
                                  placeholder={
                                    item.qtyUnit === "MTR" ? "0" : "-"
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  className="form-control form-control-sm"
                                  value={item.unitPrice}
                                  onChange={(e) =>
                                    updateItem(
                                      index,
                                      "unitPrice",
                                      e.target.value
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.01"
                                  className="form-control form-control-sm"
                                  value={item.discountRate}
                                  onChange={(e) =>
                                    updateItem(
                                      index,
                                      "discountRate",
                                      e.target.value
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  className="form-control form-control-sm"
                                  value={item.taxRate}
                                  onChange={(e) =>
                                    updateItem(index, "taxRate", e.target.value)
                                  }
                                />
                              </td>
                              <td className="text-end">
                                ₹ {money(item.taxableAmount)}
                              </td>
                              <td className="text-end">
                                ₹ {money(item.taxAmount)}
                              </td>
                              <td className="text-end fw-semibold">
                                ₹ {money(item.lineTotal)}
                                {hasQuantity && (
                                  <div className="small text-success">Credit</div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="col-lg-7">
                <div className="card border">
                  <div className="card-body">
                    <h6 className="fw-bold">Credit Allocation</h6>
                    <div className="row g-3">
                      <div className="col-md-5">
                        <label className="form-label">Adjustment Type</label>
                        <select
                          className="form-select"
                          value={form.adjustmentType}
                          onChange={(e) =>
                            updateForm("adjustmentType", e.target.value)
                          }
                        >
                          <option value="Outstanding">
                            Adjust against outstanding
                          </option>
                          <option value="Advance">
                            Adjust against customer advance
                          </option>
                          <option value="Other">Other adjustment</option>
                        </select>
                      </div>

                      <div className="col-md-3">
                        <label className="form-label">Adjustment Amount</label>
                        <input
                          type="number"
                          min="0"
                          max={totals.grandTotal}
                          step="0.01"
                          className="form-control"
                          value={form.adjustmentAmount}
                          onChange={(e) =>
                            updateForm("adjustmentAmount", num(e.target.value))
                          }
                        />
                      </div>

                      <div className="col-md-4">
                        <label className="form-label">Refund Amount</label>
                        <input
                          type="number"
                          min="0"
                          max={totals.grandTotal}
                          step="0.01"
                          className="form-control"
                          value={form.refundAmount}
                          onChange={(e) =>
                            updateForm("refundAmount", num(e.target.value))
                          }
                        />
                      </div>

                      <div className="col-md-4">
                        <label className="form-label">Refund Method</label>
                        <select
                          className="form-select"
                          value={form.refundMethod}
                          onChange={(e) =>
                            updateForm("refundMethod", e.target.value)
                          }
                        >
                          {PAYMENT_METHODS.map((method) => (
                            <option key={method}>{method}</option>
                          ))}
                        </select>
                      </div>

                      <div className="col-md-8">
                        <label className="form-label">Note</label>
                        <textarea
                          className="form-control"
                          rows="2"
                          value={form.note}
                          onChange={(e) => updateForm("note", e.target.value)}
                          placeholder="Reason / internal note..."
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-lg-5">
                <div className="border rounded p-3 bg-light">
                  <div className="d-flex justify-content-between mb-2">
                    <span>Subtotal</span>
                    <span>₹ {money(totals.subtotal)}</span>
                  </div>
                  <div className="d-flex justify-content-between mb-2">
                    <span>Discount</span>
                    <span>₹ {money(totals.discount)}</span>
                  </div>
                  <div className="d-flex justify-content-between mb-2">
                    <span>Taxable Value</span>
                    <span>₹ {money(totals.taxable)}</span>
                  </div>
                  <div className="d-flex justify-content-between mb-2">
                    <span>Tax</span>
                    <span>₹ {money(totals.tax)}</span>
                  </div>
                  <div className="d-flex justify-content-between mb-2">
                    <span>Round Off</span>
                    <span>₹ {money(totals.roundOff)}</span>
                  </div>
                  <hr />
                  <div className="d-flex justify-content-between fs-5 fw-bold">
                    <span>Credit Note Total</span>
                    <span>₹ {money(totals.grandTotal)}</span>
                  </div>

                  <div className="d-flex justify-content-between mt-3">
                    <span>Outstanding Adjustment</span>
                    <span>₹ {money(totals.adjustment)}</span>
                  </div>
                  <div className="d-flex justify-content-between mt-1">
                    <span>Refund</span>
                    <span>₹ {money(totals.refund)}</span>
                  </div>
                  <div className="d-flex justify-content-between mt-1">
                    <span>Unallocated</span>
                    <span className="fw-semibold">
                      ₹ {money(totals.unallocated)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="col-12 d-flex flex-wrap justify-content-end gap-2 no-print">
                <button className="btn btn-outline-secondary" onClick={openList}>
                  Cancel
                </button>
                <button
                  className="btn btn-outline-primary"
                  disabled={saving}
                  onClick={() => saveCreditNote()}
                >
                  {saving ? "Saving..." : "Save Credit Note"}
                </button>
                <button
                  className="btn btn-primary"
                  disabled={saving}
                  onClick={() => saveCreditNote({ printAfterSave: true })}
                >
                  {saving ? "Saving..." : "Save & Print"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {view === "preview" && previewNote && (
        <CreditNotePrint
          note={previewNote}
          onBack={openList}
          onPrint={() => window.print()}
        />
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .container-fluid { padding: 0 !important; }
          .card, .shadow-sm { box-shadow: none !important; }
        }
      `}</style>
    </div>
  );
}

function CreditNoteList({
  creditNotes,
  filters,
  setFilters,
  loading,
  onSearch,
  onReset,
  onCreate,
  onView,
  onDelete,
}) {
  return (
    <div className="card border-0 shadow-sm">
      <div className="card-body">
        <div className="row g-2 mb-3 no-print">
          <div className="col-lg-4">
            <input
              className="form-control"
              placeholder="Search credit note / invoice / customer..."
              value={filters.search}
              onChange={(e) =>
                setFilters((current) => ({
                  ...current,
                  search: e.target.value,
                }))
              }
              onKeyDown={(e) => e.key === "Enter" && onSearch()}
            />
          </div>

          <div className="col-lg-2">
            <select
              className="form-select"
              value={filters.reason}
              onChange={(e) =>
                setFilters((current) => ({
                  ...current,
                  reason: e.target.value,
                }))
              }
            >
              <option value="">All Reasons</option>
              {REASONS.map((reason) => (
                <option key={reason}>{reason}</option>
              ))}
            </select>
          </div>

          <div className="col-lg-2">
            <input
              type="date"
              className="form-control"
              value={filters.from}
              onChange={(e) =>
                setFilters((current) => ({
                  ...current,
                  from: e.target.value,
                }))
              }
            />
          </div>

          <div className="col-lg-2">
            <input
              type="date"
              className="form-control"
              value={filters.to}
              onChange={(e) =>
                setFilters((current) => ({
                  ...current,
                  to: e.target.value,
                }))
              }
            />
          </div>

          <div className="col-lg-2 d-flex gap-2">
            <button className="btn btn-primary flex-grow-1" onClick={onSearch}>
              Filter
            </button>
            <button className="btn btn-outline-secondary" onClick={onReset}>
              Reset
            </button>
          </div>
        </div>

        <div className="d-flex justify-content-between align-items-center mb-2">
          <h6 className="mb-0">Credit Note History</h6>
          <button className="btn btn-primary btn-sm no-print" onClick={onCreate}>
            + New
          </button>
        </div>

        <div className="table-responsive">
          <table className="table table-hover align-middle">
            <thead className="table-light">
              <tr>
                <th>Credit Note</th>
                <th>Date</th>
                <th>Original Invoice</th>
                <th>Customer</th>
                <th>Reason</th>
                <th className="text-end">Amount</th>
                <th className="text-end">Refund</th>
                <th className="text-end">Adjustment</th>
                <th>Status</th>
                <th className="text-end no-print">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="10" className="text-center py-5">
                    <span className="spinner-border spinner-border-sm me-2" />
                    Loading...
                  </td>
                </tr>
              )}

              {!loading && creditNotes.length === 0 && (
                <tr>
                  <td colSpan="10" className="text-center py-5 text-muted">
                    No credit notes found.
                  </td>
                </tr>
              )}

              {!loading &&
                creditNotes.map((note) => {
                  const total =
                    note?.totals?.grandTotal ??
                    note?.grandTotal ??
                    note?.totalAmount ??
                    0;

                  return (
                    <tr key={note._id}>
                      <td className="fw-semibold">
                        {note.creditNoteNumber || note.number || "-"}
                      </td>
                      <td>
                        {note.creditNoteDate
                          ? new Date(note.creditNoteDate).toLocaleDateString(
                              "en-IN"
                            )
                          : "-"}
                      </td>
                      <td>
                        {note.originalOrder?.orderNumber ||
                          note.originalOrderNumber ||
                          "-"}
                      </td>
                      <td>{note.companyName || note.clientName || "-"}</td>
                      <td>{note.reason || "-"}</td>
                      <td className="text-end">₹ {money(total)}</td>
                      <td className="text-end">
                        ₹{" "}
                        {money(
                          note?.refund?.amount ??
                            note?.refundAmount ??
                            0
                        )}
                      </td>
                      <td className="text-end">
                        ₹{" "}
                        {money(
                          note?.adjustment?.amount ??
                            note?.adjustmentAmount ??
                            0
                        )}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            note.status === "Cancelled"
                              ? "text-bg-danger"
                              : note.status === "Draft"
                              ? "text-bg-warning"
                              : "text-bg-success"
                          }`}
                        >
                          {note.status || "Posted"}
                        </span>
                      </td>
                      <td className="text-end no-print">
                        <div className="btn-group btn-group-sm">
                          <button
                            className="btn btn-outline-primary"
                            onClick={() => onView(note._id)}
                          >
                            View
                          </button>
                          {(!note.status || note.status === "Draft") && (
                            <button
                              className="btn btn-outline-danger"
                              onClick={() => onDelete(note._id)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CreditNotePrint({ note, onBack, onPrint }) {
  const items = note.items || [];
  const totals = note.totals || {};

  return (
    <div>
      <div className="d-flex justify-content-end gap-2 mb-3 no-print">
        <button className="btn btn-outline-secondary" onClick={onBack}>
          Back
        </button>
        <button className="btn btn-primary" onClick={onPrint}>
          Print Credit Note
        </button>
      </div>

      <div className="card border-0">
        <div className="card-body">
          <div className="d-flex justify-content-between border-bottom pb-3 mb-3">
            <div>
              <h2 className="fw-bold mb-1">CREDIT NOTE</h2>
              <div className="small text-muted">
                Original Invoice:{" "}
                {note.originalOrder?.orderNumber ||
                  note.originalOrderNumber ||
                  "-"}
              </div>
            </div>
            <div className="text-end">
              <div className="fw-bold">
                {note.creditNoteNumber || note.number}
              </div>
              <div>
                Date:{" "}
                {note.creditNoteDate
                  ? new Date(note.creditNoteDate).toLocaleDateString("en-IN")
                  : "-"}
              </div>
              <div className="small">
                Reason: {note.reason || "-"}
              </div>
            </div>
          </div>

          <div className="row mb-4">
            <div className="col-md-6">
              <div className="text-muted small">Customer</div>
              <div className="fw-bold">
                {note.companyName ||
                  note.clientName ||
                  note.originalOrder?.companyName ||
                  "-"}
              </div>
              <div>{note.Address || note.originalOrder?.Address || ""}</div>
              <div>
                {[
                  note.City || note.originalOrder?.City,
                  note.State || note.originalOrder?.State,
                  note.pinCode || note.originalOrder?.pinCode,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </div>
              <div>GSTIN: {note.gstNumber || note.originalOrder?.gstNumber || "-"}</div>
            </div>
            <div className="col-md-6 text-md-end">
              <div>Invoice Date: {note.originalOrder?.orderDate ? new Date(note.originalOrder.orderDate).toLocaleDateString("en-IN") : "-"}</div>
              <div>Stock Reversal: {note.stockAffecting ? "Yes" : "No"}</div>
            </div>
          </div>

          <div className="table-responsive">
            <table className="table table-bordered align-middle">
              <thead className="table-light">
                <tr>
                  <th>#</th>
                  <th>Description</th>
                  <th>HSN</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th>Discount</th>
                  <th>Taxable</th>
                  <th>Tax</th>
                  <th className="text-end">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item._id || index}>
                    <td>{index + 1}</td>
                    <td>
                      <div className="fw-semibold">{item.orderName || "-"}</div>
                      <div className="small text-muted">
                        {item.designNumber || ""}
                      </div>
                    </td>
                    <td>{item.hsnCode || "-"}</td>
                    <td>
                      {item.qtyUnit === "MTR"
                        ? `${money(item.MTR)} MTR`
                        : `${money(item.quantity)} PCS`}
                    </td>
                    <td>₹ {money(item.unitPrice)}</td>
                    <td>{money(item.discountRate)}%</td>
                    <td>₹ {money(item.taxableAmount)}</td>
                    <td>₹ {money(item.taxAmount)}</td>
                    <td className="text-end">₹ {money(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="row justify-content-end mt-3">
            <div className="col-md-5 col-lg-4">
              <div className="d-flex justify-content-between">
                <span>Subtotal</span>
                <span>₹ {money(totals.subtotal)}</span>
              </div>
              <div className="d-flex justify-content-between">
                <span>Discount</span>
                <span>₹ {money(totals.discountAmount)}</span>
              </div>
              <div className="d-flex justify-content-between">
                <span>Taxable</span>
                <span>₹ {money(totals.taxableAmount)}</span>
              </div>
              <div className="d-flex justify-content-between">
                <span>Tax</span>
                <span>₹ {money(totals.taxAmount)}</span>
              </div>
              <div className="d-flex justify-content-between">
                <span>Round Off</span>
                <span>₹ {money(totals.roundOff)}</span>
              </div>
              <hr />
              <div className="d-flex justify-content-between fs-5 fw-bold">
                <span>Total</span>
                <span>₹ {money(totals.grandTotal)}</span>
              </div>
            </div>
          </div>

          {note.note && (
            <div className="mt-4">
              <div className="small text-muted">Note</div>
              <div>{note.note}</div>
            </div>
          )}

          <div className="mt-5 pt-4 border-top text-center small text-muted">
            This credit note is linked to the original invoice shown above.
          </div>
        </div>
      </div>
    </div>
  );
}
