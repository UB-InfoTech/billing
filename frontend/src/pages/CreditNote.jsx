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
        creditMode: "ITEM",
        adjustmentType: "Outstanding",
        adjustmentAmount: 0,
        refundAmount: 0,
        refundMethod: "Cash",
        customerCreditAmount: 0,
        autoSettlement: true,
        stockAffecting: false,
        manualTaxableAmount: 0,
        manualTaxRate: 5,
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
    const value = String(date);
    if (/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) {
        const [year, month, day] = value.split("-").map(Number);
        return new Date(year, month - 1, day).toLocaleDateString("en-IN");
    }
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
    const [editingNote, setEditingNote] = useState(null);
    const [profile, setProfile] = useState(null);

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
        if (form.creditMode === "AMOUNT") {
            const taxable = r2(n(form.manualTaxableAmount));
            const tax = r2((taxable * n(form.manualTaxRate)) / 100);
            const beforeRound = r2(taxable + tax);
            const grandTotal = Math.round(beforeRound);
            const roundOff = r2(grandTotal - beforeRound);
            return { subtotal: taxable, discount: 0, taxable, tax, beforeRound, grandTotal, roundOff };
        }
        const subtotal = r2(items.reduce((sum, item) => sum + n(item.gross), 0));
        const discount = r2(items.reduce((sum, item) => sum + n(item.discount), 0));
        const taxable = r2(items.reduce((sum, item) => sum + n(item.taxable), 0));
        const tax = r2(items.reduce((sum, item) => sum + n(item.tax), 0));
        const beforeRound = r2(taxable + tax);
        const grandTotal = Math.round(beforeRound);
        const roundOff = r2(grandTotal - beforeRound);
        return { subtotal, discount, taxable, tax, beforeRound, grandTotal, roundOff };
    }, [items, form.creditMode, form.manualTaxableAmount, form.manualTaxRate]);
    const invoiceRemainingCredit = useMemo(() => {
        if (!selectedOrder) return 0;
        if (selectedOrder.remainingCreditTotal !== undefined) {
            return Math.max(0, r2(selectedOrder.remainingCreditTotal));
        }
        const invoiceTotal = n(
            selectedOrder.invoiceTotal ??
            selectedOrder.roundOffFinalRevenue ??
            selectedOrder.finalRevenue ??
            selectedOrder.totalAmount
        );
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
        let active = true;
        axios.get(`${API_BASE}/api/profile`, getAuthConfig())
            .then((response) => {
                if (active) setProfile(response.data || null);
            })
            .catch((error) => {
                console.error("Credit Note profile load failed:", error);
            });
        return () => {
            active = false;
        };
    }, []);

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
                const response = await axios.get(`${API_BASE}/api/credit-notes/invoices/search`, {
                    ...getAuthConfig(),
                    params: { q: value.trim(), limit: 15 },
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

    const loadOrder = async (orderId, excludeCreditNoteId = "", existingNote = null) => {
        try {
            setLoading(true);
            setError("");
            const response = await axios.get(`${API_BASE}/api/credit-notes/available/${orderId}`, {
                ...getAuthConfig(),
                params: excludeCreditNoteId ? { excludeCreditNoteId } : undefined,
            });
            const availableResponse = response.data;
            const payload = availableResponse?.order;
            if (!payload) throw new Error("Invoice not found.");

            const availableItems = Array.isArray(availableResponse?.items) ? availableResponse.items : [];
            const normalizedOrder = {
                ...payload,
                roundOffFinalRevenue: n(payload.invoiceTotal ?? payload.roundOffFinalRevenue ?? payload.finalRevenue ?? 0),
                alreadyCreditedAmount: n(payload.previouslyCreditedTotal),
                remainingCreditTotal: n(payload.remainingCreditTotal),
            };

            setSelectedOrder(normalizedOrder);
            setInvoiceSearch(payload.orderNumber || "");
            setSearchResultsOpen(false);
            setOrders([]);
            const existingItems = Array.isArray(existingNote?.items) ? existingNote.items : [];
            setItems(availableItems.map((item) => {
                const existing = existingItems.find((x) => String(x.sourceSubOrderId) === String(item._id));
                return calculateCreditLine({

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
                availableCreditQty: n(item.availableQuantity),
                unitPrice: n(item.unitPrice),
                discountRate: n(payload.discountRate),
                taxRate: n(payload.taxPercentage),
                billedQuantity: n(item.billedQuantity),
                creditMTR: existing?.MTR > 0 ? n(existing.MTR) : 0,
                creditQuantity: existing?.quantity > 0 ? n(existing.quantity) : 0,
            });
            }));

            const due = Math.max(0, n(payload.dueAmount) - n(payload.alreadyAppliedCreditAmount));
            setForm((current) => ({
                ...current,
                originalOrderId: payload._id,
                adjustmentAmount: due > 0 ? 0 : 0,
                refundAmount: 0,
                manualTaxRate: n(payload.taxPercentage ?? 5),
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
        if (form.creditMode === "ITEM" && !activeItems.length) return "Enter credit quantity for at least one item.";
        if (form.creditMode === "AMOUNT" && n(form.manualTaxableAmount) <= 0) return "Enter a valid taxable credit amount.";

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
        if (n(form.customerCreditAmount) < 0) return "Customer credit cannot be negative.";
        if (n(form.refundAmount) > 0 && !form.refundMethod) return "Select a refund method.";
        if (r2(n(form.adjustmentAmount) + n(form.refundAmount) + n(form.customerCreditAmount)) !== r2(totals.grandTotal)) return "Adjustment, refund and customer credit must exactly equal the Credit Note total.";
        if (form.stockAffecting && (form.creditMode !== "ITEM" || form.reason !== "Sales Return")) return "Stock return is allowed only for item-based Sales Return credits.";
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
                    creditMode: form.creditMode,
                    originalOrderId: form.originalOrderId,
                    stockAffecting: Boolean(form.stockAffecting),
                    settlement: {
                        adjustmentType: form.adjustmentType,
                        adjustmentAmount: r2(form.adjustmentAmount),
                        refundAmount: r2(form.refundAmount),
                        refundMethod: form.refundAmount > 0 ? form.refundMethod : null,
                        customerCreditAmount: r2(form.customerCreditAmount),
                    },
                    manualCredit: form.creditMode === "AMOUNT" ? {
                        taxableAmount: r2(form.manualTaxableAmount),
                        taxRate: r2(form.manualTaxRate),
                    } : undefined,
                    note: form.note.trim(),
                    items: form.creditMode === "ITEM" ? items
                        .filter((item) => getCreditQty(item) > 0)
                        .map((item) => ({
                            sourceSubOrderId: item._id,
                            quantity: item.qtyUnit === "MTR" ? 0 : r2(item.creditQuantity),
                            MTR: item.qtyUnit === "MTR" ? r2(item.creditMTR) : 0,
                            discountRate: r2(item.discountRate),
                            taxRate: r2(item.taxRate),
                        })) : [],
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

    const startEditNote = async (note) => {
        if (!note || note.status === "Cancelled") {
            setError("Cancelled Credit Notes cannot be edited.");
            return;
        }

        try {
            setLoading(true);
            setError("");
            const response = await axios.get(
                `${API_BASE}/api/credit-notes/${note._id}`,
                getAuthConfig()
            );
            const fullNote = response.data?.creditNote;
            if (!fullNote) throw new Error("Credit Note not found.");

            const orderId = fullNote.originalOrderId?._id || fullNote.originalOrderId;
            const settlement = fullNote.settlement || {};

            setEditingNote({ _id: fullNote._id });
            setForm({
                ...emptyForm(),
                creditNoteNumber: fullNote.creditNoteNumber || "",
                creditNoteDate: fullNote.creditNoteDate
                    ? new Date(fullNote.creditNoteDate).toISOString().slice(0, 10)
                    : today(),
                reason: fullNote.reason || "Other",
                originalOrderId: orderId || "",
                creditMode: fullNote.creditMode || "ITEM",
                adjustmentType: settlement.adjustmentType || "Outstanding",
                adjustmentAmount: n(settlement.adjustmentAmount),
                refundAmount: n(settlement.refundAmount),
                refundMethod: settlement.refundMethod || "Cash",
                customerCreditAmount: n(settlement.customerCreditAmount),
                autoSettlement: false,
                stockAffecting: Boolean(fullNote.stockAffecting),
                manualTaxableAmount: n(fullNote.manualCredit?.taxableAmount),
                manualTaxRate: n(fullNote.manualCredit?.taxRate ?? fullNote.originalOrder?.taxPercentage ?? 5),
                note: fullNote.note || "",
            });

            setView("edit");
            await loadOrder(orderId, fullNote._id, fullNote);
            setPreviewNote(fullNote);
            setSuccess("");
        } catch (error) {
            setError(getErrorMessage(error));
        } finally {
            setLoading(false);
        }
    };

    const updateNote = async () => {
        if (!editingNote?._id) return;

        const message = validateClient();
        if (message) {
            setError(message);
            return;
        }

        try {
            setSaving(true);
            setError("");

            const response = await axios.put(
                `${API_BASE}/api/credit-notes/${editingNote._id}`,
                {
                    creditNoteNumber: form.creditNoteNumber.trim(),
                    creditNoteDate: form.creditNoteDate,
                    reason: form.reason,
                    creditMode: form.creditMode,
                    originalOrderId: form.originalOrderId,
                    stockAffecting: Boolean(form.stockAffecting),
                    settlement: {
                        adjustmentType: "Outstanding",
                        adjustmentAmount: r2(form.adjustmentAmount),
                        refundAmount: r2(form.refundAmount),
                        refundMethod: form.refundAmount > 0 ? form.refundMethod : null,
                        customerCreditAmount: r2(form.customerCreditAmount),
                    },
                    manualCredit: form.creditMode === "AMOUNT"
                        ? {
                            taxableAmount: r2(form.manualTaxableAmount),
                            taxRate: r2(form.manualTaxRate),
                        }
                        : undefined,
                    note: form.note.trim(),
                    items: form.creditMode === "ITEM"
                        ? items.filter((item) => getCreditQty(item) > 0).map((item) => ({
                            sourceSubOrderId: item._id,
                            quantity: item.qtyUnit === "MTR" ? 0 : r2(item.creditQuantity),
                            MTR: item.qtyUnit === "MTR" ? r2(item.creditMTR) : 0,
                            discountRate: r2(item.discountRate),
                            taxRate: r2(item.taxRate),
                        }))
                        : [],
                },
                getAuthConfig()
            );

            const updated = response.data?.creditNote;
            setPreviewNote(updated);
            setEditingNote(null);
            setSuccess(response.data?.message || "Credit Note updated successfully.");
            setView("preview");
            await loadCreditNotes({ ...filters, page: 1 });
        } catch (error) {
            setError(getErrorMessage(error));
        } finally {
            setSaving(false);
        }
    };

    const deleteNote = async (id) => {
        if (!id) return;
        if (!window.confirm("Cancel this Credit Note? The accounting effect will be reversed and the record will be marked as Cancelled. This action cannot be undone.")) return;

        const cancellationReason = window.prompt(
            "Enter a cancellation reason (required for audit):",
            ""
        );
        if (cancellationReason === null) return;
        if (!cancellationReason.trim()) {
            setError("Cancellation reason is required.");
            return;
        }

        try {
            setCancellingId(id);
            setError("");
            const response = await axios.delete(
                `${API_BASE}/api/credit-notes/${id}`,
                {
                    ...getAuthConfig(),
                    data: { reason: cancellationReason.trim() },
                }
            );
            setSuccess(response.data?.message || "Credit Note deleted successfully.");
            await loadCreditNotes(filters);
            if (previewNote?._id === id) {
                setPreviewNote(response.data?.creditNote || null);
                setView("preview");
            }
        } catch (error) {
            setError(getErrorMessage(error));
        } finally {
            setCancellingId(null);
        }
    };

    const print = async () => {
        if (!previewNote?._id) return;

        const printWindow = window.open("", "_blank");
        if (!printWindow) {
            setError("Please allow pop-ups to print the Credit Note.");
            return;
        }

        printWindow.document.open();
        printWindow.document.write(
            "<p style='font-family:Arial,sans-serif;padding:24px'>Preparing Credit Note...</p>"
        );
        printWindow.document.close();

        try {
            const response = await axios.get(
                `${API_BASE}/api/credit-notes/${previewNote._id}/print`,
                {
                    ...getAuthConfig(),
                    responseType: "text",
                }
            );

            printWindow.document.open();
            printWindow.document.write(response.data);
            printWindow.document.close();
            printWindow.focus();
        } catch (error) {
            console.error("Credit Note print error:", error);
            printWindow.close();
            setError(
                error?.response?.data?.message ||
                error?.message ||
                "Unable to print Credit Note."
            );
        }
    };

    return (
        <div className="container-fluid py-3">
            <style>{`
                .credit-note-page .form-control:focus, .credit-note-page .form-select:focus { box-shadow: 0 0 0 .2rem rgba(13,110,253,.12); }
                .credit-note-page .table th { white-space: nowrap; }
                .credit-note-sheet { max-width: 1100px; margin: 0 auto; background: #fff; border: 1px solid #d9dee5; padding: 34px; box-shadow: 0 8px 30px rgba(0,0,0,.06); position: relative; }
                .cn-header { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 18px; border-bottom: 2px solid #1f2937; }
                .cn-company { flex: 1; }
                .cn-company-name { font-size: 25px; font-weight: 800; color: #111827; }
                .cn-company-title { margin-top: 2px; color: #4b5563; font-weight: 600; }
                .cn-company-address, .cn-company-contact { margin-top: 4px; color: #4b5563; }
                .cn-document { min-width: 270px; text-align: right; }
                .cn-document-title { font-size: 28px; font-weight: 900; letter-spacing: .8px; margin-bottom: 8px; }
                .cn-meta-row { display: flex; justify-content: flex-end; gap: 9px; margin-top: 3px; color: #6b7280; }
                .cn-meta-row strong { color: #111827; }
                .cn-status { display: inline-block; margin-top: 9px; padding: 4px 10px; border: 1px solid #6b7280; font-size: 10px; font-weight: 800; letter-spacing: .6px; }
                .cn-status.cancelled { border-color: #b91c1c; color: #b91c1c; }
                .cn-info-grid { display: grid; grid-template-columns: 1.2fr .8fr; gap: 14px; margin: 16px 0; }
                .cn-info-box, .cn-total-box { border: 1px solid #d1d5db; border-radius: 6px; padding: 13px; }
                .cn-section-label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: .7px; font-weight: 800; margin-bottom: 6px; }
                .cn-bold { font-weight: 800; color: #111827; margin-bottom: 2px; }
                .cn-muted { color: #6b7280; }
                .cn-items-table { margin-bottom: 0; }
                .cn-items-table thead th { background: #1f2937 !important; color: #fff; font-size: 11px; }
                .cn-settlement-row { display: flex; justify-content: space-between; gap: 14px; border-bottom: 1px dashed #e5e7eb; padding: 6px 0; }
                .cn-note-box { margin-top: 12px; padding: 9px 11px; background: #f8fafc; border-left: 3px solid #1f2937; }
                .cn-amount-words { margin-top: 14px; padding-top: 11px; border-top: 1px dashed #d1d5db; }
                .cn-total-row { display: flex; justify-content: space-between; padding: 4px 0; gap: 12px; }
                .cn-grand-row { display: flex; justify-content: space-between; gap: 12px; margin-top: 7px; padding-top: 9px; border-top: 2px solid #111827; font-size: 18px; font-weight: 900; }
                .cn-footer { display: flex; justify-content: space-between; gap: 24px; margin-top: 22px; padding-top: 14px; border-top: 1px solid #d1d5db; }
                .cn-signature { min-width: 220px; text-align: center; padding-top: 26px; }
                .cn-print-footer { margin-top: 18px; padding-top: 9px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 10px; color: #6b7280; }
                .credit-note-cancelled-stamp { position: absolute; top: 170px; right: 70px; transform: rotate(-14deg); border: 4px solid #b91c1c; color: #b91c1c; font-weight: 900; font-size: 28px; letter-spacing: 2px; padding: 10px 20px; opacity: .16; pointer-events: none; }
                .invoice-search-menu { max-height: 320px; overflow-y: auto; z-index: 1080; }
                @media print {
                    @page { size: A4; margin: 10mm; }
                    body { background: #fff !important; }
                    .no-print { display: none !important; }
                    .container-fluid { padding: 0 !important; margin: 0 !important; }
                    .credit-note-page { width: 100% !important; }
                    .credit-note-print { display: block !important; }
                    .credit-note-list, .credit-note-create { display: none !important; }
                    .credit-note-sheet { max-width: none; margin: 0; border: 0; box-shadow: none; padding: 0; }
                    .credit-note-cancelled-stamp { opacity: .18; }
                    .table-responsive { overflow: visible !important; }
                    .cn-items-table { font-size: 10px; }
                    .cn-items-table th, .cn-items-table td { padding: 5px 4px !important; }
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
                                            <td>{note.originalInvoiceNumber || note.originalOrder?.orderNumber || "-"}</td>
                                            <td>{note.companyName || "-"}</td>
                                            <td>{note.reason}</td>
                                            <td><span className={`badge ${note.status === "Cancelled" ? "text-bg-danger" : "text-bg-success"}`}>{note.status}</span></td>
                                            <td className="text-end">{money(note?.totals?.grandTotal)}</td>
                                            <td className="text-end">{money(note?.settlement?.adjustmentAmount)}</td>
                                            <td className="text-end">{money(note?.settlement?.refundAmount)}</td>
                                            <td className="text-end no-print"><div className="btn-group btn-group-sm"><button className="btn btn-outline-primary" onClick={() => openNote(note._id)}>View</button><button className="btn btn-outline-secondary" onClick={async () => { setPreviewNote(note); setView("preview"); }} title="Open Credit Note">Print</button>{note.status === "Posted" && <button className="btn btn-outline-warning" onClick={() => startEditNote(note)}>Edit</button>}{note.status === "Posted" && <button className="btn btn-outline-danger" disabled={cancellingId === note._id} onClick={() => deleteNote(note._id)}>{cancellingId === note._id ? "..." : "Cancel"}</button>}</div></td>
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
                            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3"><h5 className="fw-bold mb-0">Create Credit Note</h5><div className="d-flex gap-2 align-items-center"><select className="form-select form-select-sm" value={form.creditMode} onChange={(e) => setForm((f) => ({ ...f, creditMode: e.target.value }))}><option value="ITEM">Item Based</option><option value="AMOUNT">Amount Based</option></select>{form.reason === "Sales Return" && <div className="form-check form-switch border rounded px-5 py-1 mb-0"><input className="form-check-input" type="checkbox" checked={!!form.stockAffecting} onChange={(e) => setForm((f) => ({ ...f, stockAffecting: e.target.checked }))} id="stockAffecting"/><label className="form-check-label" htmlFor="stockAffecting">Return Stock</label></div>}<span className="badge text-bg-light border">Number generated by server</span></div></div>

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

                                {form.creditMode === "AMOUNT" && <div className="card border mb-3"><div className="card-body"><h6 className="fw-bold">Manual Credit Amount</h6><div className="row g-3"><div className="col-md-6"><label className="form-label">Taxable Credit Amount</label><input type="number" min="0" step="0.01" className="form-control" value={form.manualTaxableAmount} onChange={(e) => setForm((f) => ({ ...f, manualTaxableAmount: r2(e.target.value) }))}/></div><div className="col-md-6"><label className="form-label">Tax Rate %</label><input type="number" min="0" max="100" step="0.01" className="form-control" value={form.manualTaxRate} onChange={(e) => setForm((f) => ({ ...f, manualTaxRate: r2(e.target.value) }))}/></div></div></div></div>}{form.creditMode === "ITEM" && <div className="table-responsive border rounded mb-3"><table className="table table-sm table-bordered align-middle mb-0"><thead className="table-light"><tr><th>Design</th><th>Item</th><th>HSN</th><th>Unit</th><th>Invoice Qty</th><th>Previous Credit</th><th>Available</th><th style={{ minWidth: 125 }}>Credit Qty</th><th>Rate</th><th>Disc %</th><th>Tax %</th><th className="text-end">Taxable</th><th className="text-end">Tax</th><th className="text-end">Total</th></tr></thead>
                                    <tbody>{items.map((item, index) => <tr key={item._id}>
                                        <td>{item.designNumber || "-"}</td><td>{item.orderName || "-"}</td><td>{item.hsnCode || "-"}</td><td>{item.qtyUnit || "PCS"}</td>
                                        <td>{n(item.billedQuantity) > 0 ? n(item.billedQuantity).toFixed(2) : (n(item.availableCreditQty) + (item.qtyUnit === "MTR" ? n(item.previouslyCreditedMTR) : n(item.previouslyCreditedQuantity))).toFixed(2)}</td>
                                        <td>{item.qtyUnit === "MTR" ? n(item.previouslyCreditedMTR).toFixed(2) : n(item.previouslyCreditedQuantity).toFixed(2)}</td>
                                        <td className="fw-semibold text-success">{n(item.availableCreditQty).toFixed(2)}</td>
                                        <td><input type="number" min="0" max={n(item.availableCreditQty)} step="0.01" className="form-control form-control-sm" value={item.qtyUnit === "MTR" ? item.creditMTR : item.creditQuantity} onChange={(e) => updateItem(index, item.qtyUnit === "MTR" ? "creditMTR" : "creditQuantity", e.target.value)} /></td>
                                        <td>{money(item.unitPrice)}</td><td>{n(item.discountRate).toFixed(2)}</td><td>{n(item.taxRate).toFixed(2)}</td>
                                        <td className="text-end">{money(item.taxable)}</td><td className="text-end">{money(item.tax)}</td><td className="text-end fw-semibold">{money(item.total)}</td>
                                    </tr>)}{items.length === 0 && <tr><td colSpan="14" className="text-center py-5 text-muted">No creditable items found.</td></tr>}</tbody>
                                </table></div>}

                                <div className="d-flex flex-wrap gap-2 mb-3 no-print"><button className="btn btn-outline-primary btn-sm" onClick={applyAllAvailable}>Credit All Available</button><button className="btn btn-outline-secondary btn-sm" onClick={clearAllItemCredits}>Clear Quantities</button></div>

                                <div className="row g-3">
                                    <div className="col-lg-7"><div className="card border h-100"><div className="card-body"><h6 className="fw-bold">Settlement</h6><div className="small text-muted mb-2">Automatic: apply to invoice due first, then refund the remaining amount.</div><div className="row g-3">
                                        <div className="col-md-4"><label className="form-label">Adjustment Type</label><select className="form-select" value="Outstanding" disabled><option>Outstanding</option><option>Advance</option><option>Other</option></select></div><div className="col-md-4"><label className="form-label">Adjust Against Invoice Due</label><input type="number" className="form-control" min="0" max={invoiceDueAvailableForAdjustment} step="0.01" value={form.adjustmentAmount} readOnly /><div className="small text-muted mt-1">Maximum: {money(invoiceDueAvailableForAdjustment)}</div></div>
                                        <div className="col-md-4"><label className="form-label">Refund Amount</label><input type="number" className="form-control" min="0" max={totals.grandTotal} step="0.01" value={form.refundAmount} readOnly /></div>
                                        <div className="col-md-4"><label className="form-label">Refund Method</label><div className="small text-muted">Required when refund is greater than zero.</div><select className="form-select" value={form.refundMethod} onChange={(e) => setForm((f) => ({ ...f, refundMethod: e.target.value }))}>{REFUND_METHODS.map((method) => <option key={method}>{method}</option>)}</select></div>
                                        <div className="col-md-4"><label className="form-label">Note</label><textarea className="form-control" rows="2" maxLength="1000" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} /></div>
                                    </div></div></div></div>
                                    <div className="col-lg-5"><div className="card border h-100"><div className="card-body"><div className="d-flex justify-content-between"><span>Subtotal</span><span>{money(totals.subtotal)}</span></div><div className="d-flex justify-content-between"><span>Discount</span><span>{money(totals.discount)}</span></div><div className="d-flex justify-content-between"><span>Taxable</span><span>{money(totals.taxable)}</span></div><div className="d-flex justify-content-between"><span>Tax</span><span>{money(totals.tax)}</span></div><div className="d-flex justify-content-between"><span>Round Off</span><span>{money(totals.roundOff)}</span></div><hr/><div className="d-flex justify-content-between fs-5 fw-bold"><span>Credit Note Total</span><span>{money(totals.grandTotal)}</span></div><div className="d-flex justify-content-between mt-2"><span>Invoice Adjustment</span><span>{money(form.adjustmentAmount)}</span></div><div className="d-flex justify-content-between"><span>Refund</span><span>{money(form.refundAmount)}</span></div><div className={`small mt-2 ${r2(n(form.adjustmentAmount) + n(form.refundAmount) + n(form.customerCreditAmount)) === r2(totals.grandTotal) ? "text-success" : "text-danger"}`}>Allocated: {money(r2(n(form.adjustmentAmount) + n(form.refundAmount)))} / {money(totals.grandTotal)}</div></div></div></div>
                                </div>
                            </>}

                            <div className="d-flex justify-content-end gap-2 mt-3 no-print"><button className="btn btn-outline-secondary" onClick={() => setView("list")}>Cancel</button><button className="btn btn-primary" disabled={saving || !selectedOrder} onClick={save}>{saving ? <><span className="spinner-border spinner-border-sm me-2" />Saving...</> : "Post Credit Note"}</button></div>
                        </div>
                    </div>
                )}

                {view === "edit" && editingNote && <div className="card border-0 shadow-sm credit-note-create">
                    <div className="card-body">
                        <div className="d-flex justify-content-between align-items-center mb-3">
                            <div><h5 className="fw-bold mb-1">Edit Credit Note</h5><div className="text-muted small">Invoice, total and accounting effects are locked.</div></div>
                            <button className="btn btn-outline-secondary btn-sm" onClick={() => setView("list")}>Back</button>
                        </div>
                        <div className="row g-3">
                            <div className="col-md-4"><label className="form-label fw-semibold">Credit Note Date</label><input type="date" className="form-control" value={editingNote.creditNoteDate} onChange={(e) => setEditingNote((v) => ({ ...v, creditNoteDate: e.target.value }))} /></div>
                            <div className="col-md-8"><label className="form-label fw-semibold">Reason</label><select className="form-select" value={editingNote.reason} onChange={(e) => setEditingNote((v) => ({ ...v, reason: e.target.value }))}>{REASONS.map((reason) => <option key={reason}>{reason}</option>)}</select></div>
                            <div className="col-12"><label className="form-label fw-semibold">Note</label><textarea className="form-control" rows="4" maxLength="1000" value={editingNote.note} onChange={(e) => setEditingNote((v) => ({ ...v, note: e.target.value }))} /></div>
                        </div>
                        <div className="d-flex justify-content-end gap-2 mt-3"><button className="btn btn-outline-secondary" onClick={() => setView("list")}>Cancel</button><button className="btn btn-primary" disabled={saving} onClick={updateNote}>{saving ? "Saving..." : "Update Credit Note"}</button></div>
                    </div>
                </div>}

                {view === "preview" && previewNote && <div className="credit-note-print">
                    <div className="d-flex justify-content-end gap-2 mb-3 no-print"><button className="btn btn-outline-secondary" onClick={() => setView("list")}>Back</button>{previewNote.status === "Posted" && <><button className="btn btn-outline-warning" onClick={() => startEditNote(previewNote)}>Edit</button><button className="btn btn-outline-danger" onClick={() => deleteNote(previewNote._id)}>Cancel</button></>}<button className="btn btn-primary" onClick={print}>Print / Save PDF</button></div>
                    <CreditNotePrint note={previewNote} profile={profile} />
                </div>}
            </div>
        </div>
    );
}

function CreditNotePrint({ note, profile }) {
    const original = note?.originalOrder || {};
    const items = Array.isArray(note?.items) ? note.items : [];
    const totals = note?.totals || {};
    const settlement = note?.settlement || {};
    const customerName = note?.companyName || original?.companyName || "-";
    const customerAddress = [
        note?.Address || original?.Address,
        note?.City || original?.City,
        note?.State || original?.State,
        note?.pinCode || original?.pinCode,
    ].filter(Boolean).join(", ");
    const invoiceTotal = n(
        note?.originalInvoiceTotal ??
        original?.roundOffFinalRevenue ??
        original?.finalRevenue ??
        original?.totalAmount
    );

    const amountInWords = (value) => {
        const ones = ["Zero","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
        const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
        const below100 = (number) => {
            const numberValue = Math.floor(number);
            if (numberValue < 20) return ones[numberValue];
            return tens[Math.floor(numberValue / 10)] + (numberValue % 10 ? ` ${ones[numberValue % 10]}` : "");
        };
        const integer = Math.floor(n(value));
        const paise = Math.round((n(value) - integer) * 100);
        let remaining = integer;
        const parts = [];
        if (remaining >= 10000000) {
            parts.push(`${below100(Math.floor(remaining / 10000000))} Crore`);
            remaining %= 10000000;
        }
        if (remaining >= 100000) {
            parts.push(`${below100(Math.floor(remaining / 100000))} Lakh`);
            remaining %= 100000;
        }
        if (remaining >= 1000) {
            parts.push(`${below100(Math.floor(remaining / 1000))} Thousand`);
            remaining %= 1000;
        }
        if (remaining >= 100) {
            parts.push(`${ones[Math.floor(remaining / 100)]} Hundred`);
            remaining %= 100;
        }
        if (remaining > 0) parts.push(below100(remaining));
        let result = `Indian Rupees ${parts.length ? parts.join(" ") : "Zero"}`;
        if (paise > 0) result += ` and ${below100(paise)} Paise`;
        return result + " Only";
    };

    return (
        <div className="credit-note-sheet">
            {note?.status === "Cancelled" && <div className="credit-note-cancelled-stamp">CANCELLED</div>}

            <div className="cn-header">
                <div className="cn-company">
                    <div className="cn-company-name">{profile?.companyName || "Company"}</div>
                    {profile?.headerTitle && <div className="cn-company-title">{profile.headerTitle}</div>}
                    <div className="cn-company-address">{profile?.companyAddress || ""}</div>
                    {(profile?.phoneNumber1 || profile?.phoneNumber2) && (
                        <div className="cn-company-contact">
                            {profile?.phoneNumber1 && <span>Phone: {profile.phoneNumber1}</span>}
                            {profile?.phoneNumber2 && <span className="ms-2">{profile.phoneNumber2}</span>}
                        </div>
                    )}
                    {(profile?.gstin || profile?.pan) && (
                        <div className="cn-company-contact">
                            {profile?.gstin && <span>GSTIN: {profile.gstin}</span>}
                            {profile?.pan && <span className="ms-2">PAN: {profile.pan}</span>}
                        </div>
                    )}
                </div>

                <div className="cn-document">
                    <div className="cn-document-title">CREDIT NOTE</div>
                    <div className="cn-meta-row"><span>Credit Note No.</span><strong>{note?.creditNoteNumber || "-"}</strong></div>
                    <div className="cn-meta-row"><span>Date</span><strong>{formatDate(note?.creditNoteDate)}</strong></div>
                    <div className="cn-meta-row"><span>Reason</span><strong>{note?.reason || "-"}</strong></div>
                    <span className={`cn-status ${note?.status === "Cancelled" ? "cancelled" : "posted"}`}>
                        {(note?.status || "Posted").toUpperCase()}
                    </span>
                </div>
            </div>

            <div className="cn-info-grid">
                <div className="cn-info-box">
                    <div className="cn-section-label">Customer</div>
                    <div className="cn-bold">{customerName}</div>
                    <div>{customerAddress || "-"}</div>
                    <div className="cn-muted">GSTIN: {note?.gstNumber || original?.gstNumber || "-"}</div>
                </div>

                <div className="cn-info-box">
                    <div className="cn-section-label">Original Invoice</div>
                    <div><span className="cn-muted">Invoice No.:</span> <strong>{note?.originalInvoiceNumber || original?.orderNumber || "-"}</strong></div>
                    <div><span className="cn-muted">Invoice Date:</span> {formatDate(note?.originalInvoiceDate || original?.orderDate)}</div>
                    <div><span className="cn-muted">Invoice Total:</span> {money(invoiceTotal)}</div>
                    {original?.paymentTerms && <div><span className="cn-muted">Payment Terms:</span> {original.paymentTerms}</div>}
                </div>
            </div>

            <div className="table-responsive">
                <table className="table table-bordered cn-items-table align-middle">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Design</th>
                            <th>Description</th>
                            <th>HSN</th>
                            <th>Qty</th>
                            <th className="text-end">Rate</th>
                            <th className="text-end">Disc.</th>
                            <th className="text-end">Taxable</th>
                            <th className="text-end">Tax</th>
                            <th className="text-end">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.length ? items.map((item, index) => (
                            <tr key={item?._id || index}>
                                <td>{index + 1}</td>
                                <td>{item?.designNumber || "-"}</td>
                                <td>{item?.orderName || "-"}</td>
                                <td>{item?.hsnCode ?? "-"}</td>
                                <td>{item?.qtyUnit === "MTR" ? `${n(item?.MTR).toFixed(2)} MTR` : `${n(item?.quantity).toFixed(2)} ${item?.qtyUnit || "PCS"}`}</td>
                                <td className="text-end">{money(item?.unitPrice)}</td>
                                <td className="text-end">{n(item?.discountRate).toFixed(2)}%</td>
                                <td className="text-end">{money(item?.taxableAmount)}</td>
                                <td className="text-end">{money(item?.taxAmount)}</td>
                                <td className="text-end fw-semibold">{money(item?.lineTotal)}</td>
                            </tr>
                        )) : (
                            <tr><td colSpan="10" className="text-center py-4 text-muted">Manual amount-based Credit Note</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="row g-3 mt-1">
                <div className="col-md-7">
                    <div className="cn-info-box h-100">
                        <div className="cn-section-label">Settlement</div>
                        <div className="cn-settlement-row"><span>Adjustment against invoice</span><strong>{money(settlement?.adjustmentAmount)}</strong></div>
                        <div className="cn-settlement-row"><span>Refund</span><strong>{money(settlement?.refundAmount)}</strong></div>
                        {n(settlement?.refundAmount) > 0 && (
                            <div className="cn-settlement-row"><span>Refund Method</span><strong>{settlement?.refundMethod || "-"}</strong></div>
                        )}
                        {n(settlement?.customerCreditAmount) > 0 && (
                            <div className="cn-settlement-row"><span>Customer Credit</span><strong>{money(settlement?.customerCreditAmount)}</strong></div>
                        )}
                        {note?.note && (
                            <div className="cn-note-box"><strong>Note:</strong> {note.note}</div>
                        )}
                        <div className="cn-amount-words">
                            <div className="cn-section-label">Amount in Words</div>
                            <div className="fw-semibold">{amountInWords(totals?.grandTotal)}</div>
                        </div>
                    </div>
                </div>

                <div className="col-md-5">
                    <div className="cn-total-box">
                        <div className="cn-total-row"><span>Subtotal</span><span>{money(totals?.subtotal)}</span></div>
                        <div className="cn-total-row"><span>Discount</span><span>{money(totals?.discountAmount)}</span></div>
                        <div className="cn-total-row"><span>Taxable Amount</span><span>{money(totals?.taxableAmount)}</span></div>
                        <div className="cn-total-row"><span>Tax</span><span>{money(totals?.taxAmount)}</span></div>
                        <div className="cn-total-row"><span>Round Off</span><span>{money(totals?.roundOff)}</span></div>
                        <div className="cn-grand-row"><span>Total Credit</span><span>{money(totals?.grandTotal)}</span></div>
                    </div>
                </div>
            </div>

            <div className="cn-footer">
                <div>
                    {profile?.bankName && <div className="fw-semibold">{profile.bankName}</div>}
                    {profile?.accountNo && <div className="small">A/C No.: {profile.accountNo}</div>}
                    {profile?.branchName && <div className="small">Branch: {profile.branchName}</div>}
                    {profile?.ifsc && <div className="small">IFSC: {profile.ifsc}</div>}
                </div>
                <div className="cn-signature">
                    <div>Authorized Signatory</div>
                    <div className="small text-muted">{profile?.companyName || ""}</div>
                </div>
            </div>

            <div className="cn-print-footer">
                This Credit Note is linked to the original invoice shown above.
            </div>
        </div>
    );
}
