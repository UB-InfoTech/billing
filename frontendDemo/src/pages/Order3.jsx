import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
// import QRCode from "qrcode.react";
import editSVG from '../assets/edit.svg';
import deleteSVG from '../assets/delete.svg';
import infoSVG from '../assets/info.svg';
import paymentsSVG from '../assets/payments.svg';
import invoiceSVG from '../assets/invoice.svg'
import receiptSVG from '../assets/receipt.svg'
import 'bootstrap/dist/css/bootstrap.min.css'; // Ensure Bootstrap CSS is imported
import EWayBillForm from "../components/EWayBillForm";

// import DatePicker from "react-multi-date-picker"
// import DatePanel from "react-multi-date-picker/plugins/date_panel"

import * as XLSX from 'xlsx';

function Order2() {
    const linkone = `http://localhost:5000`;
    // const linkone = `https://baba.divinesparks.in`;


    const [orders, setOrders] = useState([]);
    const [clients, setClients] = useState([]);
    const [clientsData, setClientsData] = useState([]);
    const [products, setProducts] = useState([]);

    const [showModal, setShowModal] = useState(false);
    const [statusModal, setStatusModal] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showEwayBillModal, setShowEwayBillModal] = useState(false);
    const [orderId, setOrderId] = useState(null);
    const [editingOrder, setEditingOrder] = useState(null);

    const [payments, setPayments] = useState([]);
    const [editPayment, setEditPayment] = useState(null);
    const [newPayment, setNewPayment] = useState({ amount: "", method: "Cash", amountReference: "" });

    // const date = new DateObject()

    const [dates, setDates] = useState([
        new Date(),
        // new DateObject({ year: 2020, month: 9, day: 8 }),
        // "December 09 2020",
        // 1597994736000 //unix time in milliseconds (August 21 2020)
    ])

    const [items, setItems] = useState([]);
    const [newItem, setNewItem] = useState({ designNumber: '', orderName: '', quantity: '', unitPrice: '', shortPcs: '' });
    // const [editIndex, setEditIndex] = useState(null);


    // // const [subOrders, setSubOrders] = useState([]);
    // const [newSubOrder, setNewSubOrder] = useState({
    //     designNumber: "",
    //     orderName: "",
    //     quantity: "",
    //     unitPrice: "",
    //     shortPcs: ""
    // });


    const [subOrders, setSubOrders] = useState([
        { designNumber: "", orderName: "", quantity: 0, unitPrice: 0, shortPcs: 0 }
    ]);



    // ----------------
    // State declarations
    const [search, setSearch] = useState('');

    const [loading, setLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(10);
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    const [filters, setFilters] = useState({
        status: '',
        paymentStatus: '',
        dateRange: [],
        minTotal: '',
        maxTotal: '',
        startDate: '',
        endDate: '',
    });



    // -----------
    // const [formData, setFormData] = useState({
    //     orderNumber: "",
    //     challanNumber: "",
    //     designNumber: "",
    //     orderName: "",
    //     Address: "",
    //     State: "",
    //     City: "",
    //     clientId: "",
    //     gstNumber: "",
    //     companyName: "",

    //     orderType: "Custom",
    //     fabricType: "Cotton",
    //     priority: "Medium",
    //     status: "Pending",
    //     paymentTerms: "30",

    //     quantity: 0,
    //     shortPcs: 0,
    //     unitPrice: 0,
    //     taxPercentage: 5,
    //     discountRate: 0,
    //     otherTaxes: 0,
    //     rawMaterialCost: 0,
    //     labourCost: 0,
    //     machineUsageCost: 0,
    // });
    const [formData, setFormData] = useState({
        orderDate: new Date(),
        orderNumber: "",
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

        // quantity: 0,
        // shortPcs: 0,
        // unitPrice: 0,
        taxPercentage: 5,
        discountRate: 0,
    });

    useEffect(() => {
        fetchOrders();
        fetchClients();
        fetchProducts();
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

    // const fetchOrdersLength = orders.length();

    const fetchOrdersLength = orders.length + 1; // Assuming you want to start from 1

    const fetchClients = async () => {
        const response = await axios.get(`${linkone}/api/clients`, {
            headers: {
                'x-auth-token': token
            }
        });
        setClients(response.data);
    };

    const fetchProducts = async () => {
        const response = await axios.get(`${linkone}/api/products`);
        setProducts(response.data.products);
    };

    const handleSubOrderChange = (index, e) => {
        // console.log(index, e.target.name, e.target.value, "index e.target.name e.target.value")
        const { name, value } = e.target;
        const updatedOrders = [...subOrders];
        updatedOrders[index][name] = value;
        if (name === "orderName") {
            // const selectedProduct = products.find(product => product._id === value);
            const selectedProduct = products.find(product => product.productName === value);

            if (selectedProduct) {
                updatedOrders[index].unitPrice = selectedProduct.rate || "";
                updatedOrders[index].designNumber = selectedProduct.designNo || "";
                // updatedOrders[index].quantity = selectedProduct.quantity || "";
            }
        }

        // if (name === "quantity" || name === "unitPrice") {
        //     updatedOrders[index].totalPrice = (updatedOrders[index].quantity - updatedOrders[index].shortPcs) * updatedOrders[index].unitPrice;
        // }
        // if (name === "shortPcs") {
        //     updatedOrders[index].totalPrice = (updatedOrders[index].quantity - updatedOrders[index].shortPcs) * updatedOrders[index].unitPrice;
        // }

        setSubOrders(updatedOrders);
        setFormData({
            ...formData,
            subOrders: updatedOrders,
        });
    };

    const addSubOrderRow = () => {
        setSubOrders([
            ...subOrders,
            { designNumber: "", orderName: "", quantity: 0, unitPrice: 0, shortPcs: 0 }
        ]);
    };

    const deleteSubOrder = (index) => {
        const updated = subOrders.filter((_, i) => i !== index);
        setSubOrders(updated);
    };

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

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (editingOrder) {

            // await axios.patch(`${linkone}/api/order/orders/${editingOrder._id}/update`, formData);
            await axios.put(`${linkone}/api/order/orders/${editingOrder._id}/update`, formData);

            alert("✅ Order Update Sucessfully");
        } else {
            await axios.post(`${linkone}/api/order/orders/create`, formData, {
                headers: {
                    'x-auth-token': token
                }
            });
            alert("✅ Order Created Sucessfully");
        }
        setShowModal(false);
        setEditingOrder(null);
        setSubOrders([]);
        fetchOrders();
    };

    const handleEdit = (order) => {
        setEditingOrder(order);
        setSubOrders(order.subOrders || []);
        setFormData(order);
        setShowModal(true);
    };

    const handlePaymentEdit = (order) => {

        setEditingOrder(order);
        setFormData(order);

        setShowPaymentModal(true);
    };


    const handleStatus = (order) => {
        setEditingOrder(order);
        setStatusModal(true);
    };

    const handleStatusChange = async (orderId, newStatus) => {
        const updatedOrder = orders.find(order => order._id === orderId);

        if (!updatedOrder) return;

        // Ensure statusHistory is initialized
        if (!updatedOrder.statusHistory) {
            updatedOrder.statusHistory = [];
        }

        updatedOrder.status = newStatus;
        updatedOrder.statusHistory.push({ status: newStatus, timestamp: new Date().toISOString() });

        // await axios.patch(`https://baba.divinesparks.in/api/order/orders/${orderId}/update`, updatedOrder);
        await axios.patch(`${linkone}/api/order/orders/${orderId}/upd`, updatedOrder);

        alert("✅ Status change to " + newStatus);
        // await axios.put(`https://baba.divinesparks.in/api/order/orders/${orderId}`, updatedOrder);
        fetchOrders();
    };


    useEffect(() => {
        // setLoading(true);
        if (showPaymentModal) fetchPayments();
        // setLoading(false);
    }, [showPaymentModal]);

    const fetchPayments = async () => {
        try {
            // const response = await axios.get(`https://baba.divinesparks.in/api/order/orders/${orderId}/payments`);
            const response = await axios.get(`${linkone}/api/order/orders/${editingOrder._id}/payments`);
            setPayments(response.data);
        } catch (error) {
            console.error("Error fetching payments" + error.response.data.message);
        }
    };

    const addPayment = async (orderId) => {
        try {
            await axios.post(`${linkone}/api/order/orders/${orderId}/pay`, newPayment);
            fetchPayments();
            setNewPayment({ amount: "", method: "Cash", amountReference: "" });
            alert("✅ Payment Added Sucessfully");
        } catch (error) {
            alert("❌ ", error.response.data.message);
            // alert("Error adding payment");
        }
    };

    const updatePayment = async () => {
        try {
            await axios.put(`${linkone}/api/order/orders/${editingOrder._id}/payments/${editPayment._id}`, editPayment);
            fetchPayments();
            setEditPayment(null);
            alert("✅ Payment Update Sucessfully")
        } catch (error) {
            alert("❌ Error updating payment " + error.response.data.message);
        }
    };

    const deletePayment = async (paymentId) => {

        if (!editingOrder) return;
        if (!paymentId) return;

        if (!window.confirm("Are you sure you want to delete this payment?")) return;

        const password = prompt("Enter password to delete:");
        if (password === "123") {
            try {
                await axios.delete(`${linkone}/api/order/orders/${editingOrder._id}/payments/${paymentId}`);
                fetchPayments();
                alert("✅ Payment Delete Sucessfully")
            } catch (error) {
                alert("❌ Error deleting payment" + error.response.data.message);
            }
        } else {
            alert("❌ Incorrect password");
        }


    };

    const handleDeleteOrder = async (order) => {
        const password = prompt("Enter password to delete:");
        if (password === "123") {

            try {
                await axios.delete(`${linkone}/api/order/orders/${order}/delete`);
                fetchOrders();
                alert("✅ Order Delete Sucessfully")
            } catch (error) {
                alert("❌ ", error.response.data.message || "Error deleting order");
                // console.error('Error deleting client', error);
            }
        } else {
            alert("❌ Incorrect password");
        }
    };

    const printKachuBill = (order) => {
        window.open(`${linkone}/api/order/${order}/KachuBill`, "_blank");
    };
    const printInvoice = (order) => {
        window.open(`${linkone}/api/order/${order}/invoice`, "_blank");
    };
    const printReceipt = (paymentId) => {
        window.open(`${linkone}/api/order/${editingOrder._id}/payments/${paymentId}/invoice`, "_blank");
    };

    const sortedOrders = useMemo(() => {
        let sortableOrders = [...orders];
        if (sortConfig.key) {
            sortableOrders.sort((a, b) => {
                if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
                if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortableOrders;
    }, [orders, sortConfig]);

    // Filtering
    const filteredOrders = useMemo(() => {
        return sortedOrders.filter(order => {
            const clientName = clients.find(client => client._id === order.clientId)?.companyName || '';
            return (
                (clientName.toLowerCase().includes(search.toLowerCase()) || order.orderNumber.toLowerCase().includes(search.toLowerCase())) &&
                (filters.status === '' || order.status === filters.status) &&
                (filters.paymentStatus === '' || order.paymentStatus === filters.paymentStatus) &&
                (filters.dateRange.length === 0 || (new Date(order.createdAt) >= new Date(filters.dateRange[0]) && new Date(order.createdAt) <= new Date(filters.dateRange[1]))) &&
                (filters.minTotal === '' || order.totalCost >= parseInt(filters.minTotal)) &&
                (filters.maxTotal === '' || order.totalCost <= parseInt(filters.maxTotal)) &&
                (filters.startDate === '' || new Date(order.createdAt) >= new Date(filters.startDate)) &&
                (filters.endDate === '' || new Date(order.createdAt) <= new Date(filters.endDate))
            );
        });
    }, [sortedOrders, search, filters, clients]);

    // Pagination
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentOrders = filteredOrders.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);

    // Handlers
    const handleSort = (key) => {
        setSortConfig({
            key,
            direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc'
        });
    };


    const handleExportExcel = () => {
        const exportData = filteredOrders.map(order => ({
            Date: order.orderDate ? new Date(order.orderDate).toLocaleDateString("en-IN", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
            }) : new Date(order.createdAt).toLocaleDateString("en-IN", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
            }),
            orderNumber: order.orderNumber,
            challanNumber: order.challanNumber,
            gstNumber: order.gstNumber,
            companyName: order.companyName,

            status: order.status,
            quantity: order.subOrders.reduce((acc, subOrder) => acc + parseInt(subOrder.quantity), 0),
            shortPcs: order.subOrders.reduce((acc, subOrder) => acc + parseInt(subOrder.shortPcs), 0),
            unitPrice: order.subOrders.reduce((acc, subOrder) => acc + parseInt(subOrder.unitPrice), 0) / order.subOrders.length,
            totalCost: order.finalRevenue,
            paidAmount: order.paidAmount,
            dueAmount: order.dueAmount,
            createdAt: new Date(order.createdAt).toLocaleDateString("en-IN", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
            }),
            // clientName: clients.find(client => client._id === order.clientId)?.companyName
            clientName: clients.find(client => client._id === order.clientId)?.name,
            ...order,

        }));
        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders');
        XLSX.writeFile(workbook, 'orders_report.xlsx');
    };

    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return '↕';
        return sortConfig.direction === 'asc' ? '↑' : '↓';
    };

    if (loading) {
        return (
            <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
                <div className="spinner-border" role="status">
                    <span className="visually-hidden">Loading...</span>
                </div>
            </div>
        );
    }

    // const handleDelete = (index) => {
    //     const updated = subOrders.filter((_, i) => i !== index);
    //     setSubOrders(updated);
    // };
    const handleDownloadEwayBill = async (ewbNo) => {
        if (!ewbNo) return alert('❌ Invalid EWB number');

        setLoading(true); // Start spinner
        try {
            const response = await axios.get(`${linkone}/api/ewaybill/pdf/${ewbNo}`, {
                responseType: 'blob', // Important for binary data
            });

            const blob = new Blob([response.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = `ewaybill_${ewbNo}.pdf`;
            document.body.appendChild(link);
            link.click();

            // Cleanup
            link.remove();
            window.URL.revokeObjectURL(url);

        } catch (err) {
            console.error('Error downloading PDF:', err);
            setError('Failed to download PDF');
        } finally {
            setLoading(false); // Stop spinner
        }
    }

    return (
        <div className="w-100 mx-3 mt-3">

            <div className="d-flex align-items-center gap-4">

                <h2>Bill Management</h2>

                <button className="btn btn-primary" onClick={() => {
                    setShowModal(true); setEditingOrder(null); setSubOrders([
                        { designNumber: "", orderName: "", quantity: 0, unitPrice: 0, shortPcs: 0 }
                    ]);
                    setFormData({
                        orderDate: new Date(),
                        orderNumber: fetchOrdersLength,
                        challanNumber: "",
                        // designNumber: "",
                        // orderName: "",
                        Address: "",
                        State: "",
                        City: "",
                        pinCode: "",
                        stateCode: "",
                        clientId: "",
                        gstNumber: "",
                        companyName: "",
                        subOrders: subOrders,
                        // orderType: "Custom",
                        // fabricType: "Cotton",
                        // priority: "Medium",
                        status: "Pending",
                        paymentTerms: "30",
                        // quantity: 0,
                        // shortPcs: 0,
                        // unitPrice: 0,
                        taxPercentage: 5,
                        discountRate: 0,
                        // otherTaxes: 0,
                        // rawMaterialCost: 0,
                        // labourCost: 0,
                        // machineUsageCost: 0,
                    });
                }}>Add New Bill</button>
            </div>

            <div className="py-2">

                <div className="card p-3">
                    {/* Filters and Search */}
                    <div className="row mb-3 g-3">
                        <div className="col-md-3">
                            <input
                                type="text"
                                className="form-control"
                                placeholder="Search by Order / Client"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <div className="col-md-2">
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
                        <div className="col-md-2">
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
                        <div className="col-md-2">
                            <input
                                type="date"
                                className="form-control"
                                placeholder="Start Date"
                                value={filters.startDate || ''}
                                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                            />
                        </div>
                        <div className="col-md-2">
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
                        <div className="col-md-1">
                            <button className="btn btn-success w-100" onClick={handleExportExcel}>
                                Excel
                            </button>
                        </div>
                    </div>
                    {/* Table */}
                    <div className="table-responsive">
                        <table className="table table-striped table-bordered table-hover">
                            <thead className="lh-sm">
                                <tr>
                                    <th>#</th>
                                    <th>Date</th>
                                    {['order No', 'client', 'status', 'payment Status', 'qty', 'short Pcs',
                                        'unit Price', 'total Cost', 'paid Amount', 'due Amount'].map(key => (
                                            <th key={key} onClick={() => handleSort(key === 'clientName' ? 'clientId' : key)} style={{ cursor: 'pointer' }}>
                                                {key === 'clientName' ? 'Client' : key.charAt(0).toUpperCase() + key.slice(1)}
                                                {/* {getSortIcon(key === 'clientName' ? 'clientId' : key)} */}
                                            </th>
                                        ))}
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentOrders.map((order, index) => (
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
                                        {/* <td>{order.quantity}</td> */}
                                        {/* <td>{order.shortPcs}</td>
                                        <td>{order.unitPrice}</td> */}
                                        <td>{order.subOrders.reduce((acc, subOrder) => acc + parseInt(subOrder.quantity), 0)}</td>
                                        <td>{order.subOrders.reduce((acc, subOrder) => acc + parseInt(subOrder.shortPcs), 0)}</td>
                                        <td>{order.subOrders.reduce((acc, subOrder) => acc + parseInt(subOrder.unitPrice), 0) / order.subOrders.length}</td>
                                        {/* <td>{order.totalCost}</td> */}
                                        <td>{order.finalRevenue}</td>
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
                                            <button className="btn btn-primary" onClick={() => printInvoice(order._id)}>
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
                                    <td colSpan={6}></td>
                                    <td colSpan="1" className="fw-bold">₹{filteredOrders.reduce((sum, order) => sum + parseFloat(order.finalRevenue), 0)}</td>
                                    <td colSpan="1" className="fw-bold">₹{filteredOrders.reduce((sum, order) => sum + parseFloat(order.paidAmount), 0)}</td>
                                    <td colSpan="1" className="fw-bold">₹{filteredOrders.reduce((sum, order) => sum + parseFloat(order.dueAmount), 0)}</td>
                                    <td colSpan={1}></td>
                                    {/* <td colSpan="3" className="text-end fw-bold">Total: ₹{filteredOrders.reduce((sum, order) => sum + parseFloat(order.totalCost), 0)}</td> */}

                                    {/* <td colSpan="3" className="text-end fw-bold">Total: ₹{payments.reduce((sum, p) => sum + parseFloat(p.amount), 0)}</td> */}
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <nav aria-label="Page navigation">
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
                    </nav>
                </div>
            </div>


            {showModal && (
                <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}>
                    <div className="modal-dialog modal-dialog-centered modal-xl">
                        <div className="modal-content shadow-lg border-0" style={{ borderRadius: '20px', overflow: 'hidden', backgroundColor: '#f8f9fa' }}>
                            <div className="modal-header bg-light text-dark p-4 border-bottom-0">
                                <h5 className="modal-title fw-bold">
                                    {editingOrder ? "Edit Order" : "Add New Order"}
                                </h5>
                                <button
                                    type="button"
                                    className="btn-close"
                                    onClick={() => setShowModal(false)}
                                    aria-label="Close"
                                ></button>
                            </div>
                            <div className="modal-body p-4">
                                <form onSubmit={handleSubmit}>
                                    <div className="row g-4">
                                        {/* <div className=""> */}
                                        {/* Top Row: Order Information and Client Details */}
                                        <div className="d-flex flex-column flex-sm-row col-md-12 gap-3">

                                            <div className="">

                                                <div className="card shadow-sm border-0" style={{ borderRadius: '15px', backgroundColor: '#fff' }}>
                                                    <div className="card-header bg-white p-3">
                                                        <h6 className="fw-semibold text-muted">
                                                            <i className="bi bi-truck me-2 text-primary"></i>Shipping Details
                                                        </h6>
                                                    </div>
                                                    <div className="card-body p-4 bg-light">
                                                        <div className="row g-3">
                                                            <div className="col-md-3">
                                                                <label className="form-label fw-semibold text-muted">
                                                                    <i className="bi bi-hash me-1"></i>Inv No.
                                                                </label>
                                                                <input
                                                                    className={`form-control shadow-sm bg-white ${formData.orderNumber ? 'is-valid' : ''}`}
                                                                    name="orderNumber"
                                                                    value={formData.orderNumber}
                                                                    onChange={handleInputChange}
                                                                    placeholder="Enter Invoice No."
                                                                    required
                                                                />
                                                            </div>
                                                            <div className="col-md-5">
                                                                <label className="form-label fw-semibold text-muted">
                                                                    <i className="bi bi-calendar me-1"></i> Order Date
                                                                </label>
                                                                <input
                                                                    type="date"
                                                                    className={`form-control shadow-sm bg-white ${formData.orderDate ? 'is-valid' : ''}`}
                                                                    name="orderDate"
                                                                    value={formData.orderDate ? new Date(formData.orderDate).toISOString().split('T')[0] : ''}
                                                                    onChange={handleInputChange}
                                                                    placeholder="Enter order date"
                                                                    required
                                                                />
                                                            </div>

                                                            <div className="col-md-4">
                                                                <label className="form-label fw-semibold text-muted">
                                                                    <i className="bi bi-map me-1"></i> State
                                                                </label>
                                                                <input
                                                                    className={`form-control shadow-sm bg-white ${formData.State ? 'is-valid' : ''}`}
                                                                    name="State"
                                                                    value={formData.State}
                                                                    onChange={handleInputChange}
                                                                    placeholder="Enter state"
                                                                    required
                                                                />
                                                            </div>

                                                            <div className="col-md-8">
                                                                <label className="form-label fw-semibold text-muted">
                                                                    <i className="bi bi-geo-alt me-1"></i> Address
                                                                </label>
                                                                <input
                                                                    className={`form-control shadow-sm bg-white ${formData.Address ? 'is-valid' : ''}`}
                                                                    name="Address"
                                                                    value={formData.Address}
                                                                    onChange={handleInputChange}
                                                                    placeholder="Enter address"
                                                                    required
                                                                />
                                                            </div>

                                                            <div className="col-md-4">
                                                                <label className="form-label fw-semibold text-muted">
                                                                    <i className="bi bi-building me-1"></i> City
                                                                </label>
                                                                <input
                                                                    className={`form-control shadow-sm bg-white ${formData.City ? 'is-valid' : ''}`}
                                                                    name="City"
                                                                    value={formData.City}
                                                                    onChange={handleInputChange}
                                                                    placeholder="Enter city"
                                                                    required
                                                                />
                                                            </div>

                                                        </div>
                                                    </div>
                                                </div>

                                            </div>
                                            <div className="">

                                                <div className="card shadow-sm border-0" style={{ borderRadius: '15px', backgroundColor: '#fff' }}>
                                                    <div className="card-header bg-white p-3">
                                                        <h6 className="fw-semibold text-muted">
                                                            <i className="bi bi-person me-2 text-primary"></i>Client Details
                                                        </h6>
                                                    </div>
                                                    <div className="card-body p-4 bg-light">
                                                        <div className="row g-3">

                                                            <div className="col-md-4">
                                                                <label className="form-label fw-semibold text-muted">
                                                                    <i className="bi bi-building me-1"></i> Company Name
                                                                </label>
                                                                <input
                                                                    className={`form-control shadow-sm bg-white ${formData.companyName ? 'is-valid' : 'is-invalid'}`}
                                                                    name="companyName"
                                                                    value={formData.companyName}
                                                                    onChange={handleInputChange}
                                                                    placeholder="Enter company name"
                                                                    list="companyName"
                                                                    required
                                                                />
                                                                <datalist id="companyName">
                                                                    <option value="">Select Client</option>
                                                                    {clients.map((client) => (
                                                                        // console.log(client.companyName, "client.companyName"),
                                                                        <option key={client._id} value={client.companyName} >
                                                                        </option>
                                                                    ))}
                                                                </datalist>

                                                            </div>
                                                            <div className="col-md-4">
                                                                <label className="form-label fw-semibold text-muted">
                                                                    <i className="bi bi-card-text me-1"></i> GST No.
                                                                </label>
                                                                <input
                                                                    className={`form-control shadow-sm bg-white ${formData.gstNumber ? 'is-valid' : ''}`}
                                                                    name="gstNumber"
                                                                    value={formData.gstNumber}
                                                                    onChange={handleInputChange}
                                                                    placeholder="Enter GST number"
                                                                />
                                                            </div>
                                                            <div className="col-md-4">
                                                                <label className="form-label fw-semibold text-muted">
                                                                    <i className="bi bi-calendar-check me-1"></i>Payment Terms
                                                                </label>
                                                                <select
                                                                    className={`form-select shadow-sm bg-white ${formData.paymentTerms ? 'is-valid' : ''}`}
                                                                    name="paymentTerms"
                                                                    value={formData.paymentTerms}
                                                                    onChange={handleInputChange}
                                                                    required
                                                                >
                                                                    <option value="30">30 days</option>
                                                                    <option value="60">60 days</option>
                                                                    <option value="90">90 days</option>
                                                                    <option value="Advance">Advance</option>
                                                                </select>
                                                            </div>
                                                            <div className="col-md-4">
                                                                <label className="form-label fw-semibold text-muted">
                                                                    <i className="bi bi-receipt-cutoff"></i> Challan No.
                                                                </label>
                                                                <input
                                                                    className={`form-control shadow-sm bg-white ${formData.challanNumber ? 'is-valid' : 'is-invalid'}`}
                                                                    name="challanNumber"
                                                                    value={formData.challanNumber}
                                                                    onChange={handleInputChange}
                                                                    placeholder="Enter Challan No."
                                                                    required
                                                                />
                                                            </div>
                                                            <div className="col-md-4">
                                                                <label className="form-label fw-semibold text-muted">
                                                                    <i className="bi bi-percent me-1"></i> Tax
                                                                </label>
                                                                <input
                                                                    type="number"
                                                                    className={`form-control shadow-sm bg-white ${formData.taxPercentage ? 'is-valid' : ''}`}
                                                                    name="taxPercentage"
                                                                    value={formData.taxPercentage}
                                                                    onChange={handleInputChange}
                                                                    placeholder="Enter tax percentage"
                                                                />
                                                            </div>
                                                            <div className="col-md-4">
                                                                <label className="form-label fw-semibold text-muted">
                                                                    <i className="bi bi-percent me-1"></i> Discount
                                                                </label>
                                                                <input
                                                                    type="number"
                                                                    className={`form-control shadow-sm bg-white ${formData.discountRate ? 'is-valid' : ''}`}
                                                                    name="discountRate"
                                                                    value={formData.discountRate}
                                                                    onChange={handleInputChange}
                                                                    placeholder="Enter tax percentage"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                            </div>

                                        </div>

                                        <div className="d-flex flex-column col-md-12 mt-3">

                                            <div className="">
                                                <div className="card shadow-sm border-0" style={{ borderRadius: '15px', backgroundColor: '#fff' }}>
                                                    <div className="card-header bg-white p-3 d-flex justify-content-between align-items-center">
                                                        <h6 className="fw-semibold text-muted mb-0">
                                                            <i className="bi bi-box me-2 text-primary"></i>Order Information
                                                        </h6>
                                                        <div className="btn btn-outline-primary btn-sm" onClick={addSubOrderRow}>
                                                            <i className="bi bi-plus-circle"></i>
                                                        </div>
                                                    </div>

                                                    <div className="card-body p-4 bg-light">
                                                        <div className="row g-3">
                                                            <div className="col-md-2">
                                                                <label className="form-label fw-semibold text-muted">
                                                                    <i className="bi bi-tag me-1"></i>Design No.
                                                                </label>
                                                            </div>
                                                            <div className="col-md-2">
                                                                <label className="form-label fw-semibold text-muted">
                                                                    <i className="bi bi-tag me-1"></i>Order Name
                                                                </label>
                                                            </div>
                                                            <div className="col-md-2">
                                                                <label className="form-label fw-semibold text-muted">
                                                                    <i className="bi bi-boxes me-1"></i>Quantity
                                                                </label>
                                                            </div>
                                                            <div className="col-md-2">
                                                                <label className="form-label fw-semibold text-muted">
                                                                    <i className="bi bi-currency-exchange me-1"></i>Unit Price
                                                                </label>
                                                            </div>
                                                            <div className="col-md-2">
                                                                <label className="form-label fw-semibold text-muted">
                                                                    <i className="bi bi-repeat me-1"></i>Short Pcs
                                                                </label>
                                                            </div>
                                                        </div>
                                                        {subOrders.map((order, index) => (
                                                            <div key={index} className="row g-3 mb-2">
                                                                <div className="col-md-2">
                                                                    {/* <label className="form-label fw-semibold text-muted">Design No.</label> */}
                                                                    <input
                                                                        className="form-control"
                                                                        name="designNumber"
                                                                        value={order.designNumber}
                                                                        onChange={(e) => handleSubOrderChange(index, e)}
                                                                        placeholder="Enter Design No."
                                                                    />
                                                                </div>
                                                                <div className="col-md-2">
                                                                    {/* <label className="form-label fw-semibold text-muted">Order Name</label> */}
                                                                    <input
                                                                        className="form-control"
                                                                        name="orderName"
                                                                        value={order.orderName}
                                                                        onChange={(e) => handleSubOrderChange(index, e)}
                                                                        placeholder="Enter Order Name"
                                                                        list="orderName"
                                                                    />
                                                                    <datalist id="orderName">
                                                                        {products.map((p) => (
                                                                            <option key={p._id} value={p.productName}></option>
                                                                        ))}
                                                                    </datalist>
                                                                </div>
                                                                <div className="col-md-2">
                                                                    {/* <label className="form-label fw-semibold text-muted">Quantity</label> */}
                                                                    <input
                                                                        type="number"
                                                                        className="form-control"
                                                                        name="quantity"
                                                                        value={order.quantity}
                                                                        onChange={(e) => handleSubOrderChange(index, e)}
                                                                        placeholder="Enter quantity"
                                                                    />
                                                                </div>
                                                                <div className="col-md-2">
                                                                    {/* <label className="form-label fw-semibold text-muted">Unit Price</label> */}
                                                                    <input
                                                                        type="number"
                                                                        className="form-control"
                                                                        name="unitPrice"
                                                                        value={order.unitPrice}
                                                                        onChange={(e) => handleSubOrderChange(index, e)}
                                                                        placeholder="Enter Unit Price"
                                                                    />
                                                                </div>
                                                                <div className="col-md-2">
                                                                    {/* <label className="form-label fw-semibold text-muted">Short Pcs</label> */}
                                                                    <input
                                                                        type="number"
                                                                        className="form-control"
                                                                        name="shortPcs"
                                                                        value={order.shortPcs}
                                                                        onChange={(e) => handleSubOrderChange(index, e)}
                                                                        placeholder="Enter Short Pcs"
                                                                    />
                                                                </div>
                                                                <div className="col-md-2 d-flex align-items-center">
                                                                    {subOrders.length > 1 && (
                                                                        <button className="btn btn-danger btn-sm" onClick={() => deleteSubOrder(index)}>
                                                                            <i className="bi bi-trash"></i>
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>


                                        </div>


                                    </div>

                                    {/* Submit Button */}
                                    <div className="text-center mt-4">
                                        <button
                                            type="submit"
                                            className="btn btn-primary btn-lg px-5 shadow"
                                            style={{
                                                backgroundColor: '#b8d4ff',
                                                borderColor: '#b8d4ff',
                                                color: '#1e40af',
                                                borderRadius: '12px',
                                                transition: 'all 0.3s ease',
                                            }}
                                            onMouseEnter={(e) => {
                                                e.target.style.backgroundColor = '#93c5fd';
                                                e.target.style.borderColor = '#93c5fd';
                                                e.target.style.transform = 'scale(1.05)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.target.style.backgroundColor = '#b8d4ff';
                                                e.target.style.borderColor = '#b8d4ff';
                                                e.target.style.transform = 'scale(1)';
                                            }}
                                        >
                                            {editingOrder ? "Update Order" : "Save Order"}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showEwayBillModal && (
                <div className="modal fade show d-block" tabIndex="-1">
                    <div className="modal-dialog modal-lg">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title">E-Way Bill Details</h5>
                                <button type="button" className="btn-close" onClick={() => setShowEwayBillModal(false)}></button>
                            </div>
                            <div className="modal-body">
                                <EWayBillForm orderId={orderId} />
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
                                    <h5 className="modal-title">Manage Payments {clientsData.name}</h5>
                                    <button type="button" className="btn-close" onClick={() => setShowPaymentModal(false)}></button>
                                </div>
                                <div className="modal-body">

                                    <h6>Add Payment :</h6>
                                    <div className="d-flex gap-2 mb-2">

                                        <div className="col-3">
                                            <input type="number" className="form-control" placeholder="Amount" value={newPayment.amount} onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })} required />
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
                                            <input type="text" className="form-control" placeholder="Reference" value={newPayment.amountReference} onChange={(e) => setNewPayment({ ...newPayment, amountReference: e.target.value })} />
                                        </div>
                                        {/* // <button className="btn btn-success" onClick={addPayment}>Add Payment</button> */}
                                    </div>
                                    <button className="btn btn-primary" onClick={() => addPayment(editingOrder._id)}>Submit Payment</button>


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
                                                    <td>{new Date(p.date).toLocaleDateString()}</td>
                                                    <td>{p.method}</td>
                                                    <td>{p.amount}</td>
                                                    <td>{p.amountReference}</td>

                                                    <td>
                                                        {/* <button className="btn btn-warning btn-sm me-1" onClick={() => setEditPaymentModel(p)}>Edit</button> */}
                                                        <button className="btn btn-warning btn-sm me-1" onClick={() => setEditPayment(p)}>
                                                            <img src={editSVG} alt="Edit" />
                                                        </button>
                                                        {/* <button className="btn btn-danger btn-sm mx-1" onClick={() => deletePayment(p._id)}>
                            <img src={deleteSVG} alt="Delete" />
                          </button> */}
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

                                            <input type="number" className="form-control mb-2" value={editPayment.amount} onChange={(e) => setEditPayment({ ...editPayment, amount: e.target.value })} />
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