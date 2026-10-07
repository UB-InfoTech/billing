import React,{useEffect,useMemo,useState} from "react";
import {getExpenses,getExpenseSummary,deleteExpense} from "../services/api";
import {useNavigate,useSearchParams} from "react-router-dom";
import DynamicTable from "../components/DynamicTable";
import {EXPENSE_FORM_FIELDS} from "../config/noCodeCatalog";
import {useFormConfiguration} from "../hooks/useFormConfiguration";

const money=v=>"₹"+Number(v||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});

export default function Expenses(){
  const navigate=useNavigate();
  const [searchParams,setSearchParams]=useSearchParams();
  const expenseFormConfig=useFormConfiguration("expenses.form",EXPENSE_FORM_FIELDS);
  const [expenses,setExpenses]=useState([]);
  const [summary,setSummary]=useState({totalExpense:0,expenseCount:0,averageExpense:0});
  const [filters,setFilters]=useState({search:"",category:"",startDate:"",endDate:""});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [tableCustomizeRequested,setTableCustomizeRequested]=useState(false);

  useEffect(()=>{
    if(searchParams.get("customize")==="table"){
      setTableCustomizeRequested(true);
      searchParams.delete("customize");
      setSearchParams(searchParams,{replace:true});
    }
  },[searchParams,setSearchParams]);

  const load=async()=>{
    try{
      setLoading(true);
      setError("");
      const [list,stats]=await Promise.all([getExpenses({...filters,limit:100}),getExpenseSummary(filters)]);
      setExpenses(list.data?.expenses||[]);
      setSummary(stats.data||{totalExpense:0,expenseCount:0,averageExpense:0});
    }catch(e){
      setError(e.response?.data?.message||"Unable to load expenses.");
    }finally{setLoading(false);}
  };

  useEffect(()=>{load();},[filters]);

  const categories=useMemo(()=>[...new Set(expenses.map(e=>e.category).filter(Boolean))].sort(),[expenses]);

  const remove=async expense=>{
    if(!window.confirm("Delete this expense?"))return;
    try{
      await deleteExpense(expense._id);
      await load();
    }catch(e){
      setError(e.response?.data?.message||"Unable to delete expense.");
    }
  };

  const customColumns=expenseFormConfig.fields.filter(field=>field.custom).map(field=>({
    key:field.key,
    label:field.label,
    render:expense=>expense.customFields?.[field.key]??""
  }));

  const columns=[
    {key:"date",label:"Date",sortKey:"date",render:expense=>expense.date?new Date(expense.date).toLocaleDateString("en-IN"):""},
    {key:"title",label:"Title",sortKey:"title",render:expense=>expense.title||expense.description||""},
    {key:"category",label:"Category",sortKey:"category"},
    {key:"paymentMethod",label:"Payment",sortKey:"paymentMethod"},
    {key:"vendor",label:"Vendor",sortKey:"vendor"},
    {key:"amount",label:"Amount",sortKey:"amount",render:expense=>money(expense.amount)},
    {key:"taxAmount",label:"Tax",render:expense=>money(expense.taxAmount)},
    {key:"client",label:"Client",render:expense=>expense.clientId?.companyName||expense.clientId?.name||""},
    {key:"order",label:"Invoice",render:expense=>expense.orderId?.orderNumber||""},
    ...customColumns
  ];

  return <div className="container-fluid py-4">
    <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
      <div>
        <div className="text-primary small fw-semibold">Expenses</div>
        <h1 className="mb-1">Business expenses</h1>
        <div className="text-muted">Track, filter, export and customize expense information without code.</div>
      </div>
      <div className="d-flex gap-2">
        <button className="btn btn-outline-primary" onClick={()=>navigate("/add-expense?customize=form")}>
          <i className="bi bi-sliders2 me-1"></i>Customize form
        </button>
        <button className="btn btn-outline-success" onClick={()=>{
          const data=expenses.map(e=>({Date:e.date?new Date(e.date).toLocaleDateString("en-IN"):"",Title:e.title||e.description,Category:e.category||"",Vendor:e.vendor||"",Amount:e.amount||0,Tax:e.taxAmount||0,Total:Number(e.amount||0)+Number(e.taxAmount||0)}));
          import("xlsx").then(XLSX=>{
            const ws=XLSX.utils.json_to_sheet(data);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Expenses");XLSX.writeFile(wb,"expenses_report.xlsx");
          });
        }}>Excel</button>
        <button className="btn btn-primary" onClick={()=>navigate("/add-expense")}>+ Add Expense</button>
      </div>
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

    <div className="card border-0 shadow-sm"><div className="card-body">
      <DynamicTable
        tableKey="expenses.list"
        autoOpenSettings={tableCustomizeRequested}
        rows={expenses}
        getRowKey={expense=>expense._id}
        columns={columns}
        loading={loading}
        actionColumn={{
          label:"Actions",
          locked:true,
          render:expense=>(
            <div className="d-flex gap-1 justify-content-end">
              <button className="btn btn-warning btn-sm" onClick={()=>navigate("/edit-expense/"+expense._id)} title="Edit"><i className="bi bi-pencil"></i></button>
              <button className="btn btn-danger btn-sm" onClick={()=>remove(expense)} title="Delete"><i className="bi bi-trash"></i></button>
            </div>
          )
        }}
        footer={({visibleColumns,hasActions})=>{
          const total=expenses.reduce((sum,e)=>sum+Number(e.amount||0),0);
          return <tr>{visibleColumns.map((column,index)=><td key={column.key} className={column.key==="amount"?"fw-bold":index===0?"text-end fw-bold":""}>{column.key==="amount"?money(total):index===0?"Total:":""}</td>)}{hasActions&&<td></td>}</tr>;
        }}
      />
    </div></div>
  </div>;
}
