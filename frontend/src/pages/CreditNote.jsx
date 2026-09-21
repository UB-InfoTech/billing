import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import "bootstrap/dist/css/bootstrap.min.css";

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

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
const PAGE_SIZE = 10;

const today = () => new Date().toISOString().slice(0, 10);
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const n = (value) => {
    const valueAsNumber = Number(value);
    return Number.isFinite(valueAsNumber) ? valueAsNumber : 0;
};
const r2 = (value) => Math.round((n(value) + Number.EPSILON) * 100) / 100;

function getErrorMessage(error) {
    return (
        error?.response?.data?.message ||
        error?.response?.data?.msg ||
        error?.message ||
        "Something went wrong."
    );
}

function getAuthConfig() {
    const token = localStorage.getItem("token");
    return token
        ? { headers: { "x-auth-token": token } }
        : {};
}

function emptyForm() {
    return {
        creditNoteNumber: "",
        creditNoteDate: today(),
        reason: "Sales Return",
        originalOrderId: "",
        adjustmentAmount: 0,
        refundAmount: 0,
        refundMethod: "Cash",
        note: "",
    };
}

function getOrderBillableQty(item) {
    const unit = item?.qtyUnit || "PCS";
    if (unit === "MTR") return Math.max(0, r2(n(item?.MTR) - n(item?.shortPcs)));
    return Math.max(0, r2(n(item?.quantity) - n(item?.shortPcs)));
}

function getCreditQty(item) {
    return item?.qtyUnit === "MTR" ? n(item.creditMTR) : n(item.creditQuantity);
}

function calculateCreditLine(item) {
    const creditQty = getCreditQty(item);
    const gross = r2(creditQty * n(item.unitPrice));
    const discount = r2((gross * n(item.discountRate)) / 100);
    const taxable = r2(gross - discount);
    const tax = r2((taxable * n(item.taxRate)) / 100);
    const total = r2(taxable + tax);
    return { ...item, gross, discount, taxable, tax, total };
}

function formatDate(date) {
    if (!date) return "-";
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString("en-IN");
}

export default function CreditNote() {
    const [view, setView] = useState("list");
    const [orders, setOrders] = useState([]);
    const [creditNotes, setCreditNotes] = useState([]);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [items, setItems] = useState([]);
    const [form, setForm] = useState(emptyForm());
    const [previewNote, setPreviewNote] = useState(null);

    const [loading, setLoading] = useState(false);
    const [orderLoading, setOrderLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [cancellingId, setCancellingId] = useState(null);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const [invoiceSearch, setInvoiceSearch] = useState("");
    const [searchResultsOpen, setSearchResultsOpen] = useState(false);
    const searchTimer = useRef(null);
    const searchAbort = useRef(null);

    const [filters, setFilters] = useState({
        search: "",
        reason: "",
        status: "",
        from: "",
        to: "",
        page: 1,
    });
    const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });

    const totals = useMemo(() => {
        const subtotal = r2(items.reduce((sum, item) => sum + n(item.gross), 0));
        const discount = r2(items.reduce((sum, item) => sum + n(item.discount), 0));
        const taxable = r2(items.reduce((sum, item) => sum + n(item.taxable), 0));
        const tax = r2(items.reduce((sum, item) => sum + n(item.tax), 0));
        const beforeRound = r2(taxable + tax);
        const grandTotal = Math.round(beforeRound);
        const roundOff = r2(grandTotal - beforeRound);

        return { subtotal, discount, taxable, tax, beforeRound, grandTotal, roundOff };
    }, [items]);

    const invoiceRemainingCredit = useMemo(() => {
        if (!selectedOrder) return 0;
        const invoiceTotal = n(selectedOrder.roundOffFinalRevenue ?? selectedOrder.finalRevenue ?? 0);
        const alreadyCredited = n(selectedOrder.alreadyCreditedAmount);
        return Math.max(0, r2(invoiceTotal - alreadyCredited));
    }, [selectedOrder]);

    const invoiceDueAvailableForAdjustment = useMemo(() => {
        if (!selectedOrder) return 0;
        return Math.max(0, r2(n(selectedOrder.dueAmount)));
    }, [selectedOrder]);

    const loadCreditNotes = useCallback(async (nextFilters = filters) => {
        try {
            setLoading(true);
            setError("");
            const params = {
                search: nextFilters.search || undefined,
                reason: nextFilters.reason || undefined,
                status: nextFilters.status || undefined,
                from: nextFilters.from || undefined,
                to: nextFilters.to || undefined,
                page: nextFilters.page || 1,
                limit: PAGE_SIZE,
            };
            const response = await axios.get(`${API_BASE}/api/credit-notes`, {
                ...getAuthConfig(),
                params,
            });
            setCreditNotes(response.data?.creditNotes || []);
            setPagination(response.data?.pagination || { page: 1, pages: 1, total: 0 });
        } catch (error) {
            if (error?.response?.status === 401) {
                localStorage.removeItem("token");
            }
            setError(getErrorMessage(error));
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        loadCreditNotes(filters);
    }, [loadCreditNotes, filters]);

    useEffect(() => {
        const orderId = new URLSearchParams(window.location.search).get("orderId");
        if (!orderId) return;
        setView("create");
        loadOrder(orderId);
        // Keep the Credit Note page usable on refresh without repeatedly reloading the invoice.
        window.history.replaceState({}, document.title, window.location.pathname);
    }, []);

    useEffect(() => {
        return () => {
            if (searchTimer.current) clearTimeout(searchTimer.current);
            if (searchAbort.current) searchAbort.current.abort();
        };
    }, []);

    const searchInvoices = (value) => {
        setInvoiceSearch(value);
        setSearchResultsOpen(true);
        if (searchTimer.current) clearTimeout(searchTimer.current);
        if (searchAbort.current) searchAbort.current.abort();

        if (!value.trim()) {
            setOrders([]);
            return;
        }

        searchTimer.current = setTimeout(async () => {
            const controller = new AbortController();
            searchAbort.current = controller;
            try {
                setOrderLoading(true);
                const response = await axios.get(`${API_BASE}/api/credit-notes/invoices`, {
                    ...getAuthConfig(),
                    params: { search: value.trim(), limit: 15 },
                    signal: controller.signal,
                });
                setOrders(response.data?.orders || []);
            } catch (error) {
                if (error?.code !== "ERR_CANCELED") setError(getErrorMessage(error));
            } finally {
                setOrderLoading(false);
            }
        }, 300);
    };

    const loadOrder = async (orderId) => {
        try {
            setLoading(true);
            setError("");
            const response = await axios.get(`${API_BASE}/api/credit-notes/invoices/${orderId}`, getAuthConfig());
            const payload = response.data?.order;
            if (!payload) throw new Error("Invoice not found.");

            setSelectedOrder(payload);
            setInvoiceSearch(payload.orderNumber || "");
            setSearchResultsOpen(false);
            setOrders([]);
            setItems((payload.creditableItems || []).map((item) => calculateCreditLine({
                _id: item._id,
                designNumber: item.designNumber || "",
                orderName: item.orderName || "",
                hsnCode: item.hsnCode ?? "",
                qtyUnit: item.qtyUnit || "PCS",
                originalQuantity: n(item.quantity),
                originalMTR: n(item.MTR),
                originalShortPcs: n(item.shortPcs),
                previouslyCreditedQuantity: n(item.previouslyCreditedQuantity),
                previouslyCreditedMTR: n(item.previouslyCreditedMTR),
                availableCreditQty: n(item.availableCreditQty),
                unitPrice: n(item.unitPrice),
                discountRate: n(payload.discountRate),
                taxRate: n(payload.taxPercentage),
                creditQuantity: 0,
                creditMTR: 0,
            })));

            const due = Math.max(0, n(payload.dueAmount) - n(payload.alreadyAppliedCreditAmount));
            setForm((current) => ({
                ...current,
                originalOrderId: payload._id,
                adjustmentAmount: due > 0 ? 0 : 0,
                refundAmount: 0,
            }));
        } catch (error) {
            setError(getErrorMessage(error));
        } finally {
            setLoading(false);
        }
    };

    const startNew = () => {
        setView("create");
        setSelectedOrder(null);
        setItems([]);
        setInvoiceSearch("");
        setOrders([]);
        setSearchResultsOpen(false);
        setForm(emptyForm());
        setPreviewNote(null);
        setError("");
        setSuccess("");
    };

    const updateItem = (index, field, value) => {
        setItems((current) => current.map((item, itemIndex) => {
            if (itemIndex !== index) return item;
            const next = { ...item };
            const numeric = n(value);
            const max = n(item.availableCreditQty);
            if (field === "creditQuantity" || field === "creditMTR") {
                next[field] = Math.max(0, Math.min(max, numeric));
            } else {
                next[field] = value;
            }
            return calculateCreditLine(next);
        }));
    };

    const clearAllItemCredits = () => {
        setItems((current) => current.map((item) => calculateCreditLine({
            ...item,
            creditQuantity: 0,
            creditMTR: 0,
        })));
        setForm((current) => ({ ...current, adjustmentAmount: 0, refundAmount: 0 }));
    };

    const applyAllAvailable = () => {
        setItems((current) => current.map((item) => calculateCreditLine({
            ...item,
            creditQuantity: item.qtyUnit === "MTR" ? 0 : n(item.availableCreditQty),
            creditMTR: item.qtyUnit === "MTR" ? n(item.availableCreditQty) : 0,
        })));
    };

    useEffect(() => {
        if (!selectedOrder) return;
        const total = totals.grandTotal;
        const dueAvailable = invoiceDueAvailableForAdjustment;
        if (total <= 0) {
            setForm((current) => ({ ...current, adjustmentAmount: 0, refundAmount: 0 }));
            return;
        }
        const adjustment = Math.min(total, dueAvailable);
        const refund = r2(total - adjustment);
        setForm((current) => ({
            ...current,
            adjustmentAmount: adjustment,
            refundAmount: refund,
        }));
    }, [totals.grandTotal, selectedOrder, invoiceDueAvailableForAdjustment]);

    const validateClient = () => {
        if (!form.creditNoteDate) return "Credit Note date is required.";
        if (!form.reason) return "Reason is required.";
        if (!selectedOrder?._id) return "Please select an original invoice.";

        const activeItems = items.filter((item) => getCreditQty(item) > 0);
        if (!activeItems.length) return "Enter credit quantity for at least one item.";

        for (const item of activeItems) {
            if (getCreditQty(item) > n(item.availableCreditQty) + 0.000001) {
                return `${item.orderName || "Item"}: credit quantity exceeds the remaining quantity.`;
            }
        }

        if (totals.grandTotal <= 0) return "Credit Note total must be greater than zero.";
        if (totals.grandTotal > invoiceRemainingCredit + 0.000001) {
            return "Credit Note total exceeds the remaining creditable value of the invoice.";
        }
        if (r2(n(form.adjustmentAmount) + n(form.refundAmount)) !== r2(totals.grandTotal)) {
            return "Adjustment and refund must exactly equal the Credit Note total.";
        }
        if (n(form.adjustmentAmount) > invoiceDueAvailableForAdjustment + 0.000001) {
            return "Adjustment cannot exceed the invoice's remaining due amount.";
        }
        if (n(form.refundAmount) > 0 && !form.refundMethod) return "Select a refund method.";
        return "";
    };

    const save = async () => {
        const message = validateClient();
        if (message) {
            setError(message);
            return;
        }

        try {
            setSaving(true);
            setError("");
            const response = await axios.post(
                `${API_BASE}/api/credit-notes`,
                {
                    creditNoteDate: form.creditNoteDate,
                    reason: form.reason,
                    originalOrderId: form.originalOrderId,
                    adjustmentAmount: r2(form.adjustmentAmount),
                    refundAmount: r2(form.refundAmount),
                    refundMethod: form.refundAmount > 0 ? form.refundMethod : null,
                    note: form.note.trim(),
                    items: items
                        .filter((item) => getCreditQty(item) > 0)
                        .map((item) => ({
                            sourceSubOrderId: item._id,
                            creditQuantity: item.qtyUnit === "MTR" ? 0 : r2(item.creditQuantity),
                            creditMTR: item.qtyUnit === "MTR" ? r2(item.creditMTR) : 0,
                        })),
                },
                getAuthConfig()
            );

            const note = response.data?.creditNote;
            setPreviewNote(note);
            setSuccess(`Credit Note ${note?.creditNoteNumber || ""} created successfully.`);
            setView("preview");
            await loadCreditNotes({ ...filters, page: 1 });
        } catch (error) {
            setError(getErrorMessage(error));
        } finally {
            setSaving(false);
        }
    };

    const openNote = async (id) => {
        try {
            setLoading(true);
            setError("");
            const response = await axios.get(`${API_BASE}/api/credit-notes/${id}`, getAuthConfig());
            setPreviewNote(response.data?.creditNote);
            setView("preview");
        } catch (error) {
            setError(getErrorMessage(error));
        } finally {
            setLoading(false);
        }
    };

    const cancelNote = async (id) => {
        if (!window.confirm("Cancel this posted Credit Note? This will reverse its invoice adjustment. Refund records remain auditable.")) return;
        try {
            setCancellingId(id);
            setError("");
            const response = await axios.patch(`${API_BASE}/api/credit-notes/${id}/cancel`, {}, getAuthConfig());
            setSuccess(response.data?.message || "Credit Note cancelled.");
            await loadCreditNotes(filters);
            if (previewNote?._id === id) {
                setPreviewNote(response.data?.creditNote || previewNote);
            }
        } catch (error) {
            setError(getErrorMessage(error));
        } finally {
            setCancellingId(null);
        }
    };

    const print = () => window.print();

    return (
        <div className="container-fluid py-3">
            <style>{`
                .credit-note-page .form-control:focus, .credit-note-page .form-select:focus { box-shadow: 0 0 0 .2rem rgba(13,110,253,.12); }
                .credit-note-page .table th { white-space: nowrap; }
                .invoice-search-menu { max-height: 320px; overflow-y: auto; z-index: 1080; }
                @media print {
                    body { background: #fff !important; }
                    .no-print { display: none !important; }
                    .credit-note-print { display: block !important; }
                    .credit-note-list, .credit-note-create { display: none !important; }
                    .container-fluid { padding: 0 !important; }
                }
            `}</style>

            <div className="credit-note-page">
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3 no-print">
                    <div>
                        <h3 className="mb-1 fw-bold">Credit Note Management</h3>
                        <div className="text-muted small">Create, track, print and cancel invoice-linked Credit Notes.</div>
                    </div>
                    <div className="btn-group">
                        <button className={`btn ${view === "list" ? "btn-primary" : "btn-outline-primary"}`} onClick={() => setView("list")}>Credit Notes</button>
                        <button className={`btn ${view === "create" ? "btn-primary" : "btn-outline-primary"}`} onClick={startNew}>+ Create Credit Note</button>
                    </div>
                </div>

                {error && <div className="alert alert-danger alert-dismissible no-print"><strong>Error:</strong> {error}<button type="button" className="btn-close" onClick={() => setError("")} /></div>}
                {success && <div className="alert alert-success no-print">{success}</div>}

                {view === "list" && (
                    <div className="card border-0 shadow-sm credit-note-list">
                        <div className="card-body">
                            <div className="row g-2 mb-3 no-print">
                                <div className="col-xl-3 col-lg-4">
                                    <input className="form-control" value={filters.search} placeholder="Search CN / invoice / client / GSTIN" onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))} />
                                </div>
                                <div className="col-xl-2 col-lg-3">
                                    <select className="form-select" value={filters.reason} onChange={(e) => setFilters((f) => ({ ...f, reason: e.target.value, page: 1 }))}>
                                        <option value="">All Reasons</option>
                                        {REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                                    </select>
                                </div>
                                <div className="col-xl-1 col-lg-2"><select className="form-select" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}><option value="">Status</option><option>Posted</option><option>Cancelled</option></select></div>
                                <div className="col-xl-2 col-lg-3"><input type="date" className="form-control" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value, page: 1 }))} /></div>
                                <div className="col-xl-2 col-lg-3"><input type="date" className="form-control" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value, page: 1 }))} /></div>
                                <div className="col-xl-2 col-lg-2"><button className="btn btn-outline-secondary w-100" onClick={() => setFilters({ search: "", reason: "", status: "", from: "", to: "", page: 1 })}>Reset Filters</button></div>
                            </div>

                            <div className="table-responsive">
                                <table className="table table-bordered table-hover align-middle mb-0">
                                    <thead className="table-light"><tr><th>CN No.</th><th>Date</th><th>Invoice</th><th>Client</th><th>Reason</th><th>Status</th><th className="text-end">Total</th><th className="text-end">Adjustment</th><th className="text-end">Refund</th><th className="text-end no-print">Actions</th></tr></thead>
                                    <tbody>
                                        {loading ? <tr><td colSpan="10" className="text-center py-5"><span className="spinner-border spinner-border-sm me-2" />Loading...</td></tr> : creditNotes.length === 0 ? <tr><td colSpan="10" className="text-center py-5 text-muted">No Credit Notes found.</td></tr> : creditNotes.map((note) => <tr key={note._id}>
                                            <td className="fw-semibold">{note.creditNoteNumber}</td>
                                            <td>{formatDate(note.creditNoteDate)}</td>
                                            <td>{note.originalOrderNumber || "-"}</td>
                                            <td>{note.companyName || "-"}</td>
                                            <td>{note.reason}</td>
                                            <td><span className={`badge ${note.status === "Cancelled" ? "text-bg-danger" : "text-bg-success"}`}>{note.status}</span></td>
                                            <td className="text-end">{money(note?.totals?.grandTotal)}</td>
                                            <td className="text-end">{money(note?.adjustmentAmount)}</td>
                                            <td className="text-end">{money(note?.refundAmount)}</td>
                                            <td className="text-end no-print"><div className="btn-group btn-group-sm"><button className="btn btn-outline-primary" onClick={() => openNote(note._id)}>View</button>{note.status === "Posted" && <button className="btn btn-outline-danger" disabled={cancellingId === note._id} onClick={() => cancelNote(note._id)}>{cancellingId === note._id ? "..." : "Cancel"}</button>}</div></td>
                                        </tr>)}
                                    </tbody>
                                </table>
                            </div>

                            <div className="d-flex justify-content-between align-items-center mt-3 no-print">
                                <small className="text-muted">Total records: {pagination.total || 0}</small>
                                <div className="btn-group btn-group-sm">
                                    <button className="btn btn-outline-secondary" disabled={(pagination.page || 1) <= 1} onClick={() => setFilters((f) => ({ ...f, page: Math.max(1, f.page - 1) }))}>Previous</button>
                                    <button className="btn btn-outline-secondary" disabled>{pagination.page || 1} / {pagination.pages || 1}</button>
                                    <button className="btn btn-outline-secondary" disabled={(pagination.page || 1) >= (pagination.pages || 1)} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Next</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {view === "create" && (
                    <div className="card border-0 shadow-sm credit-note-create">
                        <div className="card-body">
                            <div className="d-flex justify-content-between align-items-center mb-3"><h5 className="fw-bold mb-0">Create Credit Note</h5><span className="badge text-bg-light border">Number generated by server</span></div>

                            <div className="row g-3 mb-3">
                                <div className="col-md-3"><label className="form-label fw-semibold">Credit Note Date</label><input type="date" className="form-control" value={form.creditNoteDate} onChange={(e) => setForm((f) => ({ ...f, creditNoteDate: e.target.value }))} /></div>
                                <div className="col-md-3"><label className="form-label fw-semibold">Reason</label><select className="form-select" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}>{REASONS.map((reason) => <option key={reason}>{reason}</option>)}</select></div>
                                <div className="col-md-6 position-relative"><label className="form-label fw-semibold">Original Invoice / Bill</label><input className="form-control" value={invoiceSearch} placeholder="Search Invoice No., Client or GSTIN" onFocus={() => setSearchResultsOpen(Boolean(invoiceSearch))} onChange={(e) => searchInvoices(e.target.value)} />
                                    {searchResultsOpen && invoiceSearch.trim() && <div className="position-absolute bg-white border rounded shadow-sm w-100 invoice-search-menu">
                                        {orderLoading ? <div className="p-3 text-muted">Searching invoices...</div> : orders.length === 0 ? <div className="p-3 text-muted">No matching invoices.</div> : orders.map((order) => <button type="button" key={order._id} className="dropdown-item p-3 border-bottom text-start" onClick={() => loadOrder(order._id)}><div className="fw-semibold">{order.orderNumber}</div><div className="small">{order.companyName || "-"} {order.gstNumber ? `• ${order.gstNumber}` : ""}</div><div className="small text-muted">{formatDate(order.orderDate)} • {money(order.roundOffFinalRevenue)}</div></button>)}
                                    </div>}
                                </div>
                            </div>

                            {selectedOrder && <>
                                <div className="card border mb-3"><div className="card-body"><div className="row g-3">
                                    <div className="col-lg-3"><div className="small text-muted">Invoice Number</div><div className="fw-semibold">{selectedOrder.orderNumber}</div></div>
                                    <div className="col-lg-3"><div className="small text-muted">Invoice Date</div><div>{formatDate(selectedOrder.orderDate)}</div></div>
                                    <div className="col-lg-3"><div className="small text-muted">Client</div><div className="fw-semibold">{selectedOrder.companyName || "-"}</div></div>
                                    <div className="col-lg-3"><div className="small text-muted">GSTIN</div><div>{selectedOrder.gstNumber || "-"}</div></div>
                                    <div className="col-lg-3"><div className="small text-muted">Invoice Total</div><div className="fw-semibold">{money(selectedOrder.roundOffFinalRevenue)}</div></div>
                                    <div className="col-lg-3"><div className="small text-muted">Original Paid</div><div>{money(selectedOrder.paidAmount)}</div></div>
                                    <div className="col-lg-3"><div className="small text-muted">Current Due</div><div className="text-danger fw-semibold">{money(selectedOrder.dueAmount)}</div></div>
                                    <div className="col-lg-3"><div className="small text-muted">Remaining Creditable</div><div className="text-success fw-semibold">{money(invoiceRemainingCredit)}</div></div>
                                </div></div></div>

                                <div className="table-responsive border rounded mb-3"><table className="table table-sm table-bordered align-middle mb-0"><thead className="table-light"><tr><th>Design</th><th>Item</th><th>HSN</th><th>Unit</th><th>Invoice Qty</th><th>Previous Credit</th><th>Available</th><th style={{ minWidth: 125 }}>Credit Qty</th><th>Rate</th><th>Disc %</th><th>Tax %</th><th className="text-end">Taxable</th><th className="text-end">Tax</th><th className="text-end">Total</th></tr></thead>
                                    <tbody>{items.map((item, index) => <tr key={item._id}>
                                        <td>{item.designNumber || "-"}</td><td>{item.orderName || "-"}</td><td>{item.hsnCode || "-"}</td><td>{item.qtyUnit || "PCS"}</td>
                                        <td>{n(item.availableCreditQty) + n(item.previouslyCreditedQuantity || item.previouslyCreditedMTR) /* source availability is authoritative */}</td>
                                        <td>{item.qtyUnit === "MTR" ? n(item.previouslyCreditedMTR).toFixed(2) : n(item.previouslyCreditedQuantity).toFixed(2)}</td>
                                        <td className="fw-semibold text-success">{n(item.availableCreditQty).toFixed(2)}</td>
                                        <td><input type="number" min="0" max={n(item.availableCreditQty)} step="0.01" className="form-control form-control-sm" value={item.qtyUnit === "MTR" ? item.creditMTR : item.creditQuantity} onChange={(e) => updateItem(index, item.qtyUnit === "MTR" ? "creditMTR" : "creditQuantity", e.target.value)} /></td>
                                        <td>{money(item.unitPrice)}</td><td>{n(item.discountRate).toFixed(2)}</td><td>{n(item.taxRate).toFixed(2)}</td>
                                        <td className="text-end">{money(item.taxable)}</td><td className="text-end">{money(item.tax)}</td><td className="text-end fw-semibold">{money(item.total)}</td>
                                    </tr>)}{items.length === 0 && <tr><td colSpan="14" className="text-center py-5 text-muted">No creditable items found.</td></tr>}</tbody>
                                </table></div>

                                <div className="d-flex flex-wrap gap-2 mb-3 no-print"><button className="btn btn-outline-primary btn-sm" onClick={applyAllAvailable}>Credit All Available</button><button className="btn btn-outline-secondary btn-sm" onClick={clearAllItemCredits}>Clear Quantities</button></div>

                                <div className="row g-3">
                                    <div className="col-lg-7"><div className="card border h-100"><div className="card-body"><h6 className="fw-bold">Settlement</h6><div className="row g-3">
                                        <div className="col-md-6"><label className="form-label">Adjust Against Invoice Due</label><input type="number" className="form-control" min="0" max={invoiceDueAvailableForAdjustment} step="0.01" value={form.adjustmentAmount} onChange={(e) => setForm((f) => ({ ...f, adjustmentAmount: r2(e.target.value) }))} /><div className="small text-muted mt-1">Maximum: {money(invoiceDueAvailableForAdjustment)}</div></div>
                                        <div className="col-md-6"><label className="form-label">Refund Amount</label><input type="number" className="form-control" min="0" max={totals.grandTotal} step="0.01" value={form.refundAmount} onChange={(e) => setForm((f) => ({ ...f, refundAmount: r2(e.target.value) }))} /></div>
                                        <div className="col-md-5"><label className="form-label">Refund Method</label><select className="form-select" value={form.refundMethod} onChange={(e) => setForm((f) => ({ ...f, refundMethod: e.target.value }))}>{REFUND_METHODS.map((method) => <option key={method}>{method}</option>)}</select></div>
                                        <div className="col-md-7"><label className="form-label">Note</label><textarea className="form-control" rows="2" maxLength="1000" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} /></div>
                                    </div></div></div></div>
                                    <div className="col-lg-5"><div className="card border h-100"><div className="card-body"><div className="d-flex justify-content-between"><span>Subtotal</span><span>{money(totals.subtotal)}</span></div><div className="d-flex justify-content-between"><span>Discount</span><span>{money(totals.discount)}</span></div><div className="d-flex justify-content-between"><span>Taxable</span><span>{money(totals.taxable)}</span></div><div className="d-flex justify-content-between"><span>Tax</span><span>{money(totals.tax)}</span></div><div className="d-flex justify-content-between"><span>Round Off</span><span>{money(totals.roundOff)}</span></div><hr/><div className="d-flex justify-content-between fs-5 fw-bold"><span>Credit Note Total</span><span>{money(totals.grandTotal)}</span></div><div className="d-flex justify-content-between mt-2"><span>Invoice Adjustment</span><span>{money(form.adjustmentAmount)}</span></div><div className="d-flex justify-content-between"><span>Refund</span><span>{money(form.refundAmount)}</span></div><div className={`small mt-2 ${r2(n(form.adjustmentAmount) + n(form.refundAmount)) === r2(totals.grandTotal) ? "text-success" : "text-danger"}`}>Allocated: {money(r2(n(form.adjustmentAmount) + n(form.refundAmount)))} / {money(totals.grandTotal)}</div></div></div></div>
                                </div>
                            </>}

                            <div className="d-flex justify-content-end gap-2 mt-3 no-print"><button className="btn btn-outline-secondary" onClick={() => setView("list")}>Cancel</button><button className="btn btn-primary" disabled={saving || !selectedOrder} onClick={save}>{saving ? <><span className="spinner-border spinner-border-sm me-2" />Saving...</> : "Post Credit Note"}</button></div>
                        </div>
                    </div>
                )}

                {view === "preview" && previewNote && <div className="credit-note-print">
                    <div className="d-flex justify-content-end gap-2 mb-3 no-print"><button className="btn btn-outline-secondary" onClick={() => setView("list")}>Back</button><button className="btn btn-primary" onClick={print}>Print</button></div>
                    <CreditNotePrint note={previewNote} />
                </div>}
            </div>
        </div>
    );
}

function CreditNotePrint({ note }) {
    const original = note.originalOrder || {};
    const items = note.items || [];
    return <div className="container py-3">
        <div className="border p-4">
            <div className="row align-items-start border-bottom pb-3 mb-3"><div className="col-7"><h2 className="fw-bold mb-1">CREDIT NOTE</h2><div>Credit Note No.: <strong>{note.creditNoteNumber}</strong></div><div>Date: {formatDate(note.creditNoteDate)}</div></div><div className="col-5 text-end"><div>Original Invoice: <strong>{note.originalOrderNumber || original.orderNumber || "-"}</strong></div><div>Invoice Date: {formatDate(note.originalOrderDate || original.orderDate)}</div><div>Reason: {note.reason}</div></div></div>
            <div className="row mb-4"><div className="col-6"><div className="small text-muted">Customer</div><div className="fw-bold">{note.companyName || original.companyName || "-"}</div><div>{note.Address || original.Address || ""}</div><div>{[note.City || original.City, note.State || original.State, note.pinCode || original.pinCode].filter(Boolean).join(", ")}</div><div>GSTIN: {note.gstNumber || original.gstNumber || "-"}</div></div><div className="col-6 text-end"><div>Payment Terms: {original.paymentTerms || "-"}</div><div>Original Invoice Total: {money(original.roundOffFinalRevenue)}</div></div></div>
            <div className="table-responsive"><table className="table table-bordered"><thead className="table-light"><tr><th>#</th><th>Design</th><th>Description</th><th>HSN</th><th>Qty</th><th>Rate</th><th>Disc.</th><th>Taxable</th><th>Tax</th><th className="text-end">Amount</th></tr></thead><tbody>{items.map((item, index) => <tr key={item._id || index}><td>{index + 1}</td><td>{item.designNumber || "-"}</td><td>{item.orderName || "-"}</td><td>{item.hsnCode || "-"}</td><td>{item.qtyUnit === "MTR" ? `${n(item.creditMTR).toFixed(2)} MTR` : `${n(item.creditQuantity).toFixed(2)} ${item.qtyUnit || "PCS"}`}</td><td>{money(item.unitPrice)}</td><td>{n(item.discountRate).toFixed(2)}%</td><td>{money(item.taxableAmount)}</td><td>{money(item.taxAmount)}</td><td className="text-end">{money(item.lineTotal)}</td></tr>)}</tbody></table></div>
            <div className="row justify-content-end"><div className="col-5"><div className="d-flex justify-content-between"><span>Subtotal</span><span>{money(note.totals?.subtotal)}</span></div><div className="d-flex justify-content-between"><span>Discount</span><span>{money(note.totals?.discountAmount)}</span></div><div className="d-flex justify-content-between"><span>Taxable</span><span>{money(note.totals?.taxableAmount)}</span></div><div className="d-flex justify-content-between"><span>Tax</span><span>{money(note.totals?.taxAmount)}</span></div><div className="d-flex justify-content-between"><span>Round Off</span><span>{money(note.totals?.roundOff)}</span></div><hr/><div className="d-flex justify-content-between fs-5 fw-bold"><span>Total</span><span>{money(note.totals?.grandTotal)}</span></div><div className="d-flex justify-content-between mt-2"><span>Adjusted</span><span>{money(note.adjustmentAmount)}</span></div><div className="d-flex justify-content-between"><span>Refund</span><span>{money(note.refundAmount)}</span></div></div></div>
            {note.note && <div className="mt-4"><strong>Note:</strong> {note.note}</div>}
            <div className="mt-5 pt-3 border-top text-center small text-muted">This Credit Note is linked to the original invoice shown above.</div>
        </div>
    </div>;
}
