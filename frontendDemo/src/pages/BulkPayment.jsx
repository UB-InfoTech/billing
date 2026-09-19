import React, { useState, useEffect } from "react";
import axios from "axios";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function BulkPayment() {
    const [orders, setOrders] = useState([]);
    const [selectedOrders, setSelectedOrders] = useState([]);
    const [form, setForm] = useState({
        method: "Cash",
        amountReference: "",
        amount: "",
        splitType: "proportional"
    });
    const [customSplits, setCustomSplits] = useState({});
    const [loading, setLoading] = useState(false);

    const [allocationMode, setAllocationMode] = useState("proportional");
    const [allocatedPreview, setAllocatedPreview] = useState([]);
    const [showModal, setShowModal] = useState(false);

    // Fetch pending orders
    const token = localStorage.getItem('token');
    useEffect(() => {
        async function fetchData() {
            // You can await here
            const response = await axios.get(`http://localhost:5000/api/order/orders`, {
                headers: {
                    'x-auth-token': token
                }
            });
            setOrders(response.data.orders);
        }
        fetchData();
    }, []);

    useEffect(() => {
        if (!form.amount || selectedOrders.length === 0) {
            setAllocatedPreview([]);
            return;
        }

        const selectedData = orders.filter((o) => selectedOrders.includes(o._id));
        const totalDue = selectedData.reduce((sum, o) => sum + o.dueAmount, 0);
        let allocations = [];

        if (form.splitType === "proportional") {
            allocations = selectedData.map((o) => ({
                orderId: o._id,
                dueAmount: o.dueAmount,
                allocated: Math.round((o.dueAmount / totalDue) * form.amount),
                orderNumber: o.orderNumber
            }));
        } else if (form.splitType === "custom") {
            // Initially just put 0 for manual entry
            allocations = selectedData.map((o) => ({
                orderId: o._id,
                dueAmount: o.dueAmount,
                // allocated: get from customSplits amounts
                allocated: customSplits[o._id] || 0,
                orderNumber: o.orderNumber
            }));
        }


        setAllocatedPreview(allocations);
    }, [form.amount, form.splitType, selectedOrders, orders]);

    // console.log("selectedOrders:", selectedOrders);
    // Compute total previewed allocation
    const totalAllocated = allocatedPreview.reduce(
        (sum, a) => sum + a.allocated,
        0
    );

    const handleOrderSelect = (orderId) => {
        setSelectedOrders(prev =>
            prev.includes(orderId)
                ? prev.filter(id => id !== orderId)
                : [...prev, orderId]
        );
    };

    const handleCustomAmountChange = (orderId, value) => {
        setCustomSplits(prev => ({
            ...prev,
            [orderId]: parseFloat(value) || 0
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!form.method || !form.amountReference || !form.amount || selectedOrders.length === 0) {
            toast.error("All fields and at least one order are required");
            return;
        }

        let payload = {
            method: form.method,
            amountReference: form.amountReference,
            amount: parseFloat(form.amount),
            splitType: form.splitType,
            updates: []
        };

        if (form.splitType === "proportional") {
            payload.updates = selectedOrders;
        } else {
            payload.updates = selectedOrders.map(orderId => ({
                orderId,
                amount: customSplits[orderId] || 0
            }));
        }

        try {
            setLoading(true);
            const res = await axios.put("http://localhost:5000/api/order/orders/payments/bulk", payload);
            toast.success("Bulk Payment Successful ✅");

            // Reset form
            setForm({ method: "Cash", amountReference: "", amount: "", splitType: "proportional" });
            setSelectedOrders([]);
            setCustomSplits({});
        } catch (err) {
            toast.error(err.response?.data?.message || "Payment failed ❌");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-100 mx-3 mt-3">
            <ToastContainer />
            <h3 className="mb-3">💰 Bulk Payment Distribution</h3>

            <form onSubmit={handleSubmit}>
                <div className="card p-3 mb-3 shadow-sm ">
                    <div className="row">
                        <div className="col-md-2">
                            <label className="form-label">Method</label>
                            <select
                                className="form-select"
                                value={form.method}
                                onChange={(e) => setForm({ ...form, method: e.target.value })}
                            >
                                <option value="Cash">Cash</option>
                                <option value="Bank">Bank</option>
                                <option value="UPI">UPI</option>
                                <option value="Cheque">Cheque</option>
                            </select>
                        </div>
                        <div className="col-md-3">
                            <label className="form-label">Amount Reference</label>
                            <input
                                type="text"
                                className="form-control"
                                value={form.amountReference}
                                onChange={(e) => setForm({ ...form, amountReference: e.target.value })}
                                required
                            />
                        </div>
                        <div className="col-md-2">
                            <label className="form-label">Total Amount</label>
                            <input
                                type="number"
                                className="form-control"
                                value={form.amount}
                                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                                required
                            />
                        </div>
                        <div className="col-md-2">
                            <label className="form-label">Split Type</label>
                            <select
                                className="form-select"
                                value={form.splitType}
                                onChange={(e) => setForm({ ...form, splitType: e.target.value })}
                            >
                                <option value="proportional">Proportional</option>
                                <option value="custom">Custom</option>
                            </select>
                        </div>
                        <div className="col-md-1">
                            <label className="form-label">Total Due</label>
                            <span className="form-control-plaintext fw-bold">₹{selectedOrders.reduce((sum, id) => {
                                const order = orders.find(o => o._id === id);
                                return sum + (order ? order.dueAmount : 0);
                            }, 0).toLocaleString()}</span>
                        </div>

                        <div className="col-md-1 d-flex align-items-center">
                            <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                                {loading ? "Processing..." : "Submit"}
                            </button>
                        </div>
                        <div className="col-md-1 d-flex align-items-center">
                            <span className="w-100" onClick={() => setShowModal(!showModal)}>
                                {showModal ? <i className="bi bi-eye-slash-fill"></i> : <i className="bi bi-eye-fill"></i>}
                            </span>
                        </div>
                    </div>

                </div>



                {/* Summary Section */}
                {/* {selectedOrders.length > 0 && ( */}
                {showModal && (
                    <div className="card my-3 p-3 shadow-sm">
                        <h5>Allocation Preview</h5>
                        <table className="table table-bordered">
                            <thead>
                                <tr>
                                    <th>Bill No</th>
                                    <th>Due Amount</th>
                                    <th>Allocated</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allocatedPreview.map((a) => (
                                    <tr key={a.orderId}>
                                        <td>{a.orderNumber}</td>
                                        <td>₹{a.dueAmount.toLocaleString()}</td>
                                        <td>
                                            ₹{a.allocated.toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Totals */}
                        <div className="d-flex justify-content-between">
                            {/* <strong>Total Payment Due: ₹{Number(form.amount).toLocaleString()}</strong> */}
                            <strong>Total Payment Due:
                                ₹{selectedOrders.reduce((sum, id) => {
                                    const order = orders.find(o => o._id === id);
                                    return sum + (order ? order.dueAmount : 0);
                                }, 0).toLocaleString()}
                            </strong>
                            <strong>Total Allocated: ₹{totalAllocated.toLocaleString()}</strong>
                        </div>

                        {/* Warning */}
                        {Number(form.amount) !== totalAllocated && (
                            <div className="alert alert-warning mt-2">
                                ⚠️ Payment amount does not match total allocated. Please adjust!
                            </div>
                        )}
                    </div>
                )}
                {/* )} */}

                {/* Orders Table */}
                <div className="table-responsive card mb-3 p-3 shadow-sm">
                    <table className="table table-striped table-hover align-middle">
                        <thead className="table-light">
                            <tr>
                                <th></th>
                                <th>Bill No.</th>
                                <th>CH No.</th>
                                <th>Client</th>
                                <th>Due Amount</th>
                                {form.splitType === "custom" && <th>Custom Amount</th>}
                            </tr>
                        </thead>
                        <tbody className="overflow-y-scroll " style={{ height: "100px !important" }}>
                            {orders.map(order => (
                                <tr key={order._id}>
                                    <td>
                                        <input
                                            type="checkbox"
                                            checked={selectedOrders.includes(order._id)}
                                            onChange={() => handleOrderSelect(order._id)}
                                        />
                                    </td>
                                    <td>{order.orderNumber}</td>
                                    <td>{order.challanNumber}</td>
                                    <td>{order.companyName}</td>
                                    <td>₹{order.dueAmount}</td>
                                    {form.splitType === "custom" && (
                                        <td>
                                            <input
                                                type="number"
                                                className="form-control"
                                                value={customSplits[order._id] || ""}
                                                onChange={(e) => handleCustomAmountChange(order._id, e.target.value)}
                                                disabled={!selectedOrders.includes(order._id)}
                                            />
                                        </td>
                                    )}
                                </tr>
                            ))}


                        </tbody>
                    </table>
                </div>


            </form>
        </div>
    );
}


