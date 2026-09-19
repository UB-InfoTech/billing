//order update not working properly

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

import * as XLSX from 'xlsx';

function Order() {
  const linkone = `http://localhost:5000`;
  // const linkone = `https://baba.divinesparks.in`;

  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientsData, setClientsData] = useState([]);
  const [products, setProducts] = useState([]);
  const [productsData, setProductsData] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [machines, setMachines] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [statusModal, setStatusModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [payments, setPayments] = useState([]);
  const [editPayment, setEditPayment] = useState(null);
  const [newPayment, setNewPayment] = useState({ amount: "", method: "Cash", amountReference: "" });

  // ----------------
  // State declarations
  const [search, setSearch] = useState('');
  const [editOrder, setEditOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [filters, setFilters] = useState({
    status: '',
    paymentStatus: '',
    minTotal: '',
    maxTotal: ''
  });

  // -----------
  const [formData, setFormData] = useState({
    orderNumber: "",
    challanNumber: "",
    designNumber: "",
    orderName: "",
    Address: "",
    State: "",
    City: "",
    clientId: "",
    gstNumber: "",
    companyName: "",

    // supplierId: "",
    // machineId: "",
    orderType: "Custom",
    fabricType: "Cotton",
    priority: "Medium",
    status: "Pending",
    paymentTerms: "30",

    quantity: 0,
    shortPcs: 0,
    unitPrice: 0,
    taxPercentage: 18,
    discountRate: 0,
    otherTaxes: 0,
    rawMaterialCost: 0,
    labourCost: 0,
    machineUsageCost: 0,
    // totalAmount: 0,
    // paidAmount: 0,
    // dueAmount: 0,
    // statusHistory: [],
  });

  useEffect(() => {
    fetchOrders();
    fetchClients();
    fetchProducts();
    // fetchSuppliers();
    // fetchMachines();

  }, []);

  const fetchOrders = async () => {
    const response = await axios.get(`${linkone}/api/order/orders`);
    setOrders(response.data.orders);
  };

  const fetchClients = async () => {
    const response = await axios.get(`${linkone}/api/clients`);
    setClients(response.data);
  };

  const fetchProducts = async () => {
    const response = await axios.get(`${linkone}/api/products`);
    setProducts(response.data.products);
  };

  // const fetchSuppliers = async () => {
  //   const response = await axios.get("http://localhost:5000/api/suppliers");
  //   setSuppliers(response.data);
  // };

  // const fetchMachines = async () => {
  //   const response = await axios.get("http://localhost:5000/machines");
  //   setMachines(response.data);
  // };

  const handleInputChange = (e) => {
    const { name, value } = e.target;

   
    // if (name === "clientId") {
    //   const selectedClient = clients.find(client => client._id === value);
    //   if (selectedClient) {
    //     setFormData({
    //       ...formData,
    //       clientId: value,
    //       Address: selectedClient.address || "",
    //       State: selectedClient.state || "",
    //       City: selectedClient.city || "",
    //       gstNumber: selectedClient.gstNumber || "",
    //       companyName: selectedClient.companyName || "",
    //       paymentTerms: selectedClient.paymentTerms || "30",
    //       discountRate: selectedClient.discountRate || "0"
    //     });
    //   }
    // }
    // else {
    //   setFormData({
    //     ...formData,
    //     [name]: value,
    //   });
    // }
    if (name === "companyName") {
      const selectedClient = clients.find(client => client.companyName === value);
      if (selectedClient) {
        setFormData({
          ...formData,
          companyName: value,
          clientId: selectedClient.clientId || "",
          Address: selectedClient.address || "",
          State: selectedClient.state || "",
          City: selectedClient.city || "",
          gstNumber: selectedClient.gstNumber || "",
          paymentTerms: selectedClient.paymentTerms || "30",
          discountRate: selectedClient.discountRate || "0"
        });
      }
    }
    else {
      setFormData({
        ...formData,
        [name]: value,
      });
    }

    if (name === "orderName") {
      // const selectedProduct = products.find(product => product._id === value);
      const selectedProduct = products.find(product => product.productName === value);
      if (selectedProduct) {
        setFormData({
          ...formData,
          orderName: value,
          unitPrice: selectedProduct.rate || "",
          // quantity: selectedProduct.quantity || "",
          // shortPcs: selectedClient.shortPcs || "",
        });
      }
    }
    // else {
    //   setFormData({
    //     ...formData,
    //     [name]: value,
    //   });
    // }
  };

  // const handleSubmit = async (e) => {
  //   e.preventDefault();
  //   await axios.post("http://localhost:5000/api/order/orders/create", formData);
  //   setShowModal(false);
  //   fetchOrders();
  // };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingOrder) {

      await axios.patch(`${linkone}/api/order/orders/${editingOrder._id}/update`, formData);

      alert("✅ Order Update Sucessfully");
    } else {
      await axios.post(`${linkone}/api/order/orders/create`, formData);
      alert("✅ Order Created Sucessfully");
    }
    setShowModal(false);
    setEditingOrder(null);
    fetchOrders();
  };

  const handleEdit = (order) => {
    setEditingOrder(order);
    setFormData(order);
    setShowModal(true);
  };

  const handlePaymentEdit = (order) => {
    // debugger;
    setEditingOrder(order);
    setFormData(order);
    // setPaymentMethod(order.method);
    // setPaymentAmount(order.amount);
    setShowPaymentModal(true);
  };

  // const setEditPaymentModel = (payment) => {
  //   // setEditPayment(payment);
  //   setEditPayment({ amount: payment.amount, method: payment.method });
  //   setNewPayment({ amount: payment.amount, method: payment.method });
  // };

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

   await axios.patch(`${linkone}/api/order/orders/${orderId}/upd`, updatedOrder);

    alert("✅ Status change to " + newStatus);
    // await axios.put(`http://localhost:5000/api/order/orders/${orderId}`, updatedOrder);
    fetchOrders();
  };

  // const handleStatusChangenew = async (orderId, newStatus) => {
  //   try {
  //     const response = await axios.put(`http://localhost:5000/api/order/orders/${orderId}/upd`, { status: newStatus });

  //     if (response.data) {
  //       fetchOrders(); // Refresh orders after updating
  //     }
  //   } catch (error) {
  //     console.error("Error updating order status:", error);
  //   }
  // };

  // const handlePayment = async (orderId) => {
  //   debugger;
  //   try {
  //     // const response = await axios.post(`http://localhost:5000/api/order/orders/${orderId}/pay`, {
  //     const response = await axios.patch(`http://localhost:5000/api/order/orders/${orderId}/pay`, {
  //       amount: paymentAmount,
  //       method: paymentMethod,
  //       amountReference: "123456",
  //     });

  //     console.log(response.data, "response.data");


  //     if (response.data) {
  //       fetchOrders(); // Refresh data
  //       // setShowModal(false); // Close modal
  //     }
  //   } catch (error) {
  //     alert("Payment error: " + error.response.data.message);
  //   }
  // };

  // const fetchPayments = async (orderId) => {
  //   try {
  //     const response = await axios.get(`http://localhost:5000/api/order/orders/${orderId}/payments`);
  //     setPayments(response.data);
  //   } catch (error) {
  //     console.error("Error fetching payments:", error);
  //   }
  // };


  // useEffect(() => {
  //   fetchPayments(orderId);
  // }, [orderId]);

  // const handlePaymentnew = (order) => {
  //   setEditingOrder(order);
  //   setStatusModal(true);
  // };

  // handlePaymentEdit

  useEffect(() => {
    // setLoading(true);
    if (showPaymentModal) fetchPayments();
    // setLoading(false);
  }, [showPaymentModal]);

  const fetchPayments = async () => {
    try {
      // const response = await axios.get(`http://localhost:5000/api/order/orders/${orderId}/payments`);
      const response = await axios.get(`${linkone}/api/order/orders/${editingOrder._id}/payments`);
      setPayments(response.data);
    } catch (error) {
      console.error("Error fetching payments", error);
    }
  };

  const addPayment = async (orderId) => {
    try {
      await axios.post(`${linkone}/api/order/orders/${orderId}/pay`, newPayment);
      fetchPayments();
      setNewPayment({ amount: "", method: "Cash", amountReference: "" });
      alert("✅ Payment Added Sucessfully");
    } catch (error) {
      alert("❌", error.response.data.message);
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
      alert("❌ Error updating payment");
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
        alert("❌ Error deleting payment");
      }
    } else {
      alert("❌ Incorrect password");
    }


  };

  const handleDeleteOrder = async (order) => {
    const password = prompt("Enter password to delete:");
    if (password === "123") {

      try {
        await axios.delete(`${linkone}/api/order/orders/${order._id}/delete`);
        fetchOrders();
        alert("✅ Order Delete Sucessfully")
      } catch (error) {
        alert("❌ ",error.response.data.message);
        // console.error('Error deleting client', error);
      }
    } else {
      alert("❌ Incorrect password");
    }
  };

  const printInvoice = (order) => {
    window.open(`${linkone}/api/order/${order}/invoice`, "_blank");
  };
  const printReceipt = (paymentId) => {
    window.open(`${linkone}/api/order/${editingOrder._id}/payments/${paymentId}/invoice`, "_blank");
  };

  // const handleStatusChange = async (orderId, newStatus) => {
  //   const updatedOrder = orders.find(order => order._id === orderId);
  //   updatedOrder.status = newStatus;
  //   updatedOrder.statusHistory.push({ status: newStatus, timestamp: new Date().toISOString() });
  //   // await axios.put(`http://localhost:5000/api/order/orders/${orderId}/track`, updatedOrder);
  //   console.log(updatedOrder, "updatedOrder");

  //   await axios.post(`http://localhost:5000/api/order/orders/${orderId}/update`, updatedOrder);
  //   fetchOrders();
  // };
  // -------------

  // useEffect(() => {
  //   if (showModal) {
  //     // Initialize tooltips when modal is shown
  //     const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  //     // tooltipTriggerList.map((tooltipTriggerEl) => new bootstrap.Tooltip(tooltipTriggerEl));
  //     tooltipTriggerList.map((tooltipTriggerEl) => new bootstrap.Tooltip(tooltipTriggerEl));
  //   }
  // }, [showModal]);

  // // Calculate progress based on filled fields
  // const filledFields = Object.values(formData).filter(Boolean).length;
  // const totalFields = Object.keys(formData).length;
  // const progress = (filledFields / totalFields) * 100;

  // // Real-time validation function (example: checks if required fields are filled)
  // const isFormValid = () => {
  //   const requiredFields = ['orderNumber', 'orderName', 'orderType', 'fabricType', 'priority', 'clientId', 'Address', 'City', 'State', 'paymentTerms', 'quantity', 'unitPrice'];
  //   return requiredFields.every((field) => formData[field]);
  // };


  // Sorting
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
      const clientName = clients.find(client => client._id === order.clientId)?.name || '';
      return (
        (clientName.toLowerCase().includes(search.toLowerCase()) || order.orderNumber.toLowerCase().includes(search.toLowerCase())) &&
        (filters.status === '' || order.status === filters.status) &&
        (filters.paymentStatus === '' || order.paymentStatus === filters.paymentStatus) &&
        (filters.minTotal === '' || order.totalCost >= parseInt(filters.minTotal)) &&
        (filters.maxTotal === '' || order.totalCost <= parseInt(filters.maxTotal))
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

  // const handleStatusChange = (orderId, newStatus) => {
  //   setOrders(orders.map(order => 
  //     order._id === orderId ? { ...order, status: newStatus } : order
  //   ));
  // };

  // const handleEdit = (order) => {
  //   setEditOrder({ ...order });
  //   setShowModal(true);
  // };

  // const handleStatus = (order) => {
  //   alert(`Order Status Details:\nNumber: ${order.orderNumber}\nStatus: ${order.status}\nPayment: ${order.paymentStatus}`);
  // };

  // const handlePaymentEdit = (order) => {
  //   const newPaid = prompt('Enter new paid amount:', order.paidAmount);
  //   if (newPaid !== null) {
  //     const paidAmount = parseFloat(newPaid);
  //     if (!isNaN(paidAmount) && paidAmount >= 0 && paidAmount <= order.totalCost) {
  //       setOrders(orders.map(o => 
  //         o._id === order._id ? {
  //           ...o,
  //           paidAmount,
  //           dueAmount: o.totalCost - paidAmount,
  //           paymentStatus: paidAmount === o.totalCost ? 'Paid' : 
  //                         paidAmount > 0 ? 'Partial' : 'Unpaid'
  //         } : o
  //       ));
  //     }
  //   }
  // };

  // const handleDeleteOrder = (order) => {
  //   if (window.confirm('Are you sure you want to delete this order?')) {
  //     setOrders(orders.filter(o => o._id !== order._id));
  //   }
  // };

  // const handleSubmit = (e) => {
  //   e.preventDefault();
  //   setOrders(orders.map(order => 
  //     order._id === editOrder._id ? { ...editOrder, 
  //       totalCost: editOrder.quantity * editOrder.unitPrice,
  //       dueAmount: (editOrder.quantity * editOrder.unitPrice) - editOrder.paidAmount
  //     } : order
  //   ));
  //   setShowModal(false);
  //   setEditOrder(null);
  // };

  const handleExportExcel = () => {
    const exportData = filteredOrders.map(order => ({
      ...order,
      clientName: clients.find(client => client._id === order.clientId)?.name
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


  return (
    <div className="container mt-3">

      <div className="d-flex align-items-center gap-4">

        <h2>Order Management</h2>

        <button className="btn btn-primary" onClick={() => {
          setShowModal(true); setEditingOrder(null);
          setFormData({
            orderNumber: "",
            challanNumber: "",
            designNumber: "",
            orderName: "",
            Address: "",
            State: "",
            City: "",
            clientId: "",
            gstNumber: "",
            companyName: "",
            orderType: "Custom",
            fabricType: "Cotton",
            priority: "Medium",
            status: "Pending",
            paymentTerms: "30",
            quantity: 0,
            shortPcs: 0,
            unitPrice: 0,
            taxPercentage: 18,
            discountRate: 0,
            otherTaxes: 0,
            rawMaterialCost: 0,
            labourCost: 0,
            machineUsageCost: 0,
          });
        }}>Add New Order</button>
      </div>

      {/* <table className="table table-striped table-bordered mt-3">
        <thead>
          <tr>
            <th>Order #</th>
            <th>Client Name</th>
            <th>Status</th>
            <th>paymentStatus</th>
            <th>Quantity</th>
            <th>unitPrice</th>
            <th>totalCost</th>
            <th>Total Paid</th>
            <th>Remaining</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order._id}>
              <td>{order.orderNumber}</td>
              <td>
                {clients.find(client => client._id === order.clientId)?.name}
              </td>
              <td>
                <select className="form-select" style={{ width: "auto" }} value={order.status} onChange={(e) => handleStatusChange(order._id, e.target.value)}>
                  <option value="Pending">Pending</option>
                  <option value="In Process">In Process</option>
                  <option value="Cancelled">Cancelled</option>
                  <option value="Completed">Completed</option>
                  <option value="Dispatched">Dispatched</option>
                </select>
              </td>
              <td>{order.paymentStatus}</td>
              <td>{order.quantity}</td>
              <td>{order.unitPrice}</td>
              <td>{order.totalCost}</td>
              <td>{order.paidAmount}</td>
              <td>{order.dueAmount}</td>

              <td className="d-flex gap-2">
                <button className="btn btn-warning" onClick={() => handleEdit(order)}>
                  <img src={editSVG} alt="Edit" />
                </button>
                <button className="btn btn-info" onClick={() => handleStatus(order)}>
                  <img src={infoSVG} alt="Info" />
                </button>

                <button className="btn btn-success" onClick={() => handlePaymentEdit(order)} >
                  <img src={paymentsSVG} alt="Payment" />
                </button>
                <button className="btn btn-danger" onClick={() => handleDeleteOrder(order)}>
                  <img src={deleteSVG} alt="Delete" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table> */}


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
                <option value="">All Payment Statuses</option>
                <option value="Unpaid">Unpaid</option>
                <option value="Partial">Partial</option>
                <option value="Paid">Paid</option>
              </select>
            </div>
            <div className="col-md-2">
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
            </div>
            <div className="col-md-1">
              <button className="btn btn-success w-100" onClick={handleExportExcel}>
                Excel
              </button>
            </div>
          </div>
          {/* Table */}
          <div className="table-responsive">
            <table className="table table-striped table-bordered table-hover">
              <thead className="">
                <tr>
                  <th>#</th>
                  {['order No', 'client', 'status', 'payment Status', 'qty', 'shortPcs',
                    'unit Price', 'total Cost', 'paid Amount', 'due Amount'].map(key => (
                      <th key={key} onClick={() => handleSort(key === 'clientName' ? 'clientId' : key)} style={{ cursor: 'pointer' }}>
                        {key === 'clientName' ? 'Client' : key.charAt(0).toUpperCase() + key.slice(1)} {getSortIcon(key === 'clientName' ? 'clientId' : key)}
                      </th>
                    ))}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentOrders.map((order, index) => (
                  <tr key={order._id}>
                    <td>{index + 1}</td>
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
                    <td>{order.quantity}</td>
                    <td>{order.shortPcs}</td>
                    <td>{order.unitPrice}</td>
                    {/* <td>{order.totalCost}</td> */}
                    <td>{order.finalRevenue}</td>
                    <td>{order.paidAmount}</td>
                    <td>{order.dueAmount}</td>
                    {/* <td>
                    <div className="d-flex gap-2 flex-wrap">
                      <button className="btn btn-warning btn-sm" onClick={() => handleEdit(order)}>Edit</button>
                      <button className="btn btn-info btn-sm" onClick={() => handleStatus(order)}>Info</button>
                      <button className="btn btn-success btn-sm" onClick={() => handlePaymentEdit(order)}>Payment</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteOrder(order)}>Delete</button>
                    </div>
                  </td> */}
                    <td className="d-flex gap-2">
                      <button className="btn btn-warning" onClick={() => handleEdit(order)}>
                        <img src={editSVG} alt="Edit" />
                      </button>
                      <button className="btn btn-info" onClick={() => handleStatus(order)}>
                        <img src={infoSVG} alt="Info" />
                      </button>

                      <button className="btn btn-success" onClick={() => handlePaymentEdit(order)} >
                        <img src={paymentsSVG} alt="Payment" />
                      </button>
                      <button className="btn btn-danger" onClick={() => handleDeleteOrder(order)}>
                        <img src={deleteSVG} alt="Delete" />
                      </button>
                      <button className="btn btn-primary" onClick={() => printInvoice(order._id)}>
                        <img src={invoiceSVG} alt="Invoice" />
                        {/* <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f"><path d="M120-80v-800l60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60v800l-60-60-60 60-60-60-60 60-60-60-60 60-60-60-60 60-60-60-60 60-60-60-60 60Zm120-200h480v-80H240v80Zm0-160h480v-80H240v80Zm0-160h480v-80H240v80Zm-40 404h560v-568H200v568Zm0-568v568-568Z" /></svg> */}
                      </button>
                    </td>
                  </tr>
                ))}
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

      {/* old model  
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
                      <div className="d-flex flex-column col-md-6 gap-3">
                        <div className="">
                          <div className="card shadow-sm border-0" style={{ borderRadius: '15px', backgroundColor: '#fff' }}>
                            <div className="card-header bg-white p-3">
                              <h6 className="fw-semibold text-muted">
                                <i className="bi bi-box me-2 text-primary"></i> Order Information
                              </h6>
                            </div>
                            <div className="card-body p-4 bg-light">
                              <div className="row g-3">
                                <div className="col-md-4">
                                  <label className="form-label fw-semibold text-muted">
                                    <i className="bi bi-hash me-1"></i> Order Number
                                  </label>
                                  <input
                                    className={`form-control shadow-sm bg-white ${formData.orderNumber ? 'is-valid' : ''}`}
                                    name="orderNumber"
                                    value={formData.orderNumber}
                                    onChange={handleInputChange}
                                    placeholder="Enter order number"
                                    required
                                  />
                                </div>
                                <div className="col-md-4">
                                  <label className="form-label fw-semibold text-muted">
                                    <i className="bi bi-receipt-cutoff"></i> Challan Number
                                  </label>
                                  <input
                                    className={`form-control shadow-sm bg-white ${formData.challanNumber ? 'is-valid' : ''}`}
                                    name="challanNumber"
                                    value={formData.challanNumber}
                                    onChange={handleInputChange}
                                    placeholder="Enter order number"
                                    required
                                  />
                                </div>
                                <div className="col-md-4">
                                  <label className="form-label fw-semibold text-muted">
                                    <i className="bi bi-tag me-1"></i> Order Name
                                  </label>
                                  <input
                                    className={`form-control shadow-sm bg-white ${formData.orderName ? 'is-valid' : ''}`}
                                    name="orderName"
                                    value={formData.orderName}
                                    onChange={handleInputChange}
                                    placeholder="Enter order name"
                                    required
                                  />
                                </div>
                                <div className="col-md-4">
                                  <label className="form-label fw-semibold text-muted">
                                    <i className="bi bi-list-task me-1"></i> Order Type
                                  </label>
                                  <select
                                    className={`form-select shadow-sm bg-white ${formData.orderType ? 'is-valid' : ''}`}
                                    name="orderType"
                                    value={formData.orderType}
                                    onChange={handleInputChange}
                                    required
                                  >
                                    <option value="Custom">Custom</option>
                                    <option value="Ready Made">Ready Made</option>
                                  </select>
                                </div>
                                <div className="col-md-4">
                                  <label className="form-label fw-semibold text-muted">
                                    <i className="bi bi-threads me-1"></i> Fabric Type
                                  </label>
                                  <select
                                    className={`form-select shadow-sm bg-white ${formData.fabricType ? 'is-valid' : ''}`}
                                    name="fabricType"
                                    value={formData.fabricType}
                                    onChange={handleInputChange}
                                    required
                                  >
                                    <option value="Cotton">Cotton</option>
                                    <option value="Silk">Silk</option>
                                    <option value="Polyester">Polyester</option>
                                    <option value="Wool">Wool</option>
                                  </select>
                                </div>
                                <div className="col-md-4">
                                  <label className="form-label fw-semibold text-muted">
                                    <i className="bi bi-exclamation-circle me-1"></i> Priority
                                  </label>
                                  <select
                                    className={`form-select shadow-sm bg-white ${formData.priority ? 'is-valid' : ''}`}
                                    name="priority"
                                    value={formData.priority}
                                    onChange={handleInputChange}
                                    required
                                  >
                                    <option value="Low">Low</option>
                                    <option value="Medium">Medium</option>
                                    <option value="High">High</option>
                                    <option value="Urgent">Urgent</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="">
                          <div className="card shadow-sm border-0" style={{ borderRadius: '15px', backgroundColor: '#fff' }}>
                            <div className="card-header bg-white p-3">
                              <h6 className="fw-semibold text-muted">
                                <i className="bi bi-truck me-2 text-primary"></i> Shipping Details
                              </h6>
                            </div>
                            <div className="card-body p-4 bg-light">
                              <div className="row g-3">
                                <div className="col-md-12">
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
                                <div className="col-md-6">
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
                                <div className="col-md-6">
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
                              </div>
                            </div>
                          </div>
                        </div>

                      </div>

                      <div className="d-flex flex-column col-md-6 gap-3">

                        <div className="">
                          <div className="card shadow-sm border-0" style={{ borderRadius: '15px', backgroundColor: '#fff' }}>
                            <div className="card-header bg-white p-3">
                              <h6 className="fw-semibold text-muted">
                                <i className="bi bi-person me-2 text-primary"></i> Client Details
                              </h6>
                            </div>
                            <div className="card-body p-4 bg-light">
                              <div className="row g-3">
                                <div className="col-md-4">
                                  <label className="form-label fw-semibold text-muted">
                                    <i className="bi bi-person-circle me-1"></i> Client
                                  </label>
                                  <select
                                    className={`form-select shadow-sm bg-white ${formData.clientId ? 'is-valid' : ''}`}
                                    name="clientId"
                                    value={formData.clientId}
                                    onChange={handleInputChange}
                                    required
                                  >
                                    <option value="">Select Client</option>
                                    {clients.map((client) => (
                                      <option key={client._id} value={client._id} >
                                        {client.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="col-md-4">
                                  <label className="form-label fw-semibold text-muted">
                                    <i className="bi bi-building me-1"></i> Company Name
                                  </label>
                                  <input
                                    className={`form-control shadow-sm bg-white ${formData.companyName ? 'is-valid' : ''}`}
                                    name="companyName"
                                    value={formData.companyName}
                                    onChange={handleInputChange}
                                    placeholder="Enter company name"
                                  />
                                </div>
                                <div className="col-md-4">
                                  <label className="form-label fw-semibold text-muted">
                                    <i className="bi bi-card-text me-1"></i> GST Number
                                  </label>
                                  <input
                                    className={`form-control shadow-sm bg-white ${formData.gstNumber ? 'is-valid' : ''}`}
                                    name="gstNumber"
                                    value={formData.gstNumber}
                                    onChange={handleInputChange}
                                    placeholder="Enter GST number"
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
                                <i className="bi bi-currency-dollar me-2 text-primary"></i> Financial Details
                              </h6>
                            </div>
                            <div className="card-body p-4 bg-light">
                              <div className="row g-3">
                                <div className="col-md-4">
                                  <label className="form-label fw-semibold text-muted">
                                    <i className="bi bi-calendar-check me-1"></i> Payment Terms
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
                                    <i className="bi bi-boxes me-1"></i> Quantity
                                  </label>
                                  <input
                                    type="number"
                                    className={`form-control shadow-sm bg-white ${formData.quantity ? 'is-valid' : ''}`}
                                    name="quantity"
                                    value={formData.quantity}
                                    onChange={handleInputChange}
                                    placeholder="Enter quantity"
                                    required
                                  />
                                </div>
                                <div className="col-md-4">
                                  <label className="form-label fw-semibold text-muted">
                                    <i className="bi bi-currency-exchange me-1"></i> Unit Price
                                  </label>
                                  <input
                                    type="number"
                                    className={`form-control shadow-sm bg-white ${formData.unitPrice ? 'is-valid' : ''}`}
                                    name="unitPrice"
                                    value={formData.unitPrice}
                                    onChange={handleInputChange}
                                    placeholder="Enter unit price"
                                    required
                                  />
                                </div>
                                <div className="col-md-4">
                                  <label className="form-label fw-semibold text-muted">
                                    <i className="bi bi-percent me-1"></i> Tax Percentage
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
                                    <i className="bi bi-cash me-1"></i> Other Taxes
                                  </label>
                                  <input
                                    type="number"
                                    className={`form-control shadow-sm bg-white ${formData.otherTaxes ? 'is-valid' : ''}`}
                                    name="otherTaxes"
                                    value={formData.otherTaxes}
                                    onChange={handleInputChange}
                                    placeholder="Enter other taxes"
                                  />
                                </div>
                                <div className="col-md-4">
                                  <label className="form-label fw-semibold text-muted">
                                    <i className="bi bi-bricks me-1"></i>Material Cost
                                  </label>
                                  <input
                                    type="number"
                                    className={`form-control shadow-sm bg-white ${formData.rawMaterialCost ? 'is-valid' : ''}`}
                                    name="rawMaterialCost"
                                    value={formData.rawMaterialCost}
                                    onChange={handleInputChange}
                                    placeholder="Enter raw material cost"
                                  />
                                </div>
                                <div className="col-md-4">
                                  <label className="form-label fw-semibold text-muted">
                                    <i className="bi bi-person-workspace me-1"></i> Labour Cost
                                  </label>
                                  <input
                                    type="number"
                                    className={`form-control shadow-sm bg-white ${formData.labourCost ? 'is-valid' : ''}`}
                                    name="labourCost"
                                    value={formData.labourCost}
                                    onChange={handleInputChange}
                                    placeholder="Enter labour cost"
                                  />
                                </div>
                                <div className="col-md-4">
                                  <label className="form-label fw-semibold text-muted">
                                    <i className="bi bi-gear me-1"></i>Machine Cost
                                  </label>
                                  <input
                                    type="number"
                                    className={`form-control shadow-sm bg-white ${formData.machineUsageCost ? 'is-valid' : ''}`}
                                    name="machineUsageCost"
                                    value={formData.machineUsageCost}
                                    onChange={handleInputChange}
                                    placeholder="Enter machine usage cost"
                                  />
                                </div>
                                <div className="col-md-4">
                                  <label className="form-label fw-semibold text-muted">
                                  <i className="bi bi-repeat"></i> Short Pcs
                                  </label>
                                  <input
                                    type="number"
                                    className={`form-control shadow-sm bg-white ${formData.shortPcs ? 'is-valid' : ''}`}
                                    name="shortPcs"
                                    value={formData.shortPcs}
                                    onChange={handleInputChange}
                                    placeholder="Enter Short Pcs"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                      </div>

                    </div>

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
        )} */}


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
                      {/* <div className="">
                        <div className="card shadow-sm border-0" style={{ borderRadius: '15px', backgroundColor: '#fff' }}>
                          <div className="card-header bg-white p-3">
                            <h6 className="fw-semibold text-muted">
                              <i className="bi bi-box me-2 text-primary"></i>Order Information
                            </h6>
                          </div>
                          <div className="card-body p-4 bg-light">
                            <div className="row g-3">




                            </div>
                          </div>
                        </div>
                      </div> */}
                      {/* // Order type  <div className="col-md-4">
                                  <label className="form-label fw-semibold text-muted">
                                    <i className="bi bi-list-task me-1"></i> Order Type
                                  </label>
                                  <select
                                    className={`form-select shadow-sm bg-white ${formData.orderType ? 'is-valid' : ''}`}
                                    name="orderType"
                                    value={formData.orderType}
                                    onChange={handleInputChange}
                                    required
                                  >
                                    <option value="Custom">Custom</option>
                                    <option value="Ready Made">Ready Made</option>
                                  </select>
                                </div> */}
                      {/* //fabricType  <div className="col-md-4">
                                  <label className="form-label fw-semibold text-muted">
                                    <i className="bi bi-threads me-1"></i> Fabric Type
                                  </label>
                                  <select
                                    className={`form-select shadow-sm bg-white ${formData.fabricType ? 'is-valid' : ''}`}
                                    name="fabricType"
                                    value={formData.fabricType}
                                    onChange={handleInputChange}
                                    required
                                  >
                                    <option value="Cotton">Cotton</option>
                                    <option value="Silk">Silk</option>
                                    <option value="Polyester">Polyester</option>
                                    <option value="Wool">Wool</option>
                                  </select>
                                </div> */}
                      {/* //Priority  <div className="col-md-4">
                                  <label className="form-label fw-semibold text-muted">
                                    <i className="bi bi-exclamation-circle me-1"></i> Priority
                                  </label>
                                  <select
                                    className={`form-select shadow-sm bg-white ${formData.priority ? 'is-valid' : ''}`}
                                    name="priority"
                                    value={formData.priority}
                                    onChange={handleInputChange}
                                    required
                                  >
                                    <option value="Low">Low</option>
                                    <option value="Medium">Medium</option>
                                    <option value="High">High</option>
                                    <option value="Urgent">Urgent</option>
                                  </select>
                                </div> */}

                      <div className="">

                        <div className="card shadow-sm border-0" style={{ borderRadius: '15px', backgroundColor: '#fff' }}>
                          <div className="card-header bg-white p-3">
                            <h6 className="fw-semibold text-muted">
                              <i className="bi bi-truck me-2 text-primary"></i>Shipping Details
                            </h6>
                          </div>
                          <div className="card-body p-4 bg-light">
                            <div className="row g-3">
                              <div className="col-md-6">
                                <label className="form-label fw-semibold text-muted">
                                  <i className="bi bi-hash me-1"></i>Invoice No.
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
                              <div className="col-md-6">
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

                              <div className="col-md-6">
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
                              <div className="col-md-6">
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
                              {/* <div className="col-md-4">
        <label className="form-label fw-semibold text-muted">
          <i className="bi bi-person-circle me-1"></i> Client
        </label>
        <select
          className={`form-select shadow-sm bg-white ${formData.clientId ? 'is-valid' : ''}`}
          name="clientId"
          value={formData.clientId}
          onChange={handleInputChange}
          required
        >
          <option value="">Select Client</option>
          {clients.map((client) => (
            <option key={client._id} value={client._id} >
              {client.name}
            </option>
          ))}
        </select>
      </div> */}
                              <div className="col-md-4">
                                <label className="form-label fw-semibold text-muted">
                                  <i className="bi bi-building me-1"></i> Company Name
                                </label>
                                <input
                                  className={`form-control shadow-sm bg-white ${formData.companyName ? 'is-valid' : ''}`}
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
                                  className={`form-control shadow-sm bg-white ${formData.challanNumber ? 'is-valid' : ''}`}
                                  name="challanNumber"
                                  value={formData.challanNumber}
                                  onChange={handleInputChange}
                                  placeholder="Enter Challan No."
                                  required
                                />
                              </div>
                              <div className="col-md-4">
                                <label className="form-label fw-semibold text-muted">
                                  <i className="bi bi-percent me-1"></i> Tax Percentage
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


                      {/* Bottom Row: Shipping Details and Financial Details */}


                      <div className="">
                        <div className="card shadow-sm border-0" style={{ borderRadius: '15px', backgroundColor: '#fff' }}>
                          <div className="card-header bg-white p-3">
                            <h6 className="fw-semibold text-muted">
                              <i className="bi bi-box me-2 text-primary"></i>Order Information
                              {/*<i className="bi bi-currency-dollar me-2 text-primary"></i>
                               Financial Details */}
                            </h6>
                          </div>
                          <div className="card-body p-4 bg-light">
                            <div className="row g-3">

                              <div className="col-md-2">
                                <label className="form-label fw-semibold text-muted">
                                  <i className="bi bi-tag me-1"></i>Design No.
                                </label>
                                <input
                                  className={`form-control shadow-sm bg-white ${formData.designNumber ? 'is-valid' : ''}`}
                                  name="designNumber"
                                  value={formData.designNumber}
                                  onChange={handleInputChange}
                                  placeholder="Enter Design No."
                                  required
                                />
                              </div>
                              <div className="col-md-2">
                                <label className="form-label fw-semibold text-muted">
                                  <i className="bi bi-tag me-1"></i>Order Name
                                </label>
                                <input
                                  className={`form-control shadow-sm bg-white ${formData.orderName ? 'is-valid' : ''}`}
                                  name="orderName"
                                  value={formData.orderName}
                                  onChange={handleInputChange}
                                  placeholder="Enter order name"
                                  list="orderName"
                                  required
                                />
                                <datalist id="orderName">
                                  <option value="">Select Order</option>
                                  {products.map((client) => (
                                    <option key={client._id} value={client.productName} >
                                    </option>
                                  ))}
                                </datalist>


                                {/* <select
                                  className={`form-select shadow-sm bg-white ${formData.orderName ? 'is-valid' : ''}`}
                                  name="orderName"
                                  value={formData.orderName}
                                  onChange={handleInputChange}
                                  required
                                >
                                  <option value="">Select Order</option>
                                  {products.map((client) => (
                                    <option key={client._id} value={client._id} >
                                      {client.productName}
                                    </option>
                                  ))}
                                </select> */}

                                {/* <input type="text" list="cars" /> */}

                              </div>
                              <div className="col-md-2">
                                <label className="form-label fw-semibold text-muted">
                                  <i className="bi bi-boxes me-1"></i>Quantity
                                </label>
                                <input
                                  type="number"
                                  className={`form-control shadow-sm bg-white ${formData.quantity ? 'is-valid' : ''}`}
                                  name="quantity"
                                  value={formData.quantity}
                                  onChange={handleInputChange}
                                  placeholder="Enter quantity"
                                  required
                                />
                              </div>
                              <div className="col-md-2">
                                <label className="form-label fw-semibold text-muted">
                                  <i className="bi bi-currency-exchange me-1"></i>Unit Price
                                </label>
                                <input
                                  type="number"
                                  className={`form-control shadow-sm bg-white ${formData.unitPrice ? 'is-valid' : ''}`}
                                  name="unitPrice"
                                  value={formData.unitPrice}
                                  onChange={handleInputChange}
                                  placeholder="Enter unit price"
                                  required
                                />
                              </div>

                              {/* //Material cost  <div className="col-md-4">
                                  <label className="form-label fw-semibold text-muted">
                                    <i className="bi bi-bricks me-1"></i>Material Cost
                                  </label>
                                  <input
                                    type="number"
                                    className={`form-control shadow-sm bg-white ${formData.rawMaterialCost ? 'is-valid' : ''}`}
                                    name="rawMaterialCost"
                                    value={formData.rawMaterialCost}
                                    onChange={handleInputChange}
                                    placeholder="Enter raw material cost"
                                  />
                                </div>
                               //Labour cost <div className="col-md-4">
                                  <label className="form-label fw-semibold text-muted">
                                    <i className="bi bi-person-workspace me-1"></i> Labour Cost
                                  </label>
                                  <input
                                    type="number"
                                    className={`form-control shadow-sm bg-white ${formData.labourCost ? 'is-valid' : ''}`}
                                    name="labourCost"
                                    value={formData.labourCost}
                                    onChange={handleInputChange}
                                    placeholder="Enter labour cost"
                                  />
                                </div>
                              //Machine cost  <div className="col-md-4">
                                  <label className="form-label fw-semibold text-muted">
                                    <i className="bi bi-gear me-1"></i>Machine Cost
                                  </label>
                                  <input
                                    type="number"
                                    className={`form-control shadow-sm bg-white ${formData.machineUsageCost ? 'is-valid' : ''}`}
                                    name="machineUsageCost"
                                    value={formData.machineUsageCost}
                                    onChange={handleInputChange}
                                    placeholder="Enter machine usage cost"
                                  />
                                </div> */}

                              <div className="col-md-2">
                                <label className="form-label fw-semibold text-muted">
                                  <i className="bi bi-repeat"></i> Short Pcs
                                </label>
                                <input
                                  type="number"
                                  className={`form-control shadow-sm bg-white ${formData.shortPcs ? 'is-valid' : ''}`}
                                  name="shortPcs"
                                  value={formData.shortPcs}
                                  onChange={handleInputChange}
                                  placeholder="Enter Short Pcs"
                                />
                              </div>
                            </div>
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


      {/* 
      //model with accodians bootstrap
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
                  <div className="accordion" id="orderFormAccordion">

                    // Department 1: Order Information 
                    <div className="accordion-item border-0 mb-3 shadow-sm" style={{ borderRadius: '15px', overflow: 'hidden' }}>
                      <h2 className="accordion-header">
                        <button
                          className="accordion-button fw-semibold bg-white text-muted"
                          type="button"
                          data-bs-toggle="collapse"
                          data-bs-target="#orderInfo"
                          aria-expanded="true"
                          aria-controls="orderInfo"
                        >
                          <i className="bi bi-box me-2 text-primary"></i> Order Information
                        </button>
                      </h2>
                      <div id="orderInfo" className="accordion-collapse collapse show" data-bs-parent="#orderFormAccordion">
                        <div className="accordion-body bg-light p-4">
                          <div className="row g-3">
                            <div className="col-md-6">
                              <label className="form-label fw-semibold text-muted">
                                <i className="bi bi-hash me-1"></i> Order Number
                              </label>
                              <input
                                className={`form-control shadow-sm bg-white ${formData.orderNumber ? 'is-valid' : ''}`}
                                name="orderNumber"
                                value={formData.orderNumber}
                                onChange={handleInputChange}
                                placeholder="Enter order number"
                                required
                              />
                            </div>
                            <div className="col-md-6">
                              <label className="form-label fw-semibold text-muted">
                                <i className="bi bi-tag me-1"></i> Order Name
                              </label>
                              <input
                                className={`form-control shadow-sm bg-white ${formData.orderName ? 'is-valid' : ''}`}
                                name="orderName"
                                value={formData.orderName}
                                onChange={handleInputChange}
                                placeholder="Enter order name"
                                required
                              />
                            </div>
                            <div className="col-md-4">
                              <label className="form-label fw-semibold text-muted">
                                <i className="bi bi-list-task me-1"></i> Order Type
                              </label>
                              <select
                                className={`form-select shadow-sm bg-white ${formData.orderType ? 'is-valid' : ''}`}
                                name="orderType"
                                value={formData.orderType}
                                onChange={handleInputChange}
                                required
                              >
                                <option value="Custom">Custom</option>
                                <option value="Ready Made">Ready Made</option>
                              </select>
                            </div>
                            <div className="col-md-4">
                              <label className="form-label fw-semibold text-muted">
                                <i className="bi bi-threads me-1"></i> Fabric Type
                              </label>
                              <select
                                className={`form-select shadow-sm bg-white ${formData.fabricType ? 'is-valid' : ''}`}
                                name="fabricType"
                                value={formData.fabricType}
                                onChange={handleInputChange}
                                required
                              >
                                <option value="Cotton">Cotton</option>
                                <option value="Silk">Silk</option>
                                <option value="Polyester">Polyester</option>
                                <option value="Wool">Wool</option>
                              </select>
                            </div>
                            <div className="col-md-4">
                              <label className="form-label fw-semibold text-muted">
                                <i className="bi bi-exclamation-circle me-1"></i> Priority
                              </label>
                              <select
                                className={`form-select shadow-sm bg-white ${formData.priority ? 'is-valid' : ''}`}
                                name="priority"
                                value={formData.priority}
                                onChange={handleInputChange}
                                required
                              >
                                <option value="Low">Low</option>
                                <option value="Medium">Medium</option>
                                <option value="High">High</option>
                                <option value="Urgent">Urgent</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                   // Department 2: Client Details 
                    <div className="accordion-item border-0 mb-3 shadow-sm" style={{ borderRadius: '15px', overflow: 'hidden' }}>
                      <h2 className="accordion-header">
                        <button
                          className="accordion-button fw-semibold bg-white text-muted collapsed"
                          type="button"
                          data-bs-toggle="collapse"
                          data-bs-target="#clientDetails"
                          aria-expanded="false"
                          aria-controls="clientDetails"
                        >
                          <i className="bi bi-person me-2 text-primary"></i> Client Details
                        </button>
                      </h2>
                      <div id="clientDetails" className="accordion-collapse collapse" data-bs-parent="#orderFormAccordion">
                        <div className="accordion-body bg-light p-4">
                          <div className="row g-3">
                            <div className="col-md-4">
                              <label className="form-label fw-semibold text-muted">
                                <i className="bi bi-person-circle me-1"></i> Client
                              </label>
                              <select
                                className={`form-select shadow-sm bg-white ${formData.clientId ? 'is-valid' : ''}`}
                                name="clientId"
                                value={formData.clientId}
                                onChange={handleInputChange}
                                required
                              >
                                <option value="">Select Client</option>
                                {clients.map((client) => (
                                  <option key={client._id} value={client._id}>
                                    {client.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="col-md-4">
                              <label className="form-label fw-semibold text-muted">
                                <i className="bi bi-building me-1"></i> Company Name
                              </label>
                              <input
                                className={`form-control shadow-sm bg-white ${formData.companyName ? 'is-valid' : ''}`}
                                name="companyName"
                                value={formData.companyName}
                                onChange={handleInputChange}
                                placeholder="Enter company name"
                              />
                            </div>
                            <div className="col-md-4">
                              <label className="form-label fw-semibold text-muted">
                                <i className="bi bi-card-text me-1"></i> GST Number
                              </label>
                              <input
                                className={`form-control shadow-sm bg-white ${formData.gstNumber ? 'is-valid' : ''}`}
                                name="gstNumber"
                                value={formData.gstNumber}
                                onChange={handleInputChange}
                                placeholder="Enter GST number"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                  //  Department 3: Shipping Details
                    <div className="accordion-item border-0 mb-3 shadow-sm" style={{ borderRadius: '15px', overflow: 'hidden' }}>
                      <h2 className="accordion-header">
                        <button
                          className="accordion-button fw-semibold bg-white text-muted collapsed"
                          type="button"
                          data-bs-toggle="collapse"
                          data-bs-target="#shippingDetails"
                          aria-expanded="false"
                          aria-controls="shippingDetails"
                        >
                          <i className="bi bi-truck me-2 text-primary"></i> Shipping Details
                        </button>
                      </h2>
                      <div id="shippingDetails" className="accordion-collapse collapse" data-bs-parent="#orderFormAccordion">
                        <div className="accordion-body bg-light p-4">
                          <div className="row g-3">
                            <div className="col-md-12">
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
                            <div className="col-md-6">
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
                            <div className="col-md-6">
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
                          </div>
                        </div>
                      </div>
                    </div>

                // Department 4: Financial Details 
                    <div className="accordion-item border-0 mb-3 shadow-sm" style={{ borderRadius: '15px', overflow: 'hidden' }}>
                      <h2 className="accordion-header">
                        <button
                          className="accordion-button fw-semibold bg-white text-muted collapsed"
                          type="button"
                          data-bs-toggle="collapse"
                          data-bs-target="#financialDetails"
                          aria-expanded="false"
                          aria-controls="financialDetails"
                        >
                          <i className="bi bi-currency-dollar me-2 text-primary"></i> Financial Details
                        </button>
                      </h2>
                      <div id="financialDetails" className="accordion-collapse collapse" data-bs-parent="#orderFormAccordion">
                        <div className="accordion-body bg-light p-4">
                          <div className="row g-3">
                            <div className="col-md-4">
                              <label className="form-label fw-semibold text-muted">
                                <i className="bi bi-calendar-check me-1"></i> Payment Terms
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
                                <i className="bi bi-boxes me-1"></i> Quantity
                              </label>
                              <input
                                type="number"
                                className={`form-control shadow-sm bg-white ${formData.quantity ? 'is-valid' : ''}`}
                                name="quantity"
                                value={formData.quantity}
                                onChange={handleInputChange}
                                placeholder="Enter quantity"
                                required
                              />
                            </div>
                            <div className="col-md-4">
                              <label className="form-label fw-semibold text-muted">
                                <i className="bi bi-currency-exchange me-1"></i> Unit Price
                              </label>
                              <input
                                type="number"
                                className={`form-control shadow-sm bg-white ${formData.unitPrice ? 'is-valid' : ''}`}
                                name="unitPrice"
                                value={formData.unitPrice}
                                onChange={handleInputChange}
                                placeholder="Enter unit price"
                                required
                              />
                            </div>
                            <div className="col-md-4">
                              <label className="form-label fw-semibold text-muted">
                                <i className="bi bi-percent me-1"></i> Tax Percentage
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
                                <i className="bi bi-cash me-1"></i> Other Taxes
                              </label>
                              <input
                                type="number"
                                className={`form-control shadow-sm bg-white ${formData.otherTaxes ? 'is-valid' : ''}`}
                                name="otherTaxes"
                                value={formData.otherTaxes}
                                onChange={handleInputChange}
                                placeholder="Enter other taxes"
                              />
                            </div>
                            <div className="col-md-4">
                              <label className="form-label fw-semibold text-muted">
                                <i className="bi bi-bricks me-1"></i> Raw Material Cost
                              </label>
                              <input
                                type="number"
                                className={`form-control shadow-sm bg-white ${formData.rawMaterialCost ? 'is-valid' : ''}`}
                                name="rawMaterialCost"
                                value={formData.rawMaterialCost}
                                onChange={handleInputChange}
                                placeholder="Enter raw material cost"
                              />
                            </div>
                            <div className="col-md-6">
                              <label className="form-label fw-semibold text-muted">
                                <i className="bi bi-person-workspace me-1"></i> Labour Cost
                              </label>
                              <input
                                type="number"
                                className={`form-control shadow-sm bg-white ${formData.labourCost ? 'is-valid' : ''}`}
                                name="labourCost"
                                value={formData.labourCost}
                                onChange={handleInputChange}
                                placeholder="Enter labour cost"
                              />
                            </div>
                            <div className="col-md-6">
                              <label className="form-label fw-semibold text-muted">
                                <i className="bi bi-gear me-1"></i> Machine Usage Cost
                              </label>
                              <input
                                type="number"
                                className={`form-control shadow-sm bg-white ${formData.machineUsageCost ? 'is-valid' : ''}`}
                                name="machineUsageCost"
                                value={formData.machineUsageCost}
                                onChange={handleInputChange}
                                placeholder="Enter machine usage cost"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>


                 
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
      )} */}
      {/* <button type="submit" className="btn btn-primary">Save Order</button> */}



      {statusModal && (
        <div className="modal show d-block" tabIndex="-1">
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Status History</h5>
                <button type="button" className="btn-close" onClick={() => setStatusModal(false)}></button>
              </div>
              <div className="modal-body">
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
      )}

      {showPaymentModal && (
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
      )}

    </div>
  );
};


export default Order