// import React, { useState, useEffect } from 'react';
// import { uploadReceipt } from '../services/api';

// function ExpenseForm({ onSubmit, initialData = {} }) {
//   const [formData, setFormData] = useState({
//     description: '',
//     amount: '',
//     category: 'Other',
//     paymentMethod: 'Cash',
//     currency: 'INR',
//     vendor: '',
//     taxDeductible: false,
//     clientId: '',
//     orderId: '',
//     receipt: null,
//     recurring: false,
//     recurrenceInterval: '',
//     ...initialData,
//   });

//   const [clients, setClients] = useState([]); // Fetch from API
//   const [orders, setOrders] = useState([]); // Fetch from API

//   useEffect(() => {
//     // Fetch clients and orders from backend (implement in api.js)
//     // Placeholder for now
//     setClients([{ _id: '1', name: 'Client A' }]);
//     setOrders([{ _id: '1', orderNumber: 'Order #123' }]);
//   }, []);

//   const handleChange = (e) => {
//     const { name, value, type, checked } = e.target;
//     setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
//   };

//   const handleFileChange = async (e) => {
//     const file = e.target.files[0];
//     if (file) {
//       const { receiptUrl, amount, vendor } = await uploadReceipt(file);
//       setFormData({ ...formData, receipt: receiptUrl, amount: amount || formData.amount, vendor: vendor || formData.vendor });
//     }
//   };

//   const handleSubmit = (e) => {
//     e.preventDefault();
//     onSubmit(formData);
//   };

//   return (
//     <form onSubmit={handleSubmit} className="card p-4 bg-white">
//       <h3 className="mb-4 text-center">Add Expense</h3>
//       <div className="row">
//         <div className="col-md-6 mb-3">
//           <label className="form-label">Description</label>
//           <input
//             type="text"
//             name="description"
//             value={formData.description}
//             onChange={handleChange}
//             className="form-control"
//             required
//           />
//         </div>
//         <div className="col-md-6 mb-3">
//           <label className="form-label">Amount</label>
//           <input
//             type="number"
//             name="amount"
//             value={formData.amount}
//             onChange={handleChange}
//             className="form-control"
//             required
//           />
//         </div>
//         <div className="col-md-6 mb-3">
//           <label className="form-label">Category</label>
//           <select name="category" value={formData.category} onChange={handleChange} className="form-select">
//             <option value="Raw Materials">Raw Materials</option>
//             <option value="Labor">Labor</option>
//             <option value="Maintenance">Maintenance</option>
//             <option value="Shipping">Shipping</option>
//             <option value="Utilities">Utilities</option>
//             <option value="Marketing">Marketing</option>
//             <option value="Rent">Rent</option>
//             <option value="Other">Other</option>
//           </select>
//         </div>
//         <div className="col-md-6 mb-3">
//           <label className="form-label">Payment Method</label>
//           <select name="paymentMethod" value={formData.paymentMethod} onChange={handleChange} className="form-select">
//             <option value="Cash">Cash</option>
//             <option value="Bank Transfer">Bank Transfer</option>
//             <option value="UPI">UPI</option>
//             <option value="Cheque">Cheque</option>
//             <option value="Credit">Credit</option>
//           </select>
//         </div>
//         <div className="col-md-6 mb-3">
//           <label className="form-label">Currency</label>
//           <input
//             type="text"
//             name="currency"
//             value={formData.currency}
//             onChange={handleChange}
//             className="form-control"
//           />
//         </div>
//         <div className="col-md-6 mb-3">
//           <label className="form-label">Vendor</label>
//           <input
//             type="text"
//             name="vendor"
//             value={formData.vendor}
//             onChange={handleChange}
//             className="form-control"
//           />
//         </div>
//         <div className="col-md-6 mb-3">
//           <label className="form-label">Client (Optional)</label>
//           <select name="clientId" value={formData.clientId} onChange={handleChange} className="form-select">
//             <option value="">Select Client</option>
//             {clients.map(client => (
//               <option key={client._id} value={client._id}>{client.name}</option>
//             ))}
//           </select>
//         </div>
//         <div className="col-md-6 mb-3">
//           <label className="form-label">Order (Optional)</label>
//           <select name="orderId" value={formData.orderId} onChange={handleChange} className="form-select">
//             <option value="">Select Order</option>
//             {orders.map(order => (
//               <option key={order._id} value={order._id}>{order.orderNumber}</option>
//             ))}
//           </select>
//         </div>
//         <div className="col-md-6 mb-3">
//           <label className="form-label">Receipt</label>
//           <input type="file" onChange={handleFileChange} className="form-control" />
//           {formData.receipt && <a href={formData.receipt} target="_blank" className="text-primary mt-2 d-block">View Uploaded Receipt</a>}
//         </div>
//         <div className="col-md-6 mb-3">
//           <div className="form-check">
//             <input
//               type="checkbox"
//               name="taxDeductible"
//               checked={formData.taxDeductible}
//               onChange={handleChange}
//               className="form-check-input"
//             />
//             <label className="form-check-label">Tax Deductible</label>
//           </div>
//           <div className="form-check mt-2">
//             <input
//               type="checkbox"
//               name="recurring"
//               checked={formData.recurring}
//               onChange={handleChange}
//               className="form-check-input"
//             />
//             <label className="form-check-label">Recurring Expense</label>
//           </div>
//           {formData.recurring && (
//             <select name="recurrenceInterval" value={formData.recurrenceInterval} onChange={handleChange} className="form-select mt-2">
//               <option value="">Select Interval</option>
//               <option value="Daily">Daily</option>
//               <option value="Weekly">Weekly</option>
//               <option value="Monthly">Monthly</option>
//               <option value="Yearly">Yearly</option>
//             </select>
//           )}
//         </div>
//       </div>
//       <button type="submit" className="btn btn-primary w-100 mt-3">Save Expense</button>
//     </form>
//   );
// }

// export default ExpenseForm;

import React, { useState, useEffect } from 'react';
// import { uploadReceipt } from '../services/api';

function ExpenseForm({ onSubmit, initialData = {} }) {
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    category: 'Other',
    paymentMethod: 'Cash',
    vendor: '',
    notes: '',
    date: new Date().toISOString().split('T')[0],
    gstNo: '',
    // currency: 'INR',
    // taxDeductible: false,
    // clientId: '',
    // orderId: '',
    // receipt: null,
    // recurring: false,
    // recurrenceInterval: '',
    ...initialData,
  });

  const [clients, setClients] = useState([{ _id: '1', name: 'Client A' }]);
  const [orders, setOrders] = useState([{ _id: '1', orderNumber: 'Order #123' }]);

  useEffect(() => {
    // Fetch clients and orders (placeholder)
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
  };

  // const handleFileChange = async (e) => {
  //   const file = e.target.files[0];
  //   if (file) {
  //     const { receiptUrl, amount, vendor } = await uploadReceipt(file);
  //     setFormData({ ...formData, receipt: receiptUrl, amount: amount || formData.amount, vendor: vendor || formData.vendor });
  //   }
  // };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="card p-4 bg-white">
      <h3 className="mb-4 text-center">Add Expense</h3>
      <div className="row">
        <div className="col-md-6 mb-3">
          <label className="form-label">Date</label>
          <div className="input-group">
            <span className="input-group-text"><i className="bi bi-calendar-date"></i></span>
            <input
              type="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              className="form-control"
              required
            />
          </div>
        </div>
        <div className="col-md-6 mb-3">
          <label className="form-label">GST Number</label>
          <div className="input-group">
            <span className="input-group-text"><i className="bi bi-file-earmark-text"></i></span>
            <input
              type="text"
              name="gstNo"
              value={formData.gstNo}
              onChange={handleChange}
              className="form-control"
            />
          </div>
        </div>

        <div className="col-md-6 mb-3">
          <label className="form-label">Description</label>
          <div className="input-group">
            <span className="input-group-text"><i className="bi bi-pencil"></i></span>
            <input
              type="text"
              name="description"
              value={formData.description}
              onChange={handleChange}
              className="form-control"
              required
            />
          </div>
        </div>
        <div className="col-md-6 mb-3">
          <label className="form-label">Amount</label>
          <div className="input-group">
            <span className="input-group-text"><i className="bi bi-currency-rupee"></i></span>
            <input
              type="number"
              name="amount"
              value={formData.amount}
              onChange={handleChange}
              className="form-control"
              required
            />
          </div>
        </div>
        <div className="col-md-6 mb-3">
          <label className="form-label">Category</label>
          <div className="input-group">
            <span className="input-group-text"><i className="bi bi-tag"></i></span>
            <select name="category" value={formData.category} onChange={handleChange} className="form-select">
              <option value="Raw Materials">Raw Materials</option>
              <option value="Labor">Labor</option>
              <option value="Maintenance">Maintenance</option>
              <option value="Shipping">Shipping</option>
              <option value="Utilities">Utilities</option>
              <option value="Marketing">Marketing</option>
              <option value="Rent">Rent</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>
        <div className="col-md-6 mb-3">
          <label className="form-label">Payment Method</label>
          <div className="input-group">
            <span className="input-group-text"><i className="bi bi-credit-card"></i></span>
            <select name="paymentMethod" value={formData.paymentMethod} onChange={handleChange} className="form-select">
              <option value="Cash">Cash</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="UPI">UPI</option>
              <option value="Cheque">Cheque</option>
              <option value="Credit">Credit</option>
            </select>
          </div>
        </div>
        {/* <div className="col-md-6 mb-3">
          <label className="form-label">Currency</label>
          <div className="input-group">
            <span className="input-group-text"><i className="bi bi-coin"></i></span>
            <input
              type="text"
              name="currency"
              value={formData.currency}
              onChange={handleChange}
              className="form-control"
            />
          </div>
        </div> */}
        <div className="col-md-6 mb-3">
          <label className="form-label">Vendor</label>
          <div className="input-group">
            <span className="input-group-text"><i className="bi bi-shop"></i></span>
            <input
              type="text"
              name="vendor"
              value={formData.vendor}
              onChange={handleChange}
              className="form-control"
            />
          </div>
        </div>
        <div className="col-md-6 mb-3">
          <label className="form-label">Notes</label>
          <div className="input-group">
            <span className="input-group-text"><i className="bi bi-journal-text"></i></span>
            <textarea

              name="notes"
              value={formData.notes}
              onChange={handleChange}
              className="form-control"
              style={{ height: '37.6px' }}
            ></textarea>
          </div>
        </div>

        {/* <div className="col-md-6 mb-3">
          <label className="form-label">Client (Optional)</label>
          <div className="input-group">
            <span className="input-group-text"><i className="bi bi-person"></i></span>
            <select name="clientId" value={formData.clientId} onChange={handleChange} className="form-select">
              <option value="">Select Client</option>
              {clients.map(client => (
                <option key={client._id} value={client._id}>{client.name}</option>
              ))}
            </select>
          </div>
        </div> */}
        {/* <div className="col-md-6 mb-3">
          <label className="form-label">Order (Optional)</label>
          <div className="input-group">
            <span className="input-group-text"><i className="bi bi-cart"></i></span>
            <select name="orderId" value={formData.orderId} onChange={handleChange} className="form-select">
              <option value="">Select Order</option>
              {orders.map(order => (
                <option key={order._id} value={order._id}>{order.orderNumber}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="col-md-6 mb-3">
          <label className="form-label">Receipt</label>
          <div className="input-group">
            <span className="input-group-text"><i className="bi bi-file-earmark-arrow-up"></i></span>
            <input type="file" onChange={handleFileChange} className="form-control" />
          </div>
          {formData.receipt && <a href={formData.receipt} target="_blank" className="text-primary mt-2 d-block">View Uploaded Receipt</a>}
        </div>
        <div className="col-md-6 mb-3">
          <div className="form-check">
            <input
              type="checkbox"
              name="taxDeductible"
              checked={formData.taxDeductible}
              onChange={handleChange}
              className="form-check-input"
            />
            <label className="form-check-label"><i className="bi bi-file-earmark-check me-2"></i>Tax Deductible</label>
          </div>
          <div className="form-check mt-2">
            <input
              type="checkbox"
              name="recurring"
              checked={formData.recurring}
              onChange={handleChange}
              className="form-check-input"
            />
            <label className="form-check-label"><i className="bi bi-arrow-repeat me-2"></i>Recurring Expense</label>
          </div>
          {formData.recurring && (
            <div className="input-group mt-2">
              <span className="input-group-text"><i className="bi bi-calendar"></i></span>
              <select name="recurrenceInterval" value={formData.recurrenceInterval} onChange={handleChange} className="form-select">
                <option value="">Select Interval</option>
                <option value="Daily">Daily</option>
                <option value="Weekly">Weekly</option>
                <option value="Monthly">Monthly</option>
                <option value="Yearly">Yearly</option>
              </select>
            </div>
          )}
        </div> */}
      </div>
      <button type="submit" className="btn btn-primary w-100 mt-3">
        <i className="bi bi-save me-2"></i>Save Expense
      </button>
    </form>
  );
}

export default ExpenseForm;