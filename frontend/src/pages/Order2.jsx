import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import axios from "axios";
import editSVG from '../assets/edit.svg';
import deleteSVG from '../assets/delete.svg';
import infoSVG from '../assets/info.svg';
import paymentsSVG from '../assets/payments.svg';
import invoiceSVG from '../assets/invoice.svg';
import receiptSVG from '../assets/receipt.svg';
import 'bootstrap/dist/css/bootstrap.min.css'; // Ensure Bootstrap CSS is imported
import EWayBillForm from "../components/EWayBillForm";
import * as XLSX from 'xlsx';
import Report from '../components/Report';
import { useReactToPrint } from "react-to-print";
import { Link } from 'react-router-dom';

function Order2() {
    const linkone = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
    
    const [orders, setOrders] = useState([]);
    const [clients, setClients] = useState([]);
    const [clientsData, setClientsData] = useState([]);
    const [products, setProducts] = useState([]);
    const [profile, setProfile] = useState({
        headerTitle: '',
        companyName: '',
        companyAddress: '',
        phoneNumber1: '',
        phoneNumber2: '',
        gstin: '',
        pan: '',
        bankName: '',
        accountNo: '',
        branchName: '',
        ifsc: '',
        pinCode: '',
        stateCode: '',
        billNoPrefix: '',
        billNoSequence: 1,
        billNoSuffix: '',
        eWayUserName: '',
        eWayPassword: ''
    });
   
    const [showModal, setShowModal] = useState(false);
    const [statusModal, setStatusModal] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showEwayBillModal, setShowEwayBillModal] = useState(false);
    const [orderId, setOrderId] = useState(null);
    const [editingOrder, setEditingOrder] = useState(null);


    const [payments, setPayments] = useState([]);
    const [editPayment, setEditPayment] = useState(null);
    const [newPayment, setNewPayment] = useState({ amount: "", method: "Cash", amountReference: "", paymentDate: new Date().toISOString().slice(0, 10) });
    const authConfig = () => ({ headers: { "x-auth-token": localStorage.getItem("token") || "" } });

    // const date = new DateObject()
    // const [editIndex, setEditIndex] = useState(null);

    const [subOrders, setSubOrders] = useState([
        { designNumber: "", orderName: "", hsnCode: 0, qtyUnit: "", quantity: 0, cut: 0, MTR: 0, unitPrice: 0, shortPcs: 0 }
    ]);



    // ----------------
    // State declarations
    const [search, setSearch] = useState('');

    const [loading, setLoading] = useState(false);
    const [orderSubmitting, setOrderSubmitting] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(10);
    // const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'asc' });
    // const [sortKey, setSortKey] = useState('orderDate'); // default
    // const [sortKey, setSortKey] = useState('orderNumber'); // default
    const [sortKey, setSortKey] = useState('orderDate'); // default
    const [sortOrder, setSortOrder] = useState('asc'); // default


    const [filters, setFilters] = useState({
        status: '',
        paymentStatus: '',
        dateRange: [],
        minTotal: '',
        maxTotal: '',
        // startDate: '01/04/2026',
        startDate: '',
        endDate: '',
    });

    //     fabricType: "Cotton",
    //     priority: "Medium",
    //     rawMaterialCost: 0,
    //     labourCost: 0,
    //     machineUsageCost: 0,
    const [formData, setFormData] = useState({
        orderDate: new Date(),
        orderNumber: "",
        lrNo: "",
        challanNumber: "",
        Address: "",
        State: "",
        City: "",
        pinCode: "",
        stateCode: "",
        clientId: "",
        gstNumber: "",
        companyName: "",
        subOrders: subOrders,

        status: "Pending",
        paymentTerms: "30",

        taxPercentage: 5,
        discountRate: 0,
    });


    useEffect(() => {
        fetchOrders();
        fetchClients();
        fetchProducts();
        fetchProfile();
        // fetchSuppliers();
        // fetchMachines();

    }, []);

    const token = localStorage.getItem('token');
    if (!token) {
        throw new Error('No token found');
    }

    const fetchOrders = async () => {
        try {
            const response = await axios.get(`${linkone}` + "/api/order/orders", {
                headers: {
                    'x-auth-token': token
                }
            });
            setOrders(response.data.orders);
        } catch (error) {
            if (error.response && error.response.data && error.response.data.msg === "Token is not valid") {
                localStorage.removeItem('token');
                window.location.reload();
            }
            alert("❌ Error fetching orders: " + error.response.data.message);
        }
    };


    // const fetchOrdersLength = orders.length + 1;
    // OrderBillNo = profile.billNoPrefix + billNoSequence + billNoSuffix


    const fetchProfile = async () => {
        try {
            const response = await axios.get(`${linkone}/api/profile`, {
                headers: {
                    'x-auth-token': token
                },
            });
            setProfile(response.data);

        } catch (error) {
            console.error("Error fetching profile", error);
        }
    };
    useEffect(() => {

        fetchProfile();

    }, []);
    // const OrderBillNo = profile.billNoPrefix + profile.billNoSequence + profile.billNoSuffix;
    const OrderBillNo = (profile.billNoPrefix || '') + profile.billNoSequence + (profile.billNoSuffix || '');

    const incrementBillNoSequence = async () => {
        try {
            // await axios.put(`${linkone}/api/profile/updateBillNoSequence`, {
            await axios.patch(`${linkone}/api/profile/billNoSequence`, {
                billNoSequence: profile.billNoSequence + 1
            }, {
                headers: {
                    'x-auth-token': token
                }
            });
            setProfile(prev => ({
                ...prev,
                billNoSequence: prev.billNoSequence + 1
            }));
        } catch (error) {
            console.error("Error updating billNoSequence", error);
        }
    };
    const fetchClients = async () => {
        const response = await axios.get(`${linkone}/api/clients`, {
            headers: {
                'x-auth-token': token
            }
        });
        setClients(response.data);
    };

    const fetchProducts = async () => {
        const response = await axios.get(`${linkone}/api/products`, authConfig());
        setProducts(response.data.products);
    };

    const handleSubOrderChange = (index, e) => {
        const { name, value } = e.target;
        const numericFields = new Set(["hsnCode", "quantity", "cut", "unitPrice", "shortPcs"]);
        const nextValue = numericFields.has(name)
            ? (value === "" ? "" : Math.max(0, Number(value)))
            : value;

        setSubOrders(prev => {
            const updatedOrders = prev.map((row, rowIndex) => {
                if (rowIndex !== index) return row;

                const updated = { ...row, [name]: nextValue };

                if (name === "orderName") {
                    const selectedProduct = products.find(
                        product => product.productName === value
                    );
                    if (selectedProduct) {
                        updated.productId = selectedProduct._id || null;
                        updated.unitPrice = Number(selectedProduct.rate || 0);
                        updated.designNumber = selectedProduct.designNo || "";
                        updated.hsnCode = Number(selectedProduct.hsnCode || 0);
                    }
                }

                if (name === "quantity" || name === "cut") {
                    const qty = Number(updated.quantity || 0);
                    const cut = Number(updated.cut || 0);
                    updated.MTR = Math.round((qty * cut + Number.EPSILON) * 100) / 100;
                }

                return updated;
            });

            setFormData(prevForm => ({
                ...prevForm,
                subOrders: updatedOrders,
            }));

            return updatedOrders;
        });
    };


    // const addSubOrderRow = () => {
    //     setSubOrders([
    //         ...subOrders,
    //         { designNumber: "", orderName: "", hsnCode: 0, qtyUnit: "", quantity: 0, cut: 0, MTR: 0, unitPrice: 0, shortPcs: 0 }
    //     ]);
    // };

    const addSubOrderRow = useCallback(() => {
        const newRow = {
            designNumber: "",
            orderName: "",
            productId: null,
            hsnCode: 0,
            qtyUnit: "PCS",
            quantity: 0,
            cut: 0,
            MTR: 0,
            unitPrice: 0,
            shortPcs: 0
        };

        setSubOrders(prev => {
            const updated = [...prev, newRow];
            setFormData(prevForm => ({ ...prevForm, subOrders: updated }));
            return updated;
        });
    }, []);

    const deleteSubOrder = (index) => {
        setSubOrders(prev => {
            const updated = prev.filter((_, rowIndex) => rowIndex !== index);
            setFormData(prevForm => ({ ...prevForm, subOrders: updated }));
            return updated;
        });
    };

    // Bind '+' key only when modal is open
    useEffect(() => {
        const handleKeyPress = (e) => {
            if (showModal && (e.key === '+' || e.key === '=')) {
                e.preventDefault();
                addSubOrderRow();
            }
        };

        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [showModal, addSubOrderRow]);

    const modalRef = useRef(null); // For trapping focus
    // Focus trap inside modal
    useEffect(() => {
        if (!showModal || !modalRef.current) return;

        const focusable = modalRef.current.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        const trapFocus = (e) => {
            if (e.key !== 'Tab') return;

            if (e.shiftKey) {
                // Shift + Tab
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                // Tab
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };

        document.addEventListener('keydown', trapFocus);
        first?.focus();

        return () => document.removeEventListener('keydown', trapFocus);
    }, [showModal]);



    const handleInputChange = (e) => {
        const { name, value } = e.target;


        // if(subOrders.map((subOrder) => subOrder.orderName).includes(value)) {
        //     console.log("if enter subOrders");
        //     const selectedProduct = products.find(product => product.productName === value);
        //     console.log(selectedProduct ," selected product if enter subOrders")
        //     const updatedSubOrders = subOrders.map((subOrder, index) => {
        //         if (subOrder.orderName === value) {
        //             console.log("if if enter subOrders")
        //             return {
        //                 ...subOrder,
        //                 unitPrice: selectedProduct ? selectedProduct.rate : subOrder.unitPrice,
        //             };
        //         }
        //         return subOrder;
        //     });
        //     setSubOrders(updatedSubOrders);
        //     setFormData({
        //         ...formData,
        //         subOrders: updatedSubOrders,
        //     });
        // } 
        // else {
        //     console.log("else enter subOrders")
        //     const selectedProduct = products.find(product => product.productName === value);
        //     console.log(selectedProduct ," selected product else enter subOrders")
        //     const updatedSubOrders = subOrders.map((subOrder, index) => {
        //         if (subOrder.orderName === value) {
        //             console.log("else if enter subOrders")
        //             return {
        //                 ...subOrder,
        //                 unitPrice: selectedProduct ? selectedProduct.rate : subOrder.unitPrice,
        //             };
        //         }
        //         return subOrder;
        //     });
        //     setSubOrders(updatedSubOrders);
        //     setFormData({
        //         ...formData,
        //         subOrders: updatedSubOrders,
        //     });
        // }

        // if (name === "orderName") {
        //     console.log("if enter");
        //     const updatedSubOrders = subOrders.map((subOrder, index) => {
        //         if (subOrder.orderName === value) {
        //         console.log("if if enter")
        //         const selectedProduct = products.find(product => product.productName === value);
        //         console.log(selectedProduct ," selected product if if enter")
        //         return {
        //             ...subOrder,
        //             unitPrice: selectedProduct ? selectedProduct.rate : subOrder.unitPrice,
        //         };
        //     }
        //     return subOrder;
        //     });
        //     setSubOrders(updatedSubOrders);
        //     setFormData({
        //     ...formData,
        //     subOrders: updatedSubOrders,
        //     });
        // }


        // if (name === "orderName") {
        //     console.log(name, value, "name value orderName");
        //     const selectedProduct = products.find(product => product.productName === value);
        //     if (selectedProduct) {
        //     const updatedSubOrders = subOrders.map((subOrder, index) => ({
        //         ...subOrder,
        //         unitPrice: selectedProduct.rate || "",
        //         orderName: value,
        //     }));
        //     // const updatedSubOrders = subOrders.map((subOrder, index) => {  
        //         // if (index === editIndex) {
        //         // return { ...subOrder, unitPrice: selectedProduct.rate || "" };
        //         // }
        //         // return subOrder;
        //     // });
        //     setSubOrders(updatedSubOrders);
        //     console.log(updatedSubOrders, "updatedSubOrders");
        //     setFormData({
        //         ...formData,
        //         orderName: value,
        //         subOrders: updatedSubOrders,
        //     });
        //     }
        // }

        if (name === "companyName") {
            const selectedClient = clients.find(client => client.companyName === value);
            if (selectedClient) {
                setFormData({
                    ...formData,
                    companyName: value,
                    clientId: selectedClient._id || "",
                    Address: selectedClient.address || "",
                    State: selectedClient.state || "",
                    City: selectedClient.city || "",
                    pinCode: selectedClient.pinCode || "",
                    stateCode: selectedClient.stateCode || "",
                    gstNumber: selectedClient.gstNumber || "",
                    paymentTerms: selectedClient.paymentTerms || "30",
                    discountRate: selectedClient.discountRate || "0"
                });
            }
        }
        else {
            setFormData({
                ...formData,
                // subOrders: subOrders,
                [name]: value,
            });
        }



        // else {
        //     setFormData({
        //         ...formData,
        //         [name]: value,
        //     });
        // }

        // if (name === "orderName") {
        //     // const selectedProduct = products.find(product => product._id === value);
        //     const selectedProduct = products.find(product => product.productName === value);
        //     console.log(selectedProduct, "selectedProduct");

        //     if (selectedProduct) {
        //         setFormData({
        //             ...formData,
        //             orderName: value,
        //             unitPrice: selectedProduct.rate || "",
        //             // quantity: selectedProduct.quantity || "",
        //             // shortPcs: selectedClient.shortPcs || "",
        //         });
        //     }
        // }
        // else {
        //   setFormData({
        //     ...formData,
        //     [name]: value,
        //   });
        // }
    };

    const orderTotals = useMemo(() => {
        const round = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
        const discountRate = Math.min(100, Math.max(0, Number(formData.discountRate ?? 0)));
        const taxRate = Math.min(100, Math.max(0, Number(formData.taxPercentage ?? 0)));

        const lines = subOrders.map(item => {
            const unit = item.qtyUnit || "PCS";
            const quantity = Math.max(0, Number(item.quantity || 0));
            const mtr = Math.max(0, Number(item.MTR || 0));
            const shortPcs = Math.max(0, Number(item.shortPcs || 0));
            const unitPrice = Math.max(0, Number(item.unitPrice || 0));
            const billableQty = unit === "MTR"
                ? Math.max(0, mtr - shortPcs)
                : Math.max(0, quantity - shortPcs);

            return {
                billableQty,
                amount: round(billableQty * unitPrice),
                unit,
            };
        });

        const subtotal = round(lines.reduce((sum, line) => sum + line.amount, 0));
        const discount = round(subtotal * discountRate / 100);
        const taxable = round(subtotal - discount);
        const tax = round(taxable * taxRate / 100);
        const finalRevenue = round(taxable + tax);
        const grandTotal = Math.round(finalRevenue);
        const roundOff = round(grandTotal - finalRevenue);

        const paid = round(
            Array.isArray(formData.payments)
                ? formData.payments.reduce((sum, payment) => sum + Math.max(0, Number(payment.amount || 0)), 0)
                : Number(formData.paidAmount ?? editingOrder?.paidAmount ?? 0)
        );
        const creditApplied = Math.min(
            grandTotal,
            Math.max(0, round(Number(formData.creditAppliedAmount || editingOrder?.creditAppliedAmount || 0)))
        );
        const due = Math.max(0, round(grandTotal - paid - creditApplied));

        return {
            lines,
            subtotal,
            discount,
            discountRate,
            taxable,
            tax,
            taxRate,
            finalRevenue,
            grandTotal,
            roundOff,
            paid,
            creditApplied,
            due,
        };
    }, [
        subOrders,
        formData.discountRate,
        formData.taxPercentage,
        formData.payments,
        formData.paidAmount,
        formData.creditAppliedAmount,
        editingOrder?.paidAmount,
        editingOrder?.creditAppliedAmount,
    ]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        const cleanItems = subOrders.map(item => ({
            ...item,
            quantity: Math.max(0, Number(item.quantity || 0)),
            cut: Math.max(0, Number(item.cut || 0)),
            MTR: Math.max(0, Number(item.MTR || 0)),
            unitPrice: Math.max(0, Number(item.unitPrice || 0)),
            shortPcs: Math.max(0, Number(item.shortPcs || 0)),
            hsnCode: item.hsnCode === "" ? 0 : Number(item.hsnCode || 0),
        }));

        if (!String(formData.orderNumber || "").trim()) {
            alert("❌ Invoice number is required.");
            return;
        }
        if (!String(formData.companyName || "").trim()) {
            alert("❌ Please select or enter a client.");
            return;
        }
        if (!cleanItems.length || cleanItems.every(item => !String(item.orderName || "").trim())) {
            alert("❌ Add at least one bill item.");
            return;
        }
        if (cleanItems.some(item => item.unitPrice < 0 || item.quantity < 0 || item.cut < 0 || item.MTR < 0 || item.shortPcs < 0)) {
            alert("❌ Item values cannot be negative.");
            return;
        }

        const payload = {
            ...formData,
            orderNumber: String(formData.orderNumber || "").trim(),
            companyName: String(formData.companyName || "").trim(),
            taxPercentage: Math.min(100, Math.max(0, Number(formData.taxPercentage ?? 0))),
            discountRate: Math.min(100, Math.max(0, Number(formData.discountRate ?? 0))),
            subOrders: cleanItems,
        };

        try {
            setOrderSubmitting(true);

            if (editingOrder) {
                await axios.put(
                    `${linkone}/api/order/orders/${editingOrder._id}/update`,
                    payload,
                    authConfig()
                );
                alert("✅ Order updated successfully.");
            } else {
                await axios.post(
                    `${linkone}/api/order/orders/create`,
                    payload,
                    authConfig()
                );
                await incrementBillNoSequence();
                alert("✅ Order created successfully.");
            }

            setShowModal(false);
            setEditingOrder(null);
            setSubOrders([]);
            const newSubOrders = [{
                        designNumber: "",
                        orderName: "",
                        productId: null,
                        hsnCode: 0,
                        qtyUnit: "PCS",
                        quantity: 0,
                        cut: 0,
                        MTR: 0,
                        unitPrice: 0,
                        shortPcs: 0,
                    }];
                    setSubOrders(newSubOrders);
                    setFormData({
                        orderDate: new Date(),
                        orderNumber: OrderBillNo,
                        lrNo: "",
                        challanNumber: "",
                        Address: "",
                        State: "",
                        City: "",
                        pinCode: "",
                        stateCode: "",
                        clientId: "",
                        gstNumber: "",
                        companyName: "",
                        subOrders: newSubOrders,
                        status: "Pending",
                        paymentTerms: "30",
                        taxPercentage: 5,
                        discountRate: 0,
                        note: "",
                    });
                }}>Add New Bill</button>

                <button className="btn btn-success">
                    <Link to="/bulk-payment" className="text-light">Multi Payment</Link>
                </button>
            </div>

            <div className="py-2">

                <div className="card p-3">
                    {/* Filters and Search */}
                    <div className="row mb-3 g-3">
                        <div className="col-md-2">
                            <input
                                type="text"
                                className="form-control"
                                placeholder="Search by Bill_No. / Client"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <div className="col-md-2 mob-w-50">
                            <select
                                className="form-select"
                                value={filters.status}
                                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                            >
                                <option value="">All Statuses</option>
                                <option value="Pending">Pending</option>
                                <option value="In Process">In Process</option>
                                <option value="Cancelled">Cancelled</option>
                                <option value="Completed">Completed</option>
                                <option value="Dispatched">Dispatched</option>
                            </select>
                        </div>
                        <div className="col-md-2 mob-w-50">
                            <select
                                className="form-select"
                                value={filters.paymentStatus}
                                onChange={(e) => setFilters({ ...filters, paymentStatus: e.target.value })}
                            >
                                <option value="">Payment Statuses</option>
                                <option value="Unpaid">Unpaid</option>
                                <option value="Partial">Partial</option>
                                <option value="Paid">Paid</option>
                            </select>
                        </div>
                        <div className="col-md-2 mob-w-50">
                            <input
                                type="date"
                                className="form-control"
                                placeholder="Start Date"
                                value={filters.startDate || ''}
                                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                            />
                        </div>
                        <div className="col-md-2 mob-w-50">
                            <input
                                type="date"
                                className="form-control"
                                placeholder="End Date"
                                value={filters.endDate || ''}
                                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                            />
                        </div>
                        {/* <div className="col-md-2">
                            <input
                                type="number"
                                className="form-control"
                                placeholder="Min Total"
                                value={filters.minTotal}
                                onChange={(e) => setFilters({ ...filters, minTotal: e.target.value })}
                            />
                        </div>
                        <div className="col-md-2">
                            <input
                                type="number"
                                className="form-control"
                                placeholder="Max Total"
                                value={filters.maxTotal}
                                onChange={(e) => setFilters({ ...filters, maxTotal: e.target.value })}
                            />
                        </div> */}
                        <div className="col-md-1 mob-w-50">
                            <button className="btn btn-success w-100" onClick={handleExportExcel}>
                                Excel
                            </button>
                        </div>
                        <div className="col-md-1 mob-w-50">
                            <button className="btn btn-primary w-100" onClick={reactToPrintFn}>
                                Report
                            </button>
                            <div ref={contentRef} className="d-print-block d-none">
                                <div style={styles.pageReport} >
                                    <Report ref={reportRef} data={sortedData} />
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Table */}
                    <div className="table-responsive">
                        <table className="table table-striped table-bordered table-hover">
                            <thead className="lh-sm">
                                <tr>
                                    <th>#</th>
                                    {/* <th>Date</th>
                                    {['Bill No', 'client', 'status', 'payment Status', 'qty', 'cut',
                                        'unit Price', 'total Cost', 'paid Amount', 'due Amount'].map(key => (
                                            <th key={key} onClick={() => handleSort(key === 'clientName' ? 'clientId' : key)} style={{ cursor: 'pointer' }}>
                                                {key === 'clientName' ? 'Client' : key.charAt(0).toUpperCase() + key.slice(1)}
                                                {getSortIcon(key === 'clientName' ? 'clientId' : key)}
                                            </th>
                                        ))}
                                     */}

                                    {/* <th onClick={() => handleSort('orderDate')} style={{ cursor: 'pointer' }}>
                                        Date {sortKey === 'orderDate' && (sortOrder === 'asc' ? '▲' : '▼')}
                                    </th> */}
                                    {[
                                        ['orderDate', 'Date'],
                                        ['orderNumber', 'Bill No'],
                                        ['challanNumber', 'challan No'],
                                        ['companyName', 'Client'],
                                        ['status', 'Status'],
                                        ['paymentStatus', 'Payment Status'],
                                        ['quantity', 'Qty'],
                                        ['cut', 'Cut'],
                                        ['unitPrice', 'Unit Price'],
                                        ['totalCost', 'Total Cost'],
                                        ['paidAmount', 'Paid Amount'],
                                        ['dueAmount', 'Due Amount'],
                                    ].map(([key, label]) => (
                                        <th key={key} onClick={() => handleSort(key)} style={{ cursor: 'pointer' }}>
                                            {label} {sortKey === key && (sortOrder === 'asc' ? '↑' : '↓')}
                                        </th>
                                    ))}
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* {currentOrders.map((order, index) => ( */}
                                {sortedData.map((order, index) => (
                                    <tr key={order._id}>
                                        <td>{index + 1}</td>
                                        {/* <td>{(order.createdAt)}</td> */}
                                        <td>{new Date(order.orderDate).toLocaleDateString("en-IN", {
                                            year: "numeric",
                                            month: "2-digit",
                                            day: "2-digit",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                            second: "2-digit",
                                        })}</td>
                                        <td>{order.orderNumber}</td>
                                        <td>{order.challanNumber}</td>
                                        {/* <td>{clients.find(client => client._id === order.clientId)?.name}</td> */}
                                        <td>{clients.find(client => client._id === order.clientId)?.companyName}</td>

                                        <td>
                                            <select
                                                className="form-select w-auto"
                                                value={order.status}
                                                onChange={(e) => handleStatusChange(order._id, e.target.value)}
                                            >
                                                <option value="Pending">Pending</option>
                                                <option value="In Process">In Process</option>
                                                <option value="Cancelled">Cancelled</option>
                                                <option value="Completed">Completed</option>
                                                <option value="Dispatched">Dispatched</option>
                                            </select>
                                        </td>
                                        <td>
                                            <span className={`badge ${order.paymentStatus === 'Paid' ? 'bg-success' :
                                                order.paymentStatus === 'Partial' ? 'bg-warning' : 'bg-danger'}`}>
                                                {order.paymentStatus}
                                            </span>
                                        </td>

                                        {/* <td>{order.subOrders.reduce((acc, subOrder) => acc + parseInt(subOrder.quantity), 0).toFixed(2) || 0}</td> */}
                                        {/* <td>{(order.subOrders.reduce((acc, subOrder) => acc + parseFloat(subOrder.cut), 0).toFixed(2)) || 0}</td> */}
                                        {/* <td>{(order.subOrders.reduce((acc, subOrder) => acc + parseInt(subOrder.unitPrice), 0) / order.subOrders.length).toFixed(2) || 0}</td> */}
                                        <td>{order.subOrders.reduce((acc, subOrder) => acc + (Number(subOrder.quantity) || 0), 0).toFixed(2)}</td>
                                        <td>{order.subOrders.reduce((acc, subOrder) => acc + (parseFloat(subOrder.cut) || 0), 0).toFixed(2)}</td>
                                        <td>{order.subOrders.length > 0 ? (order.subOrders.reduce((acc, subOrder) => acc + (parseFloat(subOrder.unitPrice) || 0), 0) / order.subOrders.length).toFixed(2) : "0.00"}</td>
                                        {/* <td>{order.totalCost}</td> */}
                                        <td>{order.roundOffFinalRevenue}</td>
                                        <td>{order.paidAmount}</td>
                                        <td>{order.dueAmount}</td>

                                        <td className="d-flex gap-1 h-auto">
                                            <button className="btn btn-warning" onClick={() => handleEdit(order)}>
                                                <img src={editSVG} alt="Edit" />
                                            </button>
                                            <button className="btn btn-info" onClick={() => handleStatus(order)}>
                                                <img src={infoSVG} alt="Info" />
                                            </button>
                                            <button className="btn btn-success" onClick={() => handlePaymentEdit(order)} >
                                                <img src={paymentsSVG} alt="Payment" />
                                            </button>
                                            <button className="btn btn-danger" onClick={() => handleDeleteOrder(order._id)}>
                                                <img src={deleteSVG} alt="Delete" />
                                            </button>
                                            <button className="btn btn-primary" onClick={() => printInvoice(order)}>
                                                <img src={invoiceSVG} alt="Invoice" />
                                                {/* <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f"><path d="M120-80v-800l60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60v800l-60-60-60 60-60-60-60 60-60-60-60 60-60-60-60 60-60-60-60 60-60-60-60 60Zm120-200h480v-80H240v80Zm0-160h480v-80H240v80Zm0-160h480v-80H240v80Zm-40 404h560v-568H200v568Zm0-568v568-568Z" /></svg> */}
                                            </button>
                                            {/* Eway bill form */}
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => {
                                                    setShowEwayBillModal(true);
                                                    setOrderId(order._id);
                                                }}
                                                {...order.ewbDetails.ewbNo ? { disabled: true } : {}}
                                            >
                                                {/* <button className="btn btn-secondary" onClick={() => EWayBillForm(order._id)}> */}
                                                {/* <img src={ewaybillSVG} alt="Eway Bill" /> */}
                                                <p className="p-0 m-0">Eway</p>
                                            </button>

                                            {/* <button className="btn btn-secondary" onClick={() => printKachuBill(order._id)}>
                                                <img src={invoiceSVG} alt="Invoice" />
                                            </button> */}
                                            {/* <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f"><path d="M120-80v-800l60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60v800l-60-60-60 60-60-60-60 60-60-60-60 60-60-60-60 60-60-60-60 60-60-60-60 60Zm120-200h480v-80H240v80Zm0-160h480v-80H240v80Zm0-160h480v-80H240v80Zm-40 404h560v-568H200v568Zm0-568v568-568Z" /></svg> */}
                                        </td>
                                    </tr>
                                ))}
                                <tr>
                                    <td colSpan="3" className="text-end fw-bold">Total:</td>
                                    <td colSpan={7}></td>
                                    <td colSpan="1" className="fw-bold">₹{sortedData.reduce((sum, order) => sum + parseFloat(order.roundOffFinalRevenue), 0).toFixed(2)}</td>
                                    <td colSpan="1" className="fw-bold">₹{sortedData.reduce((sum, order) => sum + parseFloat(order.paidAmount), 0).toFixed(2)}</td>
                                    <td colSpan="1" className="fw-bold">₹{sortedData.reduce((sum, order) => sum + parseFloat(order.dueAmount), 0).toFixed(2)}</td>
                                    <td colSpan={1}></td>
                                    {/* <td colSpan="3" className="text-end fw-bold">Total: ₹{filteredOrders.reduce((sum, order) => sum + parseFloat(order.totalCost), 0)}</td> */}

                                    {/* <td colSpan="3" className="text-end fw-bold">
                                                    Total Paid: ₹{payments.reduce((sum, p) => sum + Number(p.amount || 0), 0).toFixed(2)}
                                                    <div className="small text-danger fw-normal">Current Due: ₹{Number(editingOrder?.dueAmount || 0).toFixed(2)}</div>
                                                </td> */}
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {/* <nav aria-label="Page navigation">
                        <ul className="pagination justify-content-center mt-3">
                            <li className="page-item">
                                <button
                                    className="page-link"
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                >
                                    Previous
                                </button>
                            </li>
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                <li key={page} className={`page-item ${currentPage === page ? 'active' : ''}`}>
                                    <button className="page-link" onClick={() => setCurrentPage(page)}>
                                        {page}
                                    </button>
                                </li>
                            ))}
                            <li className="page-item">
                                <button
                                    className="page-link"
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                >
                                    Next
                                </button>
                            </li>
                        </ul>
                    </nav> */}
                </div>
            </div>


            {showModal && (
                <div className="modal show d-block" tabIndex="-1" role="dialog" aria-modal="true" style={{ backgroundColor: "rgba(15, 23, 42, 0.58)" }}>
                    <div className="modal-dialog modal-dialog-centered modal-xl modal-dialog-scrollable">
                        <div className="modal-content border-0 shadow-lg" ref={modalRef} style={{ borderRadius: "18px", overflow: "hidden" }}>
                            <div className="modal-header border-0 px-4 py-3" style={{ background: "linear-gradient(135deg, #0f172a, #1e3a8a)", color: "#fff" }}>
                                <div className="d-flex flex-wrap align-items-center justify-content-between w-100 gap-3">
                                    <div>
                                        <div className="small text-uppercase opacity-75 fw-semibold">
                                            {editingOrder ? "Sales Invoice • Edit" : "Sales Invoice • New"}
                                        </div>
                                        <h4 className="modal-title fw-bold mb-1">
                                            {editingOrder ? "Edit Invoice " + (formData.orderNumber || "") : "Create Sales Invoice"}
                                        </h4>
                                        <div className="small opacity-75">
                                            Enter items and the invoice totals, tax, round-off and due balance update automatically.
                                        </div>
                                    </div>
                                    <div className="d-flex align-items-center gap-2">
                                        <span className="badge rounded-pill bg-light text-dark px-3 py-2">
                                            {subOrders.length} item{subOrders.length === 1 ? "" : "s"}
                                        </span>
                                        <button type="button" className="btn btn-light btn-sm" onClick={() => setShowModal(false)} aria-label="Close order form">
                                            <i className="bi bi-x-lg"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="modal-body p-3 p-lg-4" style={{ background: "#f1f5f9" }}>
                                <form onSubmit={handleSubmit}>
                                    <div className="row g-3">
                                        <div className="col-12 col-xl-7">
                                            <div className="card border-0 shadow-sm h-100" style={{ borderRadius: "14px" }}>
                                                <div className="card-header bg-white border-0 px-4 py-3">
                                                    <div className="fw-bold text-dark"><i className="bi bi-receipt me-2 text-primary"></i>Invoice Details</div>
                                                    <div className="small text-muted">Customer, invoice and delivery references</div>
                                                </div>
                                                <div className="card-body px-4 pb-4">
                                                    <div className="row g-3">
                                                        <div className="col-md-4">
                                                            <label className="form-label small fw-semibold text-secondary">Invoice No.</label>
                                                            <input className="form-control" name="orderNumber" value={formData.orderNumber || ""} onChange={handleInputChange} placeholder="e.g. INV-00001" required />
                                                        </div>
                                                        <div className="col-md-4">
                                                            <label className="form-label small fw-semibold text-secondary">Bill Date</label>
                                                            <input type="date" className="form-control" name="orderDate" value={formData.orderDate ? new Date(formData.orderDate).toISOString().split("T")[0] : ""} onChange={handleInputChange} required />
                                                        </div>
                                                        <div className="col-md-4">
                                                            <label className="form-label small fw-semibold text-secondary">LR No.</label>
                                                            <input className="form-control" name="lrNo" value={formData.lrNo || ""} onChange={handleInputChange} placeholder="Optional" />
                                                        </div>

                                                        <div className="col-md-7">
                                                            <label className="form-label small fw-semibold text-secondary">Client / Company</label>
                                                            <div className="input-group">
                                                                <span className="input-group-text bg-white"><i className="bi bi-building"></i></span>
                                                                <input className="form-control" name="companyName" value={formData.companyName || ""} onChange={handleInputChange} placeholder="Select or type client" list="clientNameOptions" required />
                                                            </div>
                                                            <datalist id="clientNameOptions">
                                                                {clients.map(client => <option key={client._id} value={client.companyName || client.name || ""} />)}
                                                            </datalist>
                                                        </div>
                                                        <div className="col-md-5">
                                                            <label className="form-label small fw-semibold text-secondary">GSTIN</label>
                                                            <input className="form-control" name="gstNumber" value={formData.gstNumber || ""} onChange={handleInputChange} placeholder="Customer GSTIN" maxLength={15} />
                                                        </div>

                                                        <div className="col-md-7">
                                                            <label className="form-label small fw-semibold text-secondary">Billing Address</label>
                                                            <textarea className="form-control" name="Address" value={formData.Address || ""} onChange={handleInputChange} rows="2" placeholder="Address" required></textarea>
                                                        </div>
                                                        <div className="col-md-5">
                                                            <div className="row g-2">
                                                                <div className="col-12">
                                                                    <label className="form-label small fw-semibold text-secondary">City</label>
                                                                    <input className="form-control" name="City" value={formData.City || ""} onChange={handleInputChange} required />
                                                                </div>
                                                                <div className="col-7">
                                                                    <label className="form-label small fw-semibold text-secondary">State</label>
                                                                    <input className="form-control" name="State" value={formData.State || ""} onChange={handleInputChange} required />
                                                                </div>
                                                                <div className="col-5">
                                                                    <label className="form-label small fw-semibold text-secondary">PIN</label>
                                                                    <input className="form-control" name="pinCode" value={formData.pinCode || ""} onChange={handleInputChange} inputMode="numeric" />
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="col-md-4">
                                                            <label className="form-label small fw-semibold text-secondary">Challan No.</label>
                                                            <input className="form-control" name="challanNumber" value={formData.challanNumber || ""} onChange={handleInputChange} placeholder="Enter challan no." />
                                                        </div>
                                                        <div className="col-md-4">
                                                            <label className="form-label small fw-semibold text-secondary">Payment Terms</label>
                                                            <select className="form-select" name="paymentTerms" value={formData.paymentTerms || "30"} onChange={handleInputChange} required>
                                                                <option value="30">30 Days</option>
                                                                <option value="60">60 Days</option>
                                                                <option value="90">90 Days</option>
                                                                <option value="Advance">Advance</option>
                                                            </select>
                                                        </div>
                                                        <div className="col-md-4">
                                                            <label className="form-label small fw-semibold text-secondary">Status</label>
                                                            <select className="form-select" name="status" value={formData.status || "Pending"} onChange={handleInputChange}>
                                                                <option value="Pending">Pending</option>
                                                                <option value="In Process">In Process</option>
                                                                <option value="Completed">Completed</option>
                                                                <option value="Dispatched">Dispatched</option>
                                                                <option value="Cancelled">Cancelled</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="col-12 col-xl-5">
                                            <div className="card border-0 shadow-sm h-100" style={{ borderRadius: "14px" }}>
                                                <div className="card-header bg-white border-0 px-4 py-3">
                                                    <div className="fw-bold text-dark"><i className="bi bi-calculator me-2 text-primary"></i>Pricing & Tax</div>
                                                    <div className="small text-muted">Live totals from the items below</div>
                                                </div>
                                                <div className="card-body px-4">
                                                    <div className="row g-3">
                                                        <div className="col-6">
                                                            <label className="form-label small fw-semibold text-secondary">Tax %</label>
                                                            <div className="input-group">
                                                                <input type="number" min="0" max="100" step="0.01" className="form-control" name="taxPercentage" value={formData.taxPercentage ?? 0} onChange={handleInputChange} />
                                                                <span className="input-group-text">%</span>
                                                            </div>
                                                        </div>
                                                        <div className="col-6">
                                                            <label className="form-label small fw-semibold text-secondary">Discount %</label>
                                                            <div className="input-group">
                                                                <input type="number" min="0" max="100" step="0.01" className="form-control" name="discountRate" value={formData.discountRate ?? 0} onChange={handleInputChange} />
                                                                <span className="input-group-text">%</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="mt-4 p-3 rounded-3" style={{ background: "#eff6ff" }}>
                                                        <div className="d-flex justify-content-between small mb-2"><span className="text-muted">Item Subtotal</span><strong>₹{orderTotals.subtotal.toFixed(2)}</strong></div>
                                                        <div className="d-flex justify-content-between small mb-2"><span className="text-muted">Discount</span><strong className="text-danger">- ₹{orderTotals.discount.toFixed(2)}</strong></div>
                                                        <div className="d-flex justify-content-between small mb-2"><span className="text-muted">Taxable Value</span><strong>₹{orderTotals.taxable.toFixed(2)}</strong></div>
                                                        <div className="d-flex justify-content-between small mb-2"><span className="text-muted">Tax ({orderTotals.taxRate.toFixed(2)}%)</span><strong>₹{orderTotals.tax.toFixed(2)}</strong></div>
                                                        <div className="d-flex justify-content-between small mb-2"><span className="text-muted">Round Off</span><strong>{orderTotals.roundOff >= 0 ? "+" : ""}₹{orderTotals.roundOff.toFixed(2)}</strong></div>
                                                        <hr className="my-2" />
                                                        <div className="d-flex justify-content-between align-items-center"><span className="fw-bold">Grand Total</span><span className="fs-4 fw-bold text-primary">₹{orderTotals.grandTotal.toFixed(2)}</span></div>
                                                    </div>

                                                    <div className="row g-2 mt-3">
                                                        <div className="col-6">
                                                            <div className="border rounded-3 p-3 bg-white"><div className="small text-muted">Already Paid</div><div className="fw-bold text-success">₹{orderTotals.paid.toFixed(2)}</div></div>
                                                        </div>
                                                        <div className="col-6">
                                                            <div className="border rounded-3 p-3 bg-white"><div className="small text-muted">Current Due</div><div className="fw-bold text-danger">₹{orderTotals.due.toFixed(2)}</div></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="col-12">
                                            <div className="card border-0 shadow-sm" style={{ borderRadius: "14px" }}>
                                                <div className="card-header bg-white border-0 px-4 py-3">
                                                    <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                                                        <div>
                                                            <div className="fw-bold text-dark"><i className="bi bi-box-seam me-2 text-primary"></i>Invoice Items</div>
                                                            <div className="small text-muted">Line amount = billable quantity × rate. MTR = Qty × Cut.</div>
                                                        </div>
                                                        <button type="button" className="btn btn-primary btn-sm" onClick={addSubOrderRow}><i className="bi bi-plus-lg me-1"></i>Add Item</button>
                                                    </div>
                                                </div>

                                                <div className="card-body p-0">
                                                    <div className="table-responsive">
                                                        <table className="table table-hover align-middle mb-0" style={{ minWidth: "1250px" }}>
                                                            <thead className="table-light">
                                                                <tr>
                                                                    <th style={{ width: "42px" }}>#</th>
                                                                    <th>Design</th>
                                                                    <th style={{ minWidth: "190px" }}>Product / Description</th>
                                                                    <th style={{ width: "90px" }}>HSN</th>
                                                                    <th style={{ width: "90px" }}>Qty</th>
                                                                    <th style={{ width: "90px" }}>Cut</th>
                                                                    <th style={{ width: "95px" }}>MTR</th>
                                                                    <th style={{ width: "90px" }}>Short</th>
                                                                    <th style={{ width: "105px" }}>Unit</th>
                                                                    <th style={{ width: "110px" }}>Rate</th>
                                                                    <th style={{ width: "125px" }} className="text-end">Amount</th>
                                                                    <th style={{ width: "58px" }}></th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {subOrders.map((item, index) => {
                                                                    const line = orderTotals.lines[index] || { amount: 0 };
                                                                    return (
                                                                        <tr key={item._id || index}>
                                                                            <td className="text-muted fw-semibold">{index + 1}</td>
                                                                            <td><input className="form-control form-control-sm" name="designNumber" value={item.designNumber || ""} onChange={(e) => handleSubOrderChange(index, e)} placeholder="Design" /></td>
                                                                            <td><input className="form-control form-control-sm" name="orderName" value={item.orderName || ""} onChange={(e) => handleSubOrderChange(index, e)} placeholder="Product / saree name" list="productNameOptions" required={index === 0} /></td>
                                                                            <td><input type="number" min="0" step="1" className="form-control form-control-sm" name="hsnCode" value={item.hsnCode ?? ""} onChange={(e) => handleSubOrderChange(index, e)} placeholder="HSN" /></td>
                                                                            <td><input type="number" min="0" step="0.01" className="form-control form-control-sm" name="quantity" value={item.quantity ?? 0} onChange={(e) => handleSubOrderChange(index, e)} /></td>
                                                                            <td><input type="number" min="0" step="0.01" className="form-control form-control-sm" name="cut" value={item.cut ?? 0} onChange={(e) => handleSubOrderChange(index, e)} /></td>
                                                                            <td><input type="number" className="form-control form-control-sm bg-light" value={item.MTR ?? 0} readOnly tabIndex="-1" title="Automatically calculated as Qty × Cut" /></td>
                                                                            <td><input type="number" min="0" step="0.01" className="form-control form-control-sm" name="shortPcs" value={item.shortPcs ?? 0} onChange={(e) => handleSubOrderChange(index, e)} /></td>
                                                                            <td>
                                                                                <select className="form-select form-select-sm" name="qtyUnit" value={item.qtyUnit || "PCS"} onChange={(e) => handleSubOrderChange(index, e)}>
                                                                                    <option value="PCS">PCS</option>
                                                                                    <option value="MTR">MTR</option>
                                                                                    <option value="BOX">BOX</option>
                                                                                    <option value="UNT">UNT</option>
                                                                                </select>
                                                                            </td>
                                                                            <td><input type="number" min="0" step="0.01" className="form-control form-control-sm" name="unitPrice" value={item.unitPrice ?? 0} onChange={(e) => handleSubOrderChange(index, e)} /></td>
                                                                            <td className="text-end fw-bold text-dark">₹{line.amount.toFixed(2)}</td>
                                                                            <td className="text-center">
                                                                                {subOrders.length > 1 && <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => deleteSubOrder(index)} title="Remove item"><i className="bi bi-trash"></i></button>}
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                                {!subOrders.length && <tr><td colSpan="12" className="text-center text-muted py-4">No items. Click “Add Item” to start.</td></tr>}
                                                            </tbody>
                                                            <tfoot className="table-light">
                                                                <tr>
                                                                    <td colSpan="10" className="text-end fw-semibold">Items subtotal</td>
                                                                    <td className="text-end fw-bold">₹{orderTotals.subtotal.toFixed(2)}</td>
                                                                    <td></td>
                                                                </tr>
                                                            </tfoot>
                                                        </table>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="col-12">
                                            <div className="card border-0 shadow-sm" style={{ borderRadius: "14px" }}>
                                                <div className="card-body p-3 p-lg-4">
                                                    <div className="row align-items-center g-3">
                                                        <div className="col-lg-7">
                                                            <label className="form-label small fw-semibold text-secondary">Internal Note</label>
                                                            <textarea className="form-control" name="note" value={formData.note || ""} onChange={handleInputChange} rows="2" placeholder="Optional note for this invoice"></textarea>
                                                        </div>
                                                        <div className="col-lg-5">
                                                            <div className="d-flex justify-content-between align-items-center p-3 rounded-3" style={{ background: "#0f172a", color: "#fff" }}>
                                                                <div><div className="small opacity-75">Amount to collect</div><div className="fs-4 fw-bold">₹{orderTotals.due.toFixed(2)}</div></div>
                                                                <i className="bi bi-cash-coin fs-2"></i>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="col-12">
                                            <div className="d-flex flex-wrap justify-content-end align-items-center gap-2">
                                                <button type="button" className="btn btn-outline-secondary px-4" onClick={() => setShowModal(false)} disabled={orderSubmitting}>Cancel</button>
                                                <button type="submit" className="btn btn-primary px-5 py-2 fw-semibold" disabled={orderSubmitting}>
                                                    {orderSubmitting ? (
                                                        <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Saving...</>
                                                    ) : (
                                                        <><i className="bi bi-check2-circle me-2"></i>{editingOrder ? "Update Invoice" : "Save Invoice"}</>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </form>
                                <datalist id="productNameOptions">
                                    {products.map(product => <option key={product._id} value={product.productName || ""} />)}
                                </datalist>
                            </div>
                        </div>
                    </div>
                </div>

            {showEwayBillModal && (
                <div className="modal fade show d-block" tabIndex="-1">
                    <div className="modal-dialog modal-lg">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title">E-Way Bill Details</h5>
                                <button type="button" className="btn-close" onClick={() => setShowEwayBillModal(false)}></button>
                            </div>
                            <div className="modal-body">
                                <EWayBillForm orderId={orderId} profile={profile} />
                                {/* <EWayBillForm orderId={editingOrder} /> */}
                            </div>
                        </div>
                    </div>
                </div>
            )}




            {loading && (
                <span
                    className="spinner-border spinner-border-sm"
                    role="status"
                    aria-hidden="true"
                >
                </span>
            )
            }
            {/* {loading ? 'Downloading...' : 'Download PDF'} */}
            {statusModal && (
                <div className="modal show d-block" tabIndex="-1">
                    <div className="modal-dialog">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title">Status History</h5>
                                <button type="button" className="btn-close" onClick={() => setStatusModal(false)}></button>
                            </div>
                            <div className="modal-body">

                                {/* e way bill generated  */}
                                <h6 className="d-flex">e-way bill Generated : {

                                    editingOrder.ewbDetails && editingOrder.ewbDetails.ewbNo ?

                                        // editingOrder.ewbDetails.ewbNo
                                        <details>
                                            <summary>{editingOrder.ewbDetails.ewbNo || "Not Generated"}</summary>
                                            <p><b>Generated on:</b> {editingOrder.ewbDetails.ewbDate}</p>
                                            <p><b>Valid Till:</b> {editingOrder.ewbDetails.validTill}</p>
                                            <p><b>alert:</b> {editingOrder.ewbDetails.alert}</p>
                                            {/* <button className="btn btn-primary" onClick={() => (window.location.href = `http://localhost:5000/api/ewaybill/pdf/${editingOrder.ewbDetails.ewbNo}`)}>
                                                <i className="bi bi-file-earmark-pdf"></i>
                                            </button> */}

                                            <button className="btn btn-primary" onClick={() => handleDownloadEwayBill(editingOrder.ewbDetails.ewbNo)}>
                                                <i className="bi bi-file-earmark-arrow-down"></i>
                                            </button>
                                        </details>
                                        : "not"}</h6>
                                {/* <a
                                    className="btn btn-success mt-3"
                                    href={`/api/ewaybill/pdf/${response.data.ewayBillNo}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    Iscsdc
                                </a> */}





                                {/* <h6>Status History:</h6> */}
                                <ul>
                                    {/* {editingOrder?.statusHistory?.map((entry, index) => (
                    
                    <li key={index}>{entry.status} - {new Date(entry.timestamp).toLocaleString()}</li>
                  ))} */}

                                    {editingOrder?.statusHistory && editingOrder.statusHistory.length > 0 ? (
                                        editingOrder.statusHistory.map((entry, index) => (
                                            <li key={index}>{entry.status} - {new Date(entry.timestamp).toLocaleString()}</li>
                                        ))
                                    ) : (
                                        <li>No status history available</li> // Show message if empty
                                    )}
                                </ul>

                            </div>
                        </div>
                    </div>
                </div>
            )
            }



            {
                showPaymentModal && (
                    <div className="modal fade show d-block" tabIndex="-1">
                        <div className="modal-dialog">
                            <div className="modal-content">
                                <div className="modal-header">
                                    <h5 className="modal-title">Manage Payments — {editingOrder?.companyName || "Customer"}</h5>
                                    <button type="button" className="btn-close" onClick={() => setShowPaymentModal(false)}></button>
                                </div>
                                <div className="modal-body">

                                    <h6>Add Payment :</h6>
                                    <div className="d-flex gap-2 mb-2">

                                        <div className="col-3">
                                            <input type="number" className="form-control" placeholder="Amount" min="0.01" max={Number(editingOrder?.dueAmount || 0)} step="0.01" value={newPayment.amount} onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })} required />
                                            <div className="small text-muted mt-1">Due: ₹{Number(editingOrder?.dueAmount || 0).toFixed(2)}</div>
                                        </div>
                                        <div className="col-3">
                                            <select className="form-select" value={newPayment.method} onChange={(e) => setNewPayment({ ...newPayment, method: e.target.value })}>
                                                <option>Cash</option>
                                                <option>Bank Transfer</option>
                                                <option>UPI</option>
                                                <option>Cheque</option>
                                            </select>
                                        </div>
                                        <div className="col-5" >
                                            <input type="text" className="form-control" placeholder="Reference (optional)" maxLength="100" value={newPayment.amountReference} onChange={(e) => setNewPayment({ ...newPayment, amountReference: e.target.value })} />
                                            <input type="date" className="form-control mt-2" value={newPayment.paymentDate || ""} onChange={(e) => setNewPayment({ ...newPayment, paymentDate: e.target.value })} />
                                        </div>
                                        {/* // <button className="btn btn-success" onClick={addPayment}>Add Payment</button> */}
                                    </div>
                                    <button className="btn btn-primary" disabled={Number(editingOrder?.dueAmount || 0) <= 0 || !newPayment.amount} onClick={() => addPayment(editingOrder._id)}>Add Payment</button>


                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Method</th>
                                                <th>Amount</th>
                                                <th>Reference</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {payments.map((p) => (
                                                <tr key={p._id}>
                                                    <td>{new Date(p.paymentDate || p.createdAt).toLocaleDateString()}</td>
                                                    <td>{p.method}</td>
                                                    <td>{p.amount}</td>
                                                    <td>{p.amountReference}</td>

                                                    <td>
                                                        {/* <button className="btn btn-warning btn-sm me-1" onClick={() => setEditPaymentModel(p)}>Edit</button> */}
                                                        <button className="btn btn-warning btn-sm me-1" onClick={() => setEditPayment(p)}>
                                                            <img src={editSVG} alt="Edit" />
                                                        </button>
                                                        <button className="btn btn-danger btn-sm mx-1" onClick={() => deletePayment(p._id)}>
                                                            <img src={deleteSVG} alt="Delete" />
                                                        </button>
                                                        <button className="btn btn-info btn-sm" onClick={() => printReceipt(p._id)}>
                                                            <img src={receiptSVG} alt="Receipt" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            <tr>
                                                <td colSpan="3" className="text-end fw-bold">Total: ₹{payments.reduce((sum, p) => sum + parseFloat(p.amount), 0)}</td>
                                            </tr>
                                        </tbody>
                                    </table>

                                    {editPayment && (
                                        <div>
                                            <h6>Edit Payment</h6>

                                            <input type="number" className="form-control mb-2" min="0.01" step="0.01" value={editPayment.amount} onChange={(e) => setEditPayment({ ...editPayment, amount: e.target.value })} />
                                            <input type="date" className="form-control mb-2" value={editPayment.paymentDate ? new Date(editPayment.paymentDate).toISOString().slice(0, 10) : ""} onChange={(e) => setEditPayment({ ...editPayment, paymentDate: e.target.value })} />
                                            <select className="form-select mb-2" value={editPayment.method} onChange={(e) => setEditPayment({ ...editPayment, method: e.target.value })}>
                                                <option>Cash</option>
                                                <option>Bank Transfer</option>
                                                <option>UPI</option>
                                                <option>Cheque</option>
                                            </select>
                                            {/* <div className="col-5" > */}
                                            <input type="text" className="form-control" placeholder="Reference" value={editPayment.amountReference} onChange={(e) => setEditPayment({ ...editPayment, amountReference: e.target.value })} />
                                            {/* <input type="text" className="form-control" placeholder="Reference" value={newPayment.amountReference} onChange={(e) => setNewPayment({ ...newPayment, amountReference: e.target.value })} /> */}
                                            {/* </div> */}
                                            <button className="btn btn-info" onClick={updatePayment}>Update Payment</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

        </div >
    );
};


export default Order2
