// import React from "react";
import deleteSVG from '../assets/delete.svg';

// function ExpenseCard({ expense, onDelete }) {
//     return (
//       <div className="card mb-3 p-3 bg-white">
//         <div className="row align-items-center">
//           <div className="col-md-8">
//             <h5 className="mb-1">{expense.description}</h5>
//             <p className="mb-0 text-muted">
//               <strong>Amount:</strong> {expense.currency} {expense.amount} | 
//               <strong> Category:</strong> {expense.category} | 
//               <strong> Date:</strong> {new Date(expense.date).toLocaleDateString()}
//             </p>
//             {expense.vendor && <p className="mb-0 text-muted"><strong>Vendor:</strong> {expense.vendor}</p>}
//             {expense.receiptUrl && (
//               <a href={expense.receiptUrl} target="_blank" className="text-primary">View Receipt</a>
//             )}
//           </div>
//           <div className="col-md-4 text-end">
//             <button className="btn btn-sm btn-danger" onClick={() => onDelete(expense._id)}>
              
//                                       <img src={deleteSVG} alt="Delete" />
//             </button>
//           </div>
//         </div>
//       </div>
//     );
//   }
  
//   export default ExpenseCard;

import React from "react";
  function ExpenseCard({ expense, onDelete }) {
    return (
     <div className="card mb-3 p-3 bg-white">
        <div className="row align-items-center">
          <div className="col-md-8">
            <h5 className="mb-1">
              <i className="bi bi-receipt me-2 text-primary"></i>{expense.description}
            </h5>
            <p className="mb-0 text-muted">
              <i className="bi bi-currency-rupee me-1"></i><strong>Amount:</strong> {expense.currency} {expense.amount}&nbsp; | &nbsp;
              <i className="bi bi-tag me-1"></i><strong>Category:</strong> {expense.category} &nbsp;| &nbsp; 
              <i className="bi bi-calendar-date me-1"></i><strong> Date:</strong> {new Date(expense.date).toLocaleDateString()}
            </p>
            {expense.vendor && (
              <p className="mb-0 text-muted">
                <i className="bi bi-shop me-1"></i><strong>Vendor:</strong>{expense.vendor}
              </p>
            )}
            {expense.receiptUrl && (
              <p className="mb-0">
                <a href={expense.receiptUrl} target="_blank" className="text-primary">
                  <i className="bi bi-file-earmark-text me-1"></i>View Receipt
                </a>
              </p>
            )}
            {expense.clientId && (
              <p className="mb-0 text-muted">
                <i className="bi bi-person me-1"></i><strong>Client:</strong> {expense.clientId.name}
              </p>
            )}
            {expense.orderId && (
              <p className="mb-0 text-muted">
                <i className="bi bi-cart me-1"></i><strong>Order:</strong> {expense.orderId.orderNumber}
              </p>
            )}
          </div>
          <div className="col-md-4 text-end">
            <button className="btn btn-sm btn-danger" onClick={() => onDelete(expense._id)}>
              {/* <i className="bi bi-trash"></i> */}
              <img src={deleteSVG} alt="Delete" />
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  export default ExpenseCard;