// utsav
// import React from 'react';

// const Report = React.forwardRef(({ data }, ref) => {
//     return (
//         <div ref={ref} className="">
//             <h3 className="text-center mb-4 border-bottom pb-2">📋 Order Report</h3>

//             <table className="table table-bordered table-hover table-striped">
//                 <thead className="table-dark text-center align-middle">
//                     <tr>
//                         <th>#</th>
//                         <th>Inv Date</th>
//                         <th>Inv No</th>
//                         <th>Ch No</th>
//                         <th>Company Name</th>
//                         <th>Qty</th>
//                         <th>Cut</th>
//                         <th>Total (₹)</th>
//                         <th>Paid (₹)</th>
//                         <th>Due (₹)</th>
//                         <th>Due Date</th>
//                         <th>Days Left</th>
//                     </tr>
//                 </thead>
//                 <tbody className="text-center">
//                     {data.map((item, i) => {
//                         const orderDate = new Date(item.orderDate);
//                         const dueDate = new Date(orderDate.getTime() + item.paymentTerms * 86400000);
//                         const daysRemaining = Math.ceil((dueDate - new Date()) / 86400000);

//                         return (
//                             <tr key={i}>
//                                 <td>{i + 1}</td>
//                                 <td>{orderDate.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
//                                 <td>{item.orderNumber || '-'}</td>
//                                 <td>{item.challanNumber || '-'}</td>
//                                 <td className="text-start">{item.companyName || '-'}</td>
//                                 <td>{item.subOrders.reduce((acc, sub) => acc + Number(sub.quantity), 0)}</td>
//                                 <td>{item.subOrders.reduce((acc, sub) => acc + Number(sub.cut), 0).toFixed(2)}</td>
//                                 <td>{Number(item.finalRevenue).toFixed(2)}</td>
//                                 <td>{Number(item.paidAmount).toFixed(2)}</td>
//                                 <td>{Number(item.dueAmount).toFixed(2)}</td>
//                                 <td>{dueDate.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
//                                 <td className={daysRemaining < 0 ? "text-danger fw-bold" : ""}>
//                                     {daysRemaining}
//                                     {/* {daysRemaining < 0 ? "(Overdue)" : ""} */}
//                                 </td>
//                             </tr>
//                         );
//                     })}
//                 </tbody>
//             </table>
//         </div>
//     );
// });

// export default Report;
// -------------------------------------------

// utsav2
// import React from 'react';

// // Helper to group by company
// const groupByCompany = (data) => {
//   return data.reduce((groups, item) => {
//     const company = item.companyName?.trim() || "Unknown";
//     if (!groups[company]) groups[company] = [];
//     groups[company].push(item);
//     return groups;
//   }, {});
// };

// const Report = React.forwardRef(({ data }, ref) => {
//   const groupedData = groupByCompany(data);

//   let grandTotals = {
//     qty: 0,
//     cut: 0,
//     total: 0,
//     paid: 0,
//     due: 0
//   };

//   return (
//     <div ref={ref} className="p-4">
//       <h3 className="text-center mb-4 border-bottom pb-2">📋 Order Report (Grouped by Company)</h3>

//       {Object.entries(groupedData).map(([company, orders], index) => {
//         const totals = {
//           qty: 0,
//           cut: 0,
//           total: 0,
//           paid: 0,
//           due: 0
//         };

//         return (
//           <div key={index} className="mb-5">
//             <h5 className="text-primary border-bottom pb-1">{company}</h5>
//             <table className="table table-bordered table-striped table-sm">
//               <thead className="table-secondary text-center align-middle">
//                 <tr>
//                   <th>#</th>
//                   <th>Inv Date</th>
//                   <th>Inv No</th>
//                   <th>Ch No</th>
//                   <th>Qty</th>
//                   <th>Cut</th>
//                   <th>Total (₹)</th>
//                   <th>Paid (₹)</th>
//                   <th>Due (₹)</th>
//                   <th>Due Date</th>
//                   <th>Days Left</th>
//                 </tr>
//               </thead>
//               <tbody className="text-center">
//                 {orders.map((item, i) => {
//                   const orderDate = new Date(item.orderDate);
//                   const dueDate = new Date(orderDate.getTime() + item.paymentTerms * 86400000);
//                   const daysLeft = Math.ceil((dueDate - new Date()) / 86400000);

//                   const qty = item.subOrders.reduce((acc, sub) => acc + Number(sub.quantity), 0);
//                   const cut = item.subOrders.reduce((acc, sub) => acc + Number(sub.cut || 0), 0);
//                   const total = Number(item.finalRevenue || 0);
//                   const paid = Number(item.paidAmount || 0);
//                   const due = Number(item.dueAmount || 0);

//                   totals.qty += qty;
//                   totals.cut += cut;
//                   totals.total += total;
//                   totals.paid += paid;
//                   totals.due += due;

//                   return (
//                     <tr key={i}>
//                       <td>{i + 1}</td>
//                       <td>{orderDate.toLocaleDateString("en-IN")}</td>
//                       <td>{item.orderNumber || '-'}</td>
//                       <td>{item.challanNumber || '-'}</td>
//                       <td>{qty}</td>
//                       <td>{cut.toFixed(2)}</td>
//                       <td>{total.toFixed(2)}</td>
//                       <td>{paid.toFixed(2)}</td>
//                       <td>{due.toFixed(2)}</td>
//                       <td>{dueDate.toLocaleDateString("en-IN")}</td>
//                       <td className={daysLeft < 0 ? 'text-danger fw-bold' : ''}>
//                         {daysLeft} {daysLeft < 0 ? '(Overdue)' : ''}
//                       </td>
//                     </tr>
//                   );
//                 })}

//                 {/* Company subtotal row */}
//                 <tr className="fw-bold table-warning">
//                   <td colSpan="4">Subtotal</td>
//                   <td>{totals.qty}</td>
//                   <td>{totals.cut.toFixed(2)}</td>
//                   <td>{totals.total.toFixed(2)}</td>
//                   <td>{totals.paid.toFixed(2)}</td>
//                   <td>{totals.due.toFixed(2)}</td>
//                   <td colSpan="2"></td>
//                 </tr>
//               </tbody>
//             </table>

//             {/* Add to grand total */}
//             {(grandTotals.qty += totals.qty)}
//             {(grandTotals.cut += totals.cut)}
//             {(grandTotals.total += totals.total)}
//             {(grandTotals.paid += totals.paid)}
//             {(grandTotals.due += totals.due)}
//           </div>
//         );
//       })}

//       {/* Final Total */}
//       <div className="mt-4 border-top pt-3">
//         <h5 className="text-success">🧾 Final Grand Total:</h5>
//         <table className="table table-bordered table-sm w-auto ms-auto">
//           <tbody>
//             <tr className="fw-bold">
//               <td>Total Qty</td>
//               <td>{grandTotals.qty}</td>
//             </tr>
//             <tr className="fw-bold">
//               <td>Total Cut</td>
//               <td>{grandTotals.cut.toFixed(2)}</td>
//             </tr>
//             <tr className="fw-bold">
//               <td>Total Revenue (₹)</td>
//               <td>{grandTotals.total.toFixed(2)}</td>
//             </tr>
//             <tr className="fw-bold">
//               <td>Total Paid (₹)</td>
//               <td>{grandTotals.paid.toFixed(2)}</td>
//             </tr>
//             <tr className="fw-bold">
//               <td>Total Due (₹)</td>
//               <td>{grandTotals.due.toFixed(2)}</td>
//             </tr>
//           </tbody>
//         </table>
//       </div>
//     </div>
//   );
// });

// export default Report;
// -----------------------------

import React from 'react';

const Report = React.forwardRef(({ data }, ref) => {
  // Group by company name
  const grouped = data.reduce((acc, order) => {
    const company = order.companyName?.trim() || "Unknown";
    acc[company] = acc[company] || [];
    acc[company].push(order);
    return acc;
  }, {});

  // Initialize grand totals
  const grand = {
    qty: 0,
    cut: 0,
    total: 0,
    paid: 0,
    due: 0
  };

  return (
    <div ref={ref} className="p-4">
      <h3 className="text-center text-body-secondary mb-4 border-bottom pb-2">📋Party Report</h3>

      {Object.entries(grouped).map(([company, orders], groupIndex) => {
        const subtotal = { qty: 0, cut: 0, total: 0, paid: 0, due: 0 };

        return (
          <div key={groupIndex} className="mb-5">
            <h5 className="text-primary-emphasis border-bottom pb-1">{company}</h5>

            <table className="table table-bordered table-striped table-sm"  style={{fontSize: "10px"}}>
              <thead className="table-secondary text-center align-middle">
                <tr>
                  <th>#</th>
                  <th>Inv Date</th>
                  <th>Inv No</th>
                  <th>Ch No</th>
                  <th>Qty</th>
                  <th>Cut</th>
                  <th>Total (₹)</th>
                  <th>Paid (₹)</th>
                  <th>Due (₹)</th>
                  <th>Due Date</th>
                  <th>Days Left</th>
                  <th colSpan={3} className='px-5'>Remark</th>
                </tr>
              </thead>
              <tbody className="text-center">
                {orders.map((item, i) => {
                  const orderDate = new Date(item.orderDate);
                  const dueDate = new Date(orderDate.getTime() + item.paymentTerms * 86400000);
                  const daysLeft = Math.ceil((dueDate - new Date()) / 86400000);

                  // Calculate values from fields
                  const qty = item.subOrders?.reduce((sum, sub) => sum + Number(sub.quantity || 0), 0);
                  const cut = item.subOrders?.reduce((sum, sub) => sum + Number(sub.cut || 0), 0);
                  const total = Number(item.roundOffFinalRevenue || 0);
                  const paid = Number(item.paidAmount || 0);
                  const due = Number(item.dueAmount || 0);

                  // Add to subtotals
                  subtotal.qty += qty;
                  subtotal.cut += cut;
                  subtotal.total += total;
                  subtotal.paid += paid;
                  subtotal.due += due;

                  return (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{orderDate.toLocaleDateString("en-IN")}</td>
                      <td>{item.orderNumber || '-'}</td>
                      <td>{item.challanNumber || '-'}</td>
                      <td>{qty}</td>
                      <td>{cut.toFixed(2)}</td>
                      <td>{total.toFixed(2)}</td>
                      <td>{paid.toFixed(2)}</td>
                      <td>{due.toFixed(2)}</td>
                      <td>{dueDate.toLocaleDateString("en-IN")}</td>
                      <td className={daysLeft < 0 ? 'text-danger fw-bold' : ''}>
                        {daysLeft} {daysLeft < 0 ? '(Overdue)' : ''}
                      </td>
                      <td colSpan={2} className="px-2"></td>
                      <td></td>
                    </tr>
                  );
                })}

                {/* Subtotal Row */}
                <tr className="fw-bold table-warning">
                  <td colSpan="4">Subtotal</td>
                  <td>{subtotal.qty}</td>
                  <td>{subtotal.cut.toFixed(2)}</td>
                  <td>{subtotal.total.toFixed(2)}</td>
                  <td>{subtotal.paid.toFixed(2)}</td>
                  <td>{subtotal.due.toFixed(2)}</td>
                  <td colSpan="2"></td>
                  <td colSpan="3"></td>
                </tr>
              </tbody>
            </table>

            {/* Add to grand total */}
            {(() => {
              grand.qty += subtotal.qty;
              grand.cut += subtotal.cut;
              grand.total += subtotal.total;
              grand.paid += subtotal.paid;
              grand.due += subtotal.due;
            })()}
          </div>
        );
      })}

      {/* Final Total */}
      <div className="mt-4 border-top pt-3">
        <h5 className="text-success">🧾 Final Grand Total:</h5>
        <table className="table table-bordered table-sm w-auto ms-auto">
          <tbody>
            <tr className="fw-bold"><td>Total Qty</td><td>{grand.qty}</td></tr>
            <tr className="fw-bold"><td>Total Cut</td><td>{grand.cut.toFixed(2)}</td></tr>
            <tr className="fw-bold"><td>Total Revenue (₹)</td><td>{grand.total.toFixed(2)}</td></tr>
            <tr className="fw-bold"><td>Total Paid (₹)</td><td>{grand.paid.toFixed(2)}</td></tr>
            <tr className="fw-bold"><td>Total Due (₹)</td><td>{grand.due.toFixed(2)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default Report;
