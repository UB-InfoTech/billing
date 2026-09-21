import React,{useEffect,useMemo,useState} from "react";
import {getExpenses,getExpenseSummary,deleteExpense} from "../services/api";
import ExpenseList from "../components/ExpenseList";
import * as XLSX from "xlsx";
import {useNavigate} from "react-router-dom";

const money=v=>"₹"+Number(v||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});

export default function Expenses(){
  const navigate=useNavigate();
  const [expenses,setExpenses]=useState([]);
  const [summary,setSummary]=useState({totalExpense:0,expenseCount:0,averageExpense:0});
  const [filters,setFilters]=useState({search:"",category:"",startDate:"",endDate:""});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  const load=async()=>{
    try{
      setLoading(true);setError("");
      const [list,stats]=await Promise.all([getExpenses({...filters,limit:100}),getExpenseSummary(filters)]);
      setExpenses(list.data?.expenses||[]);
      setSummary(stats.data||{totalExpense:0,expenseCount:0,averageExpense:0});
    }catch(e){setError(e.response?.data?.message||"Unable to load expenses.");}
    finally{setLoading(false);}
  };
  useEffect(()=>{load();},[filters]);

  const categories=useMemo(()=>[...new Set(expenses.map(e=>e.category).filter(Boolean))].sort(),[expenses]);

  const remove=async(id)=>{
    if(!window.confirm("Delete this expense?"))return;
    try{await deleteExpense(id);await load();}
    catch(e){setError(e.response?.data?.message||"Unable to delete expense.");}
  };

  const exportExcel=()=>{
    const data=expenses.map(e=>({Date:e.date?new Date(e.date).toLocaleDateString("en-IN"):"",Vendor:e.vendor||"",Description:e.description||"",Category:e.category||"",PaymentMethod:e.paymentMethod||"",GST:e.gstNo||"",Amount:e.amount||0,Tax:e.taxAmount||0,Total:Number(e.amount||0)+Number(e.taxAmount||0),Client:e.clientId?.companyName||e.clientId?.name||"",Invoice:e.orderId?.orderNumber||""}));
    const ws=XLSX.utils.json_to_sheet(data);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Expenses");XLSX.writeFile(wb,"expenses_report.xlsx");
  };

  return <div className="container-fluid py-4">
    <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
      <div><h1 className="mb-1">Expenses</h1><div className="text-muted">Track, filter, export and analyse business expenses.</div></div>
      <div className="d-flex gap-2"><button className="btn btn-outline-success" onClick={exportExcel}>Excel</button><button className="btn btn-primary" onClick={()=>navigate("/add-expense")}>+ Add Expense</button></div>
    </div>
    {error&&<div className="alert alert-danger">{error}</div>}
    <div className="row g-3 mb-3">
      <div className="col-md-4"><div className="card border-0 shadow-sm h-100"><div className="card-body"><div className="text-muted small">Total Expense</div><div className="fs-4 fw-bold">{money(summary.totalExpense)}</div></div></div></div>
      <div className="col-md-4"><div className="card border-0 shadow-sm h-100"><div className="card-body"><div className="text-muted small">Expense Count</div><div className="fs-4 fw-bold">{summary.expenseCount||0}</div></div></div></div>
      <div className="col-md-4"><div className="card border-0 shadow-sm h-100"><div className="card-body"><div className="text-muted small">Average Expense</div><div className="fs-4 fw-bold">{money(summary.averageExpense)}</div></div></div></div>
    </div>
    <div className="card border-0 shadow-sm mb-3"><div className="card-body"><div className="row g-2">
      <div className="col-md-4"><input className="form-control" placeholder="Search description, vendor, GST..." value={filters.search} onChange={e=>setFilters(v=>({...v,search:e.target.value}))}/></div>
      <div className="col-md-3"><select className="form-select" value={filters.category} onChange={e=>setFilters(v=>({...v,category:e.target.value}))}><option value="">All Categories</option>{categories.map(c=><option key={c}>{c}</option>)}</select></div>
      <div className="col-md-2"><input type="date" className="form-control" value={filters.startDate} onChange={e=>setFilters(v=>({...v,startDate:e.target.value}))}/></div>
      <div className="col-md-2"><input type="date" className="form-control" value={filters.endDate} onChange={e=>setFilters(v=>({...v,endDate:e.target.value}))}/></div>
      <div className="col-md-1"><button className="btn btn-outline-secondary w-100" onClick={()=>setFilters({search:"",category:"",startDate:"",endDate:""})}>Reset</button></div>
    </div></div></div>
    {loading?<div className="text-center py-5"><span className="spinner-border"/></div>:<ExpenseList expenses={expenses} onDelete={remove}/>}
  </div>;
}
