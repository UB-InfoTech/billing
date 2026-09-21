import React, { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import * as Yup from 'yup';

// Configuration constants
const API_CONFIG = {
  BASE_URL: 'https://baba.divinesparks.in',
  ENDPOINTS: {
    ORDERS: '/api/order/orders',
    BULK_PAYMENT: '/api/order/orders/payments/bulk'
    // BULK_PAYMENT: '/api/payments/orders/payments/bulk'
  },
  REQUEST_TIMEOUT: 30000
};

const PAYMENT_METHODS = ['Cash', 'Bank', 'UPI', 'Cheque'];
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

const validateCustomSplits = (customSplits, selectedOrders, totalAmount) => {
  const errors = {};
  let totalAllocated = 0;

  selectedOrders.forEach(orderId => {
    const amount = parseDecimal(customSplits[orderId] || 0);
    if (amount < 0) {
      errors[orderId] = 'Amount cannot be negative';
    }
    if (amount > totalAmount) {
      errors[orderId] = 'Amount exceeds total payment';
    }
    totalAllocated += amount;
  });

  totalAllocated = parseDecimal(totalAllocated);
  const difference = Math.abs(parseDecimal(totalAllocated - totalAmount));

  if (difference > 0.01) { // Allow for 1 cent tolerance
    errors._total = `Total allocated (₹${totalAllocated}) must equal payment amount (₹${totalAmount})`;
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

// Sub-components
const PaymentForm = React.memo(({
  form,
  onFormChange,
  totalDue,
  onSubmit,
  submitting,
  onToggleModal,
  showModal,
  validationErrors
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
          max="10000000"
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

    <div className="row d-flex justify-content-between align-items-center">
      <div className="col-md-2">
        <label className="form-label mb-0">Total Due</label>
        <span className="form-control-plaintext fw-bold mt-0 pt-0">
          ₹{totalDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>

      <div className="col-md-2">
        <button
          type="submit"
          className="btn btn-outline-success w-100"
          disabled={submitting}
          onClick={onSubmit}
          aria-label="Submit bulk payment"
        >
          {submitting ? "Processing..." : "Submit Payment"}
        </button>
      </div>


    </div>
  </div>
));

const OrderRow = React.memo(({
  order,
  isSelected,
  onSelect,
  showCustomAmount,
  customAmount,
  onCustomAmountChange
}) => (
  <tr>
    <td>
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onSelect(order._id)}
        aria-label={`Select order ${order.orderNumber}`}
      />
    </td>
    <td>{order.orderNumber}</td>
    <td>{order.challanNumber}</td>
    <td>{order.companyName}</td>
    <td>₹{order.dueAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
    <td>{order.orderDate ? new Date(order.orderDate).toLocaleDateString('en-IN') : 'N/A'}</td>
    {showCustomAmount && (
      <td>
        <input
          type="number"
          className="form-control"
          value={customAmount || ""}
          onChange={(e) => onCustomAmountChange(order._id, e.target.value)}
          disabled={!isSelected}
          min="0"
          step="0.01"
          placeholder="0.00"
          aria-label={`Custom amount for order ${order.orderNumber}`}
        />
      </td>
    )}
  </tr>
));


const OrdersTable = React.memo(({
  orders,
  selectedOrders,
  onOrderSelect,
  splitType,
  customSplits,
  onCustomAmountChange
}) => {
  if (orders.length === 0) {
    return (
      <div className="card p-3 mb-3 shadow-sm text-center">
        <p className="mb-0">No orders available</p>
      </div>
    );
  }

  const [filters, setFilters] = useState({
    billNo: '',
    challanNumber: '',
    clientName: ''
  });
  const [sortKey, setSortKey] = useState('orderNumber'); // default
      const [sortOrder, setSortOrder] = useState('asc'); // default
  

  const filteredOrders = orders.filter(order => {
    return (
      order.orderNumber.includes(filters.billNo) &&
      order.challanNumber.includes(filters.challanNumber) &&
      order.companyName.toLowerCase().includes(filters.clientName.toLowerCase())
    );
  });

  const sortedData = [...filteredOrders].sort((a, b) => {
    let aVal = a[sortKey];
    let bVal = b[sortKey];

    // OrderNumber (natural sort: SS-1, SS-2, ..., SS-100)
    if (sortKey === 'orderNumber') {
      const numA = parseInt(aVal.match(/\d+/)?.[0] ?? 0, 10);
      const numB = parseInt(bVal.match(/\d+/)?.[0] ?? 0, 10);

      if (numA !== numB) {
        return sortOrder === 'asc' ? numA - numB : numB - numA;
      }

      // if numbers are equal, fallback to string compare (handles SS-09 vs SS-9)
      return sortOrder === 'asc'
        ? aVal.localeCompare(bVal, undefined, { sensitivity: 'base' })
        : bVal.localeCompare(aVal, undefined, { sensitivity: 'base' });
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

      <div className="table-responsive" style={{ maxHeight: '500px', overflowY: 'auto' }}>
        <table className="table table-striped table-hover align-middle mb-0">
          <thead className="table-light sticky-top">
            <tr>
              <th scope="col" style={{ width: '50px' }}>
                <span className="visually-hidden">Select</span>
              </th>
              <th scope="col">Bill No.</th>
              <th scope="col">CH No.</th>
              <th scope="col">Client</th>
              <th scope="col">Due Amount</th>
              <th scope="col">Order Date</th>
              {splitType === "custom" && <th scope="col">Custom Amount</th>}
            </tr>
          </thead>
          <tbody>
            {sortedData.map(order => (
              <OrderRow
                key={order._id}
                order={order}
                isSelected={selectedOrders.includes(order._id)}
                onSelect={onOrderSelect}
                showCustomAmount={splitType === "custom"}
                customAmount={customSplits[order._id]}
                onCustomAmountChange={onCustomAmountChange}
              />
            ))}
          </tbody>
        </table>
      </div>
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
  const paymentAmountNum = parseDecimal(paymentAmount || 0);
  const isAmountMismatch = Math.abs(parseDecimal(paymentAmountNum - totalAllocated)) > 0.01;

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

      <div className="table-responsive" style={{ maxHeight: '300px', overflowY: 'auto' }}>
        <table className="table table-bordered mb-3">
          <thead className="table-light sticky-top">
            <tr>
              <th scope="col">Bill No</th>
              <th scope="col">Due Amount</th>
              <th scope="col">Allocated</th>
              <th scope="col">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {allocatedPreview.map((allocation) => {
              const remaining = parseDecimal(allocation.dueAmount - allocation.allocated);
              return (
                <tr key={allocation.orderId}>
                  <td>{allocation.orderNumber}</td>
                  <td>₹{allocation.dueAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td>₹{allocation.allocated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className={remaining < 0 ? 'text-danger' : remaining > 0 ? 'text-warning' : 'text-success'}>
                    ₹{remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});

  const [form, setForm] = useState({
    method: "Cash",
    amountReference: "",
    amount: "",
    splitType: "proportional",
    paymentDate: getTodayDate()
  });

  const [customSplits, setCustomSplits] = useState({});

  // Fetch orders with cleanup
  useEffect(() => {
    const controller = new AbortController();

    const fetchOrders = async () => {
      try {
        setLoading(true);
        const response = await apiClient.get(API_CONFIG.ENDPOINTS.ORDERS, {
          signal: controller.signal
        });
        setOrders(response.data.orders || []);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Failed to fetch orders:', error);
          toast.error('Failed to load orders');
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
  }, []);

  // Memoized calculations for performance with proper decimal handling
  const selectedOrdersData = useMemo(() =>
    orders.filter(o => selectedOrders.includes(o._id)),
    [orders, selectedOrders]
  );

  const totalDue = useMemo(() =>
    parseDecimal(selectedOrdersData.reduce((sum, o) => sum + o.dueAmount, 0)),
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

    setForm(prev => ({ ...prev, [field]: sanitizedValue }));

    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const { [field]: removed, ...rest } = prev;
        return rest;
      });
    }
  }, [validationErrors]);

  const handleCustomAmountChange = useCallback((orderId, value) => {
    const numValue = parseDecimal(value || 0);
    setCustomSplits(prev => ({ ...prev, [orderId]: numValue }));
  }, []);

  const validateForm = async () => {
    try {
      await paymentValidationSchema.validate(form, { abortEarly: false });

      if (form.splitType === 'custom') {
        const { errors, isValid } = validateCustomSplits(
          customSplits,
          selectedOrders,
          parseDecimal(form.amount)
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

    if (selectedOrders.length === 0) {
      toast.error("Please select at least one order");
      return;
    }

    const isValid = await validateForm();
    if (!isValid) {
      toast.error("Please fix validation errors");
      return;
    }

    const controller = new AbortController();

    try {
      setSubmitting(true);

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

      let payload = {
        method: form.method,
        amountReference: form.amountReference,
        amount: parseDecimal(form.amount),
        splitType: form.splitType,
        paymentDate: form.paymentDate,
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
      setForm({
        method: "Cash",
        amountReference: "",
        amount: "",
        splitType: "proportional",
        paymentDate: getTodayDate()
      });
      setSelectedOrders([]);
      setCustomSplits({});
      setValidationErrors({});
      setShowModal(false);

      // Refresh orders
      const response = await apiClient.get(API_CONFIG.ENDPOINTS.ORDERS, {
        signal: controller.signal
      });
      setOrders(response.data.orders || []);

    } catch (error) {
      if (!controller.signal.aborted) {
        toast.error(error.response?.data?.message || "Payment failed ❌");
      }
    } finally {
      if (!controller.signal.aborted) {
        setSubmitting(false);
      }
    }
  }, [form, selectedOrders, customSplits]);

  const toggleModal = useCallback(() => {
    setShowModal(prev => !prev);
  }, []);

  if (loading) {
    return (
      <div className="w-100 mx-3 mt-3 text-center">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading orders...</span>
        </div>
        <p className="mt-2">Loading orders...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="w-100 mx-3 mt-3">
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
            onSubmit={handleSubmit}
            submitting={submitting}
            onToggleModal={toggleModal}
            showModal={showModal}
            validationErrors={validationErrors}
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

          <OrdersTable
            orders={orders}
            selectedOrders={selectedOrders}
            onOrderSelect={handleOrderSelect}
            splitType={form.splitType}
            customSplits={customSplits}
            onCustomAmountChange={handleCustomAmountChange}
          />
        </form>
      </div>
    </ErrorBoundary>
  );
}
