import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useReactToPrint } from "react-to-print";
import {useSearchParams} from "react-router-dom";
import axios from "axios";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import * as Yup from 'yup';
import DynamicTable from "../components/DynamicTable";
import FormConfigurator from "../components/FormConfigurator";
import ConfiguredField from "../components/ConfiguredField";
import {PAYMENT_FORM_FIELDS} from "../config/noCodeCatalog";
import {applyAutoFill,applyFormulas,buildConfiguredDefaults,getFieldState,syncConfiguredCustomFields,useFormConfiguration} from "../hooks/useFormConfiguration";
import {useNoCodeDataSources} from "../hooks/useNoCodeDataSources";

// Configuration constants
const API_CONFIG = {
  BASE_URL: (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, ''),
  ENDPOINTS: {
    ORDERS: '/api/order/orders',
    BULK_PAYMENT: '/api/order/orders/payments/bulk'
    // BULK_PAYMENT: '/api/payments/orders/payments/bulk'
  },
  REQUEST_TIMEOUT: 30000
};

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'UPI', 'Cheque', 'Bank'];
const SPLIT_TYPES = ['proportional', 'custom'];



// Fixed decimal precision utilities
const roundToDecimal = (num, decimals = 2) => {
  // Use Number.EPSILON to handle floating point precision issues
  return Math.round((num + Number.EPSILON) * Math.pow(10, decimals)) / Math.pow(10, decimals);
};

const parseDecimal = (value, decimals = 2) => {
  const num = parseFloat(value) || 0;
  return roundToDecimal(num, decimals);
};

// More precise proportional allocation function
const calculateProportionalAllocation = (orders, totalAmount) => {
  const totalDue = orders.reduce((sum, order) => sum + order.dueAmount, 0);

  if (totalDue === 0) return orders.map(order => ({ ...order, allocated: 0 }));

  let allocations = orders.map(order => ({
    ...order,
    allocated: parseDecimal((order.dueAmount / totalDue) * totalAmount)
  }));

  // Handle rounding differences to ensure total allocation matches payment amount
  const currentTotal = allocations.reduce((sum, item) => sum + item.allocated, 0);
  const difference = parseDecimal(totalAmount - currentTotal);

  if (Math.abs(difference) > 0) {
    // Find the order with the largest due amount to adjust
    const maxDueIndex = allocations.reduce((maxIdx, item, idx) =>
      item.dueAmount > allocations[maxIdx].dueAmount ? idx : maxIdx, 0);

    allocations[maxDueIndex].allocated = parseDecimal(
      allocations[maxDueIndex].allocated + difference
    );
  }

  return allocations;
};

// Date utility functions
const formatDateForInput = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getTodayDate = () => {
  return formatDateForInput(new Date());
};

const getMaxDate = () => {
  const future = new Date();
  future.setFullYear(future.getFullYear() + 1);
  return formatDateForInput(future);
};

const getMinDate = () => {
  const past = new Date();
  past.setFullYear(past.getFullYear() - 1);
  return formatDateForInput(past);
};

// Validation schemas and utilities
const paymentValidationSchema = Yup.object({
  method: Yup.string()
    .oneOf(PAYMENT_METHODS, 'Invalid payment method')
    .required('Payment method is required'),
  amountReference: Yup.string()
    .trim()
    .min(1, 'Amount reference is required')
    .max(100, 'Amount reference too long')
    .required('Amount reference is required'),
  amount: Yup.number()
    .positive('Amount must be positive')
    .max(10000000, 'Amount too large')
    .required('Amount is required'),
  splitType: Yup.string()
    .oneOf(SPLIT_TYPES, 'Invalid split type')
    .required('Split type is required'),
});
// paymentDate: Yup.date()
//   .required('Payment date is required')
//   .min(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), 'Date cannot be more than 1 year ago')
//   .max(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), 'Date cannot be more than 1 year in the future')

const validateCustomSplits = (customSplits, selectedOrders, selectedOrdersData, totalAmount) => {
  const errors = {};
  let totalAllocated = 0;
  const orderById = new Map(selectedOrdersData.map(order => [order._id, order]));

  selectedOrders.forEach(orderId => {
    const amount = parseDecimal(customSplits[orderId] || 0);
    const order = orderById.get(orderId);
    const due = parseDecimal(order?.dueAmount || 0);

    if (amount < 0) {
      errors[orderId] = 'Amount cannot be negative';
    } else if (Math.round(amount * 100) > Math.round(due * 100)) {
      errors[orderId] = `Amount cannot exceed invoice due (₹${due.toFixed(2)})`;
    }

    totalAllocated += amount;
  });

  totalAllocated = parseDecimal(totalAllocated);
  const payment = parseDecimal(totalAmount);
  const difference = Math.abs(parseDecimal(totalAllocated - payment));

  if (difference > 0) {
    errors._total = `Total allocated (₹${totalAllocated.toFixed(2)}) must equal payment amount (₹${payment.toFixed(2)})`;
  }

  return { errors, isValid: Object.keys(errors).length === 0 };
};

const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
};

// API client setup
const createApiClient = () => {
  const client = axios.create({
    baseURL: API_CONFIG.BASE_URL,
    timeout: API_CONFIG.REQUEST_TIMEOUT,
    headers: { 'Content-Type': 'application/json' }
  });

  client.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers['x-auth-token'] = token;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  client.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        localStorage.removeItem('token');
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }
  );

  return client;
};

const apiClient = createApiClient();

/**
 * The invoice endpoint is paginated. Bulk payments must load every page, or
 * bills after the first 100/200 will silently be unavailable for selection.
 */
const fetchAllInvoiceOrders = async (client, signal) => {
  const limit = 200;
  const firstResponse = await client.get(API_CONFIG.ENDPOINTS.ORDERS, {
    signal,
    params: { page: 1, limit }
  });
  const firstData = firstResponse.data || {};
  const orders = Array.isArray(firstData.orders) ? [...firstData.orders] : [];
  const pages = Math.max(1, Number(firstData.pagination?.pages) || 1);

  for (let firstPage = 2; firstPage <= pages; firstPage += 4) {
    const pageNumbers = Array.from(
      { length: Math.min(4, pages - firstPage + 1) },
      (_, index) => firstPage + index
    );
    const responses = await Promise.all(pageNumbers.map(page =>
      client.get(API_CONFIG.ENDPOINTS.ORDERS, {
        signal,
        params: { page, limit }
      })
    ));

    responses.forEach(response => {
      if (Array.isArray(response.data?.orders)) orders.push(...response.data.orders);
    });
  }

  return [...new Map(orders.map(order => [String(order._id), order])).values()];
};

// Sub-components
const PaymentForm = React.memo(({
  form,
  onFormChange,
  totalDue,
  totalAllocated,
  submitting,
  onToggleModal,
  showModal,
  validationErrors,
  customFieldNodes,
  onCustomize
}) => (
  <div className="card p-3 mb-3 shadow-sm">
    <div className="row">

      <div className="col-md-2">
        <label className="form-label">Payment Date</label>
        <input
          type="date"
          className={`form-control ${validationErrors.paymentDate ? 'is-invalid' : ''}`}
          value={form.paymentDate}
          onChange={(e) => onFormChange('paymentDate', e.target.value)}
          min={getMinDate()}
          max={getMaxDate()}
          aria-label="Payment date"
          required
        />
        {validationErrors.paymentDate && (
          <div className="invalid-feedback">{validationErrors.paymentDate}</div>
        )}
      </div>
      <div className="col-md-2">
        <label className="form-label">Total Amount</label>
        <input
          type="number"
          className={`form-control ${validationErrors.amount ? 'is-invalid' : ''}`}
          value={form.amount}
          onChange={(e) => onFormChange('amount', e.target.value)}
          placeholder="0.00"
          min="0"
          max={Math.max(totalDue, 0)}
          step="0.01"
          aria-label="Total payment amount"
          required
        />
        {validationErrors.amount && (
          <div className="invalid-feedback">{validationErrors.amount}</div>
        )}
      </div>
      <div className="col-md-2">
        <label className="form-label">Method</label>
        <select
          className={`form-select ${validationErrors.method ? 'is-invalid' : ''}`}
          value={form.method}
          onChange={(e) => onFormChange('method', e.target.value)}
          aria-label="Payment method"
        >
          {PAYMENT_METHODS.map(method => (
            <option key={method} value={method}>{method}</option>
          ))}
        </select>
        {validationErrors.method && (
          <div className="invalid-feedback">{validationErrors.method}</div>
        )}
      </div>

      <div className="col-md-3">
        <label className="form-label">Amount Reference</label>
        <input
          type="text"
          className={`form-control ${validationErrors.amountReference ? 'is-invalid' : ''}`}
          value={form.amountReference}
          onChange={(e) => onFormChange('amountReference', e.target.value)}
          placeholder="Enter reference number"
          maxLength={100}
          aria-label="Amount reference"
          required
        />
        {validationErrors.amountReference && (
          <div className="invalid-feedback">{validationErrors.amountReference}</div>
        )}
      </div>




      <div className="col-md-1">
        <label className="form-label">Split Type</label>
        <select
          className={`form-select ${validationErrors.splitType ? 'is-invalid' : ''}`}
          value={form.splitType}
          onChange={(e) => onFormChange('splitType', e.target.value)}
          aria-label="Split type"
        >
          {SPLIT_TYPES.map(type => (
            <option key={type} value={type}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="col-md-2 d-flex align-items-end">
        <button
          type="button"
          className="btn btn-outline-secondary w-100 mt-4"
          onClick={onToggleModal}
          aria-label={showModal ? "Hide preview" : "Show preview"}
        >
          <i className={`bi ${showModal ? 'bi-eye-slash-fill' : 'bi-eye-fill'}`}></i>
          {showModal ? ' Hide Preview' : ' Show Preview'}
        </button>
      </div>
    </div>

    <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-3">
      <span className="small text-muted">Optional details are saved with every invoice allocation in this batch.</span>
      <button type="button" className="btn btn-sm btn-light border" onClick={onCustomize}>
        <i className="bi bi-sliders me-1"></i>Customize payment form
      </button>
    </div>
    {customFieldNodes&&customFieldNodes.length>0&&(
      <div className="row g-3 mt-1">{customFieldNodes}</div>
    )}
    {validationErrors._custom&&<div className="alert alert-danger mt-2" role="alert">{validationErrors._custom}</div>}

    <div className="row d-flex justify-content-between align-items-center">
      <div className="col-md-2">
        <label className="form-label mb-0">Selected Due</label>
        <span className="form-control-plaintext fw-bold mt-0 pt-0 text-primary">
          ₹{totalDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>

      <div className="col-md-2">
        <label className="form-label mb-0">Allocated</label>
        <span className={`form-control-plaintext fw-bold mt-0 pt-0 ${Math.round(parseDecimal(form.amount || 0) * 100) === Math.round(totalAllocated * 100) ? 'text-success' : 'text-danger'}`}>
          ₹{totalAllocated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>

      <div className="col-md-2">
        <button
          type="submit"
          className="btn btn-outline-success w-100"
          disabled={submitting}
          aria-label="Submit bulk payment"
        >
          {submitting ? "Processing..." : "Submit Payment"}
        </button>
      </div>


    </div>
  </div>
));

const OrdersTable = React.memo(({
  orders,
  selectedOrders,
  onOrderSelect,
  splitType,
  customSplits,
  onCustomAmountChange
}) => {
  const [searchParams]=useSearchParams();
  const [filters, setFilters] = useState({
    billNo: '',
    challanNumber: '',
    clientName: ''
  });
  const [sortKey] = useState('orderNumber');
  const [sortOrder] = useState('asc');
  const hasActiveFilters = Object.values(filters).some(value => value.trim());

  if (orders.length === 0) {
    return (
      <div className="card p-3 mb-3 shadow-sm text-center">
        <p className="mb-0">No outstanding invoices are available for bulk payment.</p>
      </div>
    );
  }

  const filteredOrders = orders.filter(order => {
    const orderNumber = String(order.orderNumber || "");
    const challanNumber = String(order.challanNumber || "");
    const companyName = String(order.companyName || "");
    return (
      orderNumber.toLowerCase().includes(filters.billNo.toLowerCase()) &&
      challanNumber.toLowerCase().includes(filters.challanNumber.toLowerCase()) &&
      companyName.toLowerCase().includes(filters.clientName.toLowerCase())
    );
  });

  const sortedData = [...filteredOrders].sort((a, b) => {
    let aVal = a[sortKey];
    let bVal = b[sortKey];

    // OrderNumber (natural sort: SS-1, SS-2, ..., SS-100)
    if (sortKey === 'orderNumber') {
      const orderNumberA = String(aVal ?? "");
      const orderNumberB = String(bVal ?? "");
      const numA = parseInt(orderNumberA.match(/\d+/)?.[0] ?? "0", 10);
      const numB = parseInt(orderNumberB.match(/\d+/)?.[0] ?? "0", 10);

      if (numA !== numB) {
        return sortOrder === 'asc' ? numA - numB : numB - numA;
      }

      // Keep natural ordering while safely supporting records with no invoice number.
      return sortOrder === 'asc'
        ? orderNumberA.localeCompare(orderNumberB, undefined, { sensitivity: 'base' })
        : orderNumberB.localeCompare(orderNumberA, undefined, { sensitivity: 'base' });
    }

    // Number comparison
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    }

    // String (default) comparison
    const strA = aVal?.toString() ?? "";
    const strB = bVal?.toString() ?? "";
    return sortOrder === 'asc'
      ? strA.localeCompare(strB, undefined, { sensitivity: 'base' })
      : strB.localeCompare(strA, undefined, { sensitivity: 'base' });
  });


  return (
    <div className="card mb-3 p-3 shadow-sm">

      <div className="row mb-3 g-3">

        <div className="col-md-2">
          <input
            type="text"
            className="form-control"
            placeholder="Bill No."
            value={filters.billNo}
            onChange={(e) => setFilters({ ...filters, billNo: e.target.value })}
          />
        </div>
        <div className="col-md-2">
          <input
            type="text"
            className="form-control"
            placeholder="CH No."
            value={filters.challanNumber}
            onChange={(e) => setFilters({ ...filters, challanNumber: e.target.value })}
          />
        </div>
        <div className="col-md-2">
          <input
            type="text"
            className="form-control"
            placeholder="Client"
            value={filters.clientName}
            onChange={(e) => setFilters({ ...filters, clientName: e.target.value })}
          />
        </div>
      </div>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
        <span className="small text-secondary">{filteredOrders.length} matching invoice{filteredOrders.length === 1 ? "" : "s"}</span>
        {hasActiveFilters && (
          <button type="button" className="btn btn-sm btn-light border" onClick={() => setFilters({ billNo: "", challanNumber: "", clientName: "" })}>
            Clear filters
          </button>
        )}
      </div>

      <DynamicTable
        tableKey="bulk-payments.selection"
        autoOpenSettings={searchParams.get("customize")==="selection"}
        emptyText={hasActiveFilters ? "No invoices match these filters. Clear filters to see all available invoices." : "No outstanding invoices are available for bulk payment."}
        rows={sortedData}
        getRowKey={order=>order._id}
        selectable
        selectedIds={selectedOrders.map(String)}
        onToggleRow={id=>onOrderSelect(id)}
        onToggleAll={()=>{
          const visibleIds=sortedData.map(order=>String(order._id));
          const allSelected=visibleIds.length>0&&visibleIds.every(id=>selectedOrders.includes(id));
          if(allSelected)visibleIds.forEach(id=>onOrderSelect(id));
          else visibleIds.filter(id=>!selectedOrders.includes(id)).forEach(id=>onOrderSelect(id));
        }}
        columns={[
          {key:"orderNumber",label:"Bill No."},
          {key:"challanNumber",label:"CH No."},
          {key:"companyName",label:"Client"},
          {key:"dueAmount",label:"Due Amount",render:order=>`₹${Number(order.dueAmount||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`},
          {key:"orderDate",label:"Order Date",render:order=>order.orderDate?new Date(order.orderDate).toLocaleDateString("en-IN"):"N/A"},
          ...(splitType==="custom"?[
            {key:"customAmount",label:"Custom Amount",locked:true,render:order=>(
              <input
                type="number"
                className="form-control form-control-sm"
                value={customSplits[order._id]??""}
                onChange={e=>onCustomAmountChange(order._id,e.target.value)}
                disabled={!selectedOrders.includes(order._id)}
                min="0"
                step="0.01"
                placeholder="0.00"
              />
            )}
          ]:[])
        ]}
      />
    </div>
  );
});

const AllocationPreview = React.memo(({
  allocatedPreview,
  totalDue,
  totalAllocated,
  paymentAmount,
  paymentDate
}) => {
  const [searchParams]=useSearchParams();
  const paymentAmountNum = parseDecimal(paymentAmount || 0);
  const isAmountMismatch = Math.round(paymentAmountNum * 100) !== Math.round(totalAllocated * 100);

  return (
    <div className="card my-3 p-3 shadow-sm">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="mb-0">Payment Allocation Preview</h5>
        {paymentDate && (
          <span className="badge bg-primary">
            Payment Date: {new Date(paymentDate).toLocaleDateString()}
          </span>
        )}
      </div>

            <DynamicTable
        tableKey="bulk-payments.allocation-preview"
        autoOpenSettings={searchParams.get("customize")==="allocation-preview"}
        rows={allocatedPreview.map(allocation=>({
          ...allocation,
          remaining:parseDecimal(allocation.dueAmount-allocation.allocated)
        }))}
        getRowKey={allocation=>allocation.orderId}
        columns={[
          {key:"orderNumber",label:"Bill No"},
          {key:"dueAmount",label:"Due Amount",render:allocation=>`₹${Number(allocation.dueAmount||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`},
          {key:"allocated",label:"Allocated",render:allocation=>`₹${Number(allocation.allocated||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`},
          {key:"remaining",label:"Remaining",render:allocation=><span className={allocation.remaining<0?"text-danger":allocation.remaining>0?"text-warning":"text-success"}>₹{Number(allocation.remaining||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span>},
        ]}
      />

      <div className="d-flex justify-content-between">
        <strong>Total Payment Due: ₹{totalDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
        <strong>Total Allocated: ₹{totalAllocated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
      </div>

      {isAmountMismatch && (
        <div className="alert alert-warning mt-2" role="alert">
          <i className="bi bi-exclamation-triangle-fill me-2"></i>
          Payment amount (₹{paymentAmountNum.toFixed(2)}) does not match total allocated (₹{totalAllocated.toFixed(2)}).
          Difference: ₹{Math.abs(paymentAmountNum - totalAllocated).toFixed(2)}
        </div>
      )}
    </div>
  );
});

// Error Boundary Component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);

    // if (process.env.NODE_ENV === 'production') {
    //   // Log to external service in production
    // }

    toast.error('An unexpected error occurred. Please refresh the page.');
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="alert alert-danger m-3" role="alert">
          <h4>⚠️ Something went wrong</h4>
          <p>An error occurred while loading this component.</p>
          <button
            className="btn btn-outline-danger"
            onClick={this.handleRetry}
            aria-label="Retry loading component"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Main BulkPayment Component
export default function BulkPayment() {
  // State management
  const [orders, setOrders] = useState([]);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ordersLoadError, setOrdersLoadError] = useState("");
  const [ordersReloadKey, setOrdersReloadKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const submissionLockRef = useRef(false);
  const [showModal, setShowModal] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [paymentFormSettingsOpen,setPaymentFormSettingsOpen]=useState(false);
  const paymentFormConfig=useFormConfiguration("orders.payments",PAYMENT_FORM_FIELDS);
  const emptyPaymentForm=()=>buildConfiguredDefaults({
    method:"Cash",
    amountReference:"",
    amount:"",
    splitType:"proportional",
    paymentDate:getTodayDate(),
    customFields:{}
  },paymentFormConfig.fields);
  const [form,setForm]=useState(()=>emptyPaymentForm());
  const paymentLookupResources=useMemo(
    ()=>Array.from(new Set(paymentFormConfig.fields.map(field=>field.dataSource?.resource).filter(Boolean))),
    [paymentFormConfig.fields]
  );
  const {records:paymentLookupRecords,searchRecords:searchPaymentLookupRecords}=useNoCodeDataSources(paymentLookupResources);
  useEffect(()=>{
    setForm(previous=>buildConfiguredDefaults({
      ...previous,
      customFields:{...(previous.customFields||{})}
    },paymentFormConfig.fields));
  },[paymentFormConfig.fields]);

  const [customSplits, setCustomSplits] = useState({});

  // Fetch orders with cleanup
  useEffect(() => {
    const controller = new AbortController();

    const fetchOrders = async () => {
      try {
        setLoading(true);
        setOrdersLoadError("");
        const allOrders = await fetchAllInvoiceOrders(apiClient, controller.signal);
        const availableOrders = allOrders.filter(
          order => order.status !== 'Cancelled' && Number(order.dueAmount || 0) > 0
        );
        setOrders(availableOrders);
        setOrdersLoadError("");
      } catch (error) {
        if (!controller.signal.aborted) {
          const message = error.response?.data?.message || error.message || "Unable to load invoices.";
          console.error('Failed to fetch orders:', error);
          setOrdersLoadError(message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchOrders();

    return () => {
      controller.abort();
    };
  }, [ordersReloadKey]);

  // Memoized calculations for performance with proper decimal handling
  const selectedOrdersData = useMemo(() =>
    orders.filter(o => selectedOrders.includes(o._id)),
    [orders, selectedOrders]
  );

  const totalDue = useMemo(() =>
    parseDecimal(selectedOrdersData.reduce((sum, o) => sum + Number(o.dueAmount || 0), 0)),
    [selectedOrdersData]
  );

  const allocatedPreview = useMemo(() => {
    if (!form.amount || selectedOrders.length === 0) return [];

    const paymentAmount = parseDecimal(form.amount);

    if (form.splitType === "proportional") {
      const allocations = calculateProportionalAllocation(selectedOrdersData, paymentAmount);
      return allocations.map(o => ({
        orderId: o._id,
        dueAmount: o.dueAmount,
        allocated: o.allocated,
        orderNumber: o.orderNumber
      }));
    } else {
      return selectedOrdersData.map(o => ({
        orderId: o._id,
        dueAmount: o.dueAmount,
        allocated: parseDecimal(customSplits[o._id] || 0),
        orderNumber: o.orderNumber
      }));
    }
  }, [form.amount, form.splitType, selectedOrdersData, customSplits]);

  const totalAllocated = useMemo(() =>
    parseDecimal(allocatedPreview.reduce((sum, a) => sum + a.allocated, 0)),
    [allocatedPreview]
  );

  // Event handlers with useCallback for optimization
  const handleOrderSelect = useCallback((orderId) => {
    setSelectedOrders(prev =>
      prev.includes(orderId)
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  }, []);

  const updatePaymentCustomField=(field,value,record=null)=>{
    setForm(previous=>{
      let next={
        ...previous,
        [field.key]:value,
        customFields:{...(previous.customFields||{})}
      };
      if(field.custom)next.customFields[field.key]=value;
      if(field.dataSource?.autoFill?.length)next=applyAutoFill(field,record,next);
      next=applyFormulas(paymentFormConfig.fields,next);
      return syncConfiguredCustomFields(next,paymentFormConfig.fields);
    });
  };

  const paymentCustomFieldError=values=>{
    const formValues={...(values||{}),...((values||{}).customFields||{})};
    const missing=paymentFormConfig.fields.filter(field=>field.custom&&!field.formula).find(field=>{
      const state=getFieldState(field,formValues);
      if(!state.visible||!state.required||state.disabled)return false;
      const value=values?.customFields?.[field.key]??values?.[field.key];
      return value===undefined||value===null||String(value).trim()==="";
    });
    return missing?`Please complete “${missing.label}” before saving the payment.`:"";
  };

  const paymentCustomFieldNodes=paymentFormConfig.fields.filter(field=>field.custom).map(field=>{
    const state=getFieldState(field,{...form,...(form.customFields||{})});
    if(!state.visible)return null;
    return(
      <div className={`col-md-${Math.min(12,Math.max(1,Number(field.width)||6))}`} key={field.key}>
        <ConfiguredField
          field={field}
          value={form[field.key]??form.customFields?.[field.key]??field.defaultValue??""}
          onChange={value=>updatePaymentCustomField(field,value)}
          onRecordChange={record=>updatePaymentCustomField(
            field,
            record?.[field.dataSource?.valueField||"_id"]??"",
            record
          )}
          lookupRecords={field.dataSource?.resource?paymentLookupRecords[field.dataSource.resource]||[]:[]}
          onLookupSearch={searchPaymentLookupRecords}
          options={field.options||[]}
          required={state.required}
          readOnly={state.readOnly}
          disabled={state.disabled||submitting}
          help={field.helpText}
        />
      </div>
    );
  }).filter(Boolean);

  const handleFormChange = useCallback((field, value) => {
    let sanitizedValue = value;

    // Special handling for date input
    if (field === 'paymentDate') {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        toast.error('Invalid date format');
        return;
      }
    } else if (field === 'amount') {
      // Handle decimal precision for amount field
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        sanitizedValue = numValue.toString();
      }
    } else {
      sanitizedValue = sanitizeInput(value);
    }

    setForm(prev => syncConfiguredCustomFields(applyFormulas(paymentFormConfig.fields,{ ...prev, [field]: sanitizedValue }),paymentFormConfig.fields));

    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }, [validationErrors,paymentFormConfig.fields]);

  const handleCustomAmountChange = useCallback((orderId, value) => {
    const numValue = parseDecimal(value || 0);
    setCustomSplits(prev => ({ ...prev, [orderId]: numValue }));
  }, []);

  const validateForm = async () => {
    try {
      await paymentValidationSchema.validate(form, { abortEarly: false });

      const paymentAmount = parseDecimal(form.amount);
      if (Math.round(paymentAmount * 100) > Math.round(totalDue * 100)) {
        setValidationErrors({
          _total: `Payment amount cannot exceed selected invoice dues of ₹${totalDue.toFixed(2)}`
        });
        return false;
      }

      const customFieldMessage=paymentCustomFieldError(form);
      if(customFieldMessage){
        setValidationErrors({_custom:customFieldMessage});
        return false;
      }

      if (form.splitType === 'custom') {
        const { errors, isValid } = validateCustomSplits(
          customSplits,
          selectedOrders,
          selectedOrdersData,
          paymentAmount
        );
        if (!isValid) {
          setValidationErrors(errors);
          return false;
        }
      }

      setValidationErrors({});
      return true;
    } catch (error) {
      const errors = {};
      error.inner?.forEach(err => {
        errors[err.path] = err.message;
      });
      setValidationErrors(errors);
      return false;
    }
  };

    const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (submissionLockRef.current) return;
    submissionLockRef.current = true;

    const controller = new AbortController();

    try {
      setSubmitting(true);
      if (selectedOrders.length === 0) {
        toast.error("Please select at least one order");
        return;
      }

      const isValid = await validateForm();
      if (!isValid) {
        toast.error("Please fix validation errors");
        return;
      }

      // // Debug logging
      // console.log('🔍 Frontend Debug - Selected Orders:', {
      //   selectedOrders,
      //   selectedOrdersLength: selectedOrders.length,
      //   selectedOrdersType: typeof selectedOrders[0],
      //   sampleSelectedOrder: selectedOrders[0]
      // });

      // console.log('🔍 Frontend Debug - Available Orders:', {
      //   totalOrders: orders.length,
      //   sampleOrder: orders[0],
      //   orderIds: orders.map(o => ({ id: o._id, number: o.orderNumber }))
      // });

      const preparedForm=applyFormulas(
        paymentFormConfig.fields,
        syncConfiguredCustomFields(form,paymentFormConfig.fields)
      );
      let payload = {
        method: preparedForm.method,
        amountReference: preparedForm.amountReference,
        amount: parseDecimal(preparedForm.amount),
        splitType: preparedForm.splitType,
        paymentDate: preparedForm.paymentDate,
        customFields:preparedForm.customFields||{},
        // updates: form.splitType === "proportional"
        //   ? selectedOrders // Send as array of strings for proportional
        //   : selectedOrders.map(orderId => ({
        //     orderId: orderId,
        //     amount: parseDecimal(customSplits[orderId] || 0)
        //   })),
        updates: form.splitType === "proportional"
          ? selectedOrders.map(id => ({ orderId: id })) // Ensure consistent format
          : selectedOrders.map(orderId => ({
            orderId,
            amount: parseDecimal(customSplits[orderId] || 0)
          }))
      };

      // console.log('🔍 Frontend Debug - Payload being sent:', {
      //   payload,
      //   updatesFormat: payload.updates,
      //   updatesLength: payload.updates.length
      // });


      await apiClient.put(API_CONFIG.ENDPOINTS.BULK_PAYMENT, payload, {
        signal: controller.signal
      });

      toast.success(`Bulk Payment Successful for ${new Date(form.paymentDate).toLocaleDateString()} ✅`);

      // Reset form
      setForm(emptyPaymentForm());
      setSelectedOrders([]);
      setCustomSplits({});
      setValidationErrors({});
      setShowModal(false);

      // A successful payment must not be reported as failed just because a
      // follow-up list refresh has a network problem.
      try {
        const allOrders = await fetchAllInvoiceOrders(apiClient, controller.signal);
        const availableOrders = allOrders.filter(
          order => order.status !== 'Cancelled' && Number(order.dueAmount || 0) > 0
        );
        setOrders(availableOrders);
        setOrdersLoadError("");
      } catch (refreshError) {
        if (!controller.signal.aborted) {
          console.error('Bulk payment was saved, but invoice refresh failed:', refreshError);
          setOrdersLoadError("The bulk payment was recorded, but invoice balances could not be refreshed. The displayed balances may be out of date. Refresh before recording another bulk payment.");
        }
      }

    } catch (error) {
      if (!controller.signal.aborted) {
        toast.error(error.response?.data?.message || "Payment failed ❌");
      }
    } finally {
      submissionLockRef.current = false;
      setSubmitting(false);
    }
  }, [form, selectedOrders, customSplits, orders, totalDue, selectedOrdersData,paymentFormConfig.fields]);
  const reportRef = useRef();
  const contentRef = useRef(null);
  const reactToPrintFn = useReactToPrint({ contentRef });

  const toggleModal = useCallback(() => {
    setShowModal(prev => !prev);
  }, []);

  if (loading) {
    return (
      <div className="container-fluid bulk-payment-page px-3 py-3 text-center">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading orders...</span>
        </div>
        <p className="mt-2">Loading orders...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="container-fluid bulk-payment-page px-3 py-3">
        <ToastContainer
          position="top-right"
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
        />

        <h3 className="mb-3">💰 Bulk Payment Distribution</h3>

        <form onSubmit={handleSubmit} noValidate>
          <PaymentForm
            form={form}
            onFormChange={handleFormChange}
            totalDue={totalDue}
            totalAllocated={totalAllocated}
            submitting={submitting}
            onToggleModal={toggleModal}
            showModal={showModal}
            validationErrors={validationErrors}
            customFieldNodes={paymentCustomFieldNodes}
            onCustomize={()=>setPaymentFormSettingsOpen(true)}
          />

          {showModal && (
            <AllocationPreview
              allocatedPreview={allocatedPreview}
              totalDue={totalDue}
              totalAllocated={totalAllocated}
              paymentAmount={form.amount}
              paymentDate={form.paymentDate}
            />
          )}

          {ordersLoadError ? (
            <div className="alert alert-danger d-flex flex-wrap align-items-center gap-2 mt-3" role="alert">
              <div className="flex-grow-1">
                <div className="fw-semibold">Invoice balances are not available.</div>
                <div className="small">{ordersLoadError}</div>
              </div>
              <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => setOrdersReloadKey(key => key + 1)} disabled={loading}>
                {loading ? "Refreshing…" : "Try again"}
              </button>
            </div>
          ) : (
            <OrdersTable
              orders={orders}
              selectedOrders={selectedOrders}
              onOrderSelect={handleOrderSelect}
              splitType={form.splitType}
              customSplits={customSplits}
              onCustomAmountChange={handleCustomAmountChange}
            />
          )}
        </form>

        <FormConfigurator
          open={paymentFormSettingsOpen}
          onClose={()=>setPaymentFormSettingsOpen(false)}
          title="Customize payment form"
          subtitle="Add collection details, labels, choices and rules. Payment amounts, dates and allocation controls remain protected."
          fields={paymentFormConfig.fields}
          saving={paymentFormConfig.saving}
          onSave={paymentFormConfig.save}
          onReset={async()=>{
            const defaults=await paymentFormConfig.reset();
            paymentFormConfig.setFields(defaults);
            setPaymentFormSettingsOpen(false);
          }}
        />
      </div>
    </ErrorBoundary>
  );
}
