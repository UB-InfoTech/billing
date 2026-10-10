import BusinessPageHeader from "../components/BusinessPageHeader";
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
    {key:"paymentMethod",label:"Payment",sortKey:"paymentMethod",visible:false},
    {key:"vendor",label:"Vendor",sortKey:"vendor",visible:false},
    {key:"amount",label:"Amount",sortKey:"amount",render:expense=>money(expense.amount)},
    {key:"taxAmount",label:"Tax",visible:false,render:expense=>money(expense.taxAmount)},
    {key:"client",label:"Customer",visible:false,render:expense=>expense.clientId?.companyName||expense.clientId?.name||""},
    {key:"order",label:"Invoice",visible:false,render:expense=>expense.orderId?.orderNumber||""},
    ...customColumns
  ];

  return <div className="container-fluid py-4">
    <BusinessPageHeader
      eyebrow="MONEY GOING OUT"
      title="Expenses"
      description="Record business costs, keep receipts, and see where your money goes."
      className="mb-3"
    >
      <button type="button" className="btn btn-light border" onClick={()=>{
        const exportRows=expenses.map(e=>({Date:e.date?new Date(e.date).toLocaleDateString("en-IN"):"",Title:e.title||e.description,Category:e.category||"",Vendor:e.vendor||"",Amount:e.amount||0,Tax:e.taxAmount||0,Total:Number(e.amount||0)+Number(e.taxAmount||0)}));
        import("xlsx").then(XLSX=>{
          const ws=XLSX.utils.json_to_sheet(exportRows);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Expenses");XLSX.writeFile(wb,"expenses_report.xlsx");
        });
      }}><i className="bi bi-download me-2"></i>Export Excel</button>
      <button type="button" className="btn btn-primary" onClick={()=>navigate("/add-expense")}><i className="bi bi-plus-lg me-2"></i>Add expense</button>
    </BusinessPageHeader>

    {error&&<div className="alert alert-danger">{error}</div>}

    <div className="row g-3 mb-3">
      <div className="col-md-4"><div className="card border-0 shadow-sm h-100"><div className="card-body"><div className="text-muted small">Total spent</div><div className="fs-4 fw-bold">{money(summary.totalExpense)}</div></div></div></div>
      <div className="col-md-4"><div className="card border-0 shadow-sm h-100"><div className="card-body"><div className="text-muted small">Number of expenses</div><div className="fs-4 fw-bold">{summary.expenseCount||0}</div></div></div></div>
      <div className="col-md-4"><div className="card border-0 shadow-sm h-100"><div className="card-body"><div className="text-muted small">Average Expense</div><div className="fs-4 fw-bold">{money(summary.averageExpense)}</div></div></div></div>
    </div>

    <div className="card border-0 shadow-sm mb-3"><div className="card-body">
      <div className="row g-2 align-items-center">
        <div className="col-lg-7">
          <label className="visually-hidden" htmlFor="expense-search">Search expenses</label>
          <div className="input-group">
            <span className="input-group-text bg-white"><i className="bi bi-search"></i></span>
            <input id="expense-search" className="form-control" placeholder="Search description, supplier or GST number" value={filters.search} onChange={event=>setFilters(v=>({...v,search:event.target.value}))}/>
            {filters.search&&<button type="button" className="btn btn-light border" onClick={()=>setFilters(v=>({...v,search:""}))}>Clear</button>}
          </div>
        </div>
        <div className="col-lg-5">
          <select aria-label="Filter expenses by category" className="form-select" value={filters.category} onChange={event=>setFilters(v=>({...v,category:event.target.value}))}>
            <option value="">All expense categories</option>{categories.map(category=><option key={category} value={category}>{category}</option>)}
          </select>
        </div>
      </div>
      <details className="filter-details mt-3">
        <summary><i className="bi bi-calendar3 me-2"></i>Filter by date <span className="text-secondary fw-normal">(optional)</span></summary>
        <div className="row g-2 align-items-end pt-3">
          <div className="col-sm-5">
            <label htmlFor="expense-date-from" className="form-label small">From</label>
            <input id="expense-date-from" type="date" className="form-control" value={filters.startDate} onChange={event=>setFilters(v=>({...v,startDate:event.target.value}))}/>
          </div>
          <div className="col-sm-5">
            <label htmlFor="expense-date-to" className="form-label small">To</label>
            <input id="expense-date-to" type="date" className="form-control" value={filters.endDate} onChange={event=>setFilters(v=>({...v,endDate:event.target.value}))}/>
          </div>
          <div className="col-sm-2">
            <button type="button" className="btn btn-outline-secondary w-100" onClick={()=>setFilters(v=>({...v,startDate:"",endDate:""}))}>Clear dates</button>
          </div>
        </div>
      </details>
      {Object.values(filters).some(Boolean)&&<div className="d-flex justify-content-end mt-3"><button type="button" className="btn btn-sm btn-light border" onClick={()=>setFilters({search:"",category:"",startDate:"",endDate:""})}>Clear all filters</button></div>}
    </div></div>

    <div className="card border-0 shadow-sm"><div className="card-body">
      <div className="d-flex justify-content-between align-items-center small text-secondary mb-2"><span>{expenses.length} expense{expenses.length===1?"":"s"} shown</span><span>Amounts in INR (₹)</span></div>
      <DynamicTable
        tableKey="expenses.list"
        autoOpenSettings={tableCustomizeRequested}
        rows={expenses}
        getRowKey={expense=>expense._id}
        columns={columns}
        loading={loading}
        emptyText={Object.values(filters).some(Boolean)?"No expenses match these filters. Clear filters to see all expenses.":"No expenses recorded yet. Select Add expense to record your first business cost."}
        actionColumn={{
          label:"Actions",
          locked:true,
          render:expense=>(
            <div className="d-flex gap-1 justify-content-end">
              <button className="btn btn-sm btn-light border" onClick={()=>navigate("/edit-expense/"+expense._id)} title="Edit expense"><i className="bi bi-pencil me-1"></i>Edit</button>
              <button className="btn btn-sm btn-outline-danger" onClick={()=>remove(expense)} title="Delete expense"><i className="bi bi-trash me-1"></i>Delete</button>
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
