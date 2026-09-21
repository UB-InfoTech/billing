import React from "react";
import {useNavigate} from "react-router-dom";
import deleteSVG from "../assets/delete.svg";

const API=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const money=v=>Number(v||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});

export default function ExpenseCard({expense,onDelete}){
  const navigate=useNavigate();
  const receipt=expense.receipt||expense.receiptUrl;
  const clientName=expense.clientId?.companyName||expense.clientId?.name;
  return <div className="card mb-3 p-3 bg-white shadow-sm">
    <div className="row align-items-center">
      <div className="col-md-9">
        <div className="d-flex flex-wrap gap-2 align-items-center"><h5 className="mb-1"><i className="bi bi-receipt me-2 text-primary"></i>{expense.title||expense.description}</h5>{expense.isRecurring&&<span className="badge text-bg-info">Recurring</span>}</div>
        <p className="mb-1 text-muted"><strong>Amount:</strong> {expense.currency||"INR"} {money(expense.amount)} &nbsp;|&nbsp; <strong>Category:</strong> {expense.category} &nbsp;|&nbsp; <strong>Date:</strong> {expense.date?new Date(expense.date).toLocaleDateString("en-IN"):"-"}</p>
        {expense.vendor&&<p className="mb-1 text-muted"><strong>Vendor:</strong> {expense.vendor}</p>}
        {expense.gstNo&&<p className="mb-1 text-muted"><strong>GST:</strong> {expense.gstNo} &nbsp; <strong>Tax:</strong> {money(expense.taxAmount)}</p>}
        {clientName&&<p className="mb-1 text-muted"><strong>Client:</strong> {clientName}</p>}
        {expense.orderId?.orderNumber&&<p className="mb-1 text-muted"><strong>Invoice:</strong> {expense.orderId.orderNumber}</p>}
        {receipt&&<a href={receipt.startsWith("http")?receipt:API+receipt} target="_blank" rel="noreferrer" className="text-primary">View Receipt</a>}
      </div>
      <div className="col-md-3 text-end">
        <button className="btn btn-sm btn-outline-primary me-2" onClick={()=>navigate("/edit-expense/"+expense._id)}>Edit</button><button className="btn btn-sm btn-outline-danger" onClick={()=>onDelete(expense._id)}><img src={deleteSVG} alt="Delete"/></button>
      </div>
    </div>
  </div>;
}
