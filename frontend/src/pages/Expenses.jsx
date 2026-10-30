import BusinessPageHeader from "../components/BusinessPageHeader";
import React,{useCallback,useEffect,useMemo,useRef,useState} from "react";
import {getExpenses,getExpenseSummary,deleteExpense} from "../services/api";
import {useNavigate,useSearchParams} from "react-router-dom";
import DynamicTable from "../components/DynamicTable";
import {EXPENSE_FORM_FIELDS} from "../config/noCodeCatalog";
import {useFormConfiguration} from "../hooks/useFormConfiguration";

const EXPENSE_PAGE_SIZE=10;
const EXPENSE_EXPORT_PAGE_SIZE=100;

const money=v=>"₹"+Number(v||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});

export default function Expenses(){
  const navigate=useNavigate();
  const [searchParams,setSearchParams]=useSearchParams();
  const expenseFormConfig=useFormConfiguration("expenses.form",EXPENSE_FORM_FIELDS);
  const [expenses,setExpenses]=useState([]);
  const [summary,setSummary]=useState(null);
  const [summaryError,setSummaryError]=useState("");
  const [filters,setFilters]=useState({search:"",category:"",startDate:"",endDate:""});
  const [searchInput,setSearchInput]=useState("");
  const [loading,setLoading]=useState(true);
  const [listError,setListError]=useState("");
  const [actionError,setActionError]=useState("");
  const expenseListRequestRef=useRef(0);
  const [tableCustomizeRequested,setTableCustomizeRequested]=useState(false);
  const [currentPage,setCurrentPage]=useState(1);
  const [pagination,setPagination]=useState({page:1,pages:1,total:0});
  const [availableCategories,setAvailableCategories]=useState([]);
  const [exporting,setExporting]=useState(false);

  useEffect(()=>{
    if(searchParams.get("customize")==="table"){
      setTableCustomizeRequested(true);
      searchParams.delete("customize");
      setSearchParams(searchParams,{replace:true});
    }
  },[searchParams,setSearchParams]);

  const load=useCallback(async()=>{
    const requestId=++expenseListRequestRef.current;
    setLoading(true);
    setListError("");

    const [listResult,summaryResult]=await Promise.allSettled([
      getExpenses({...filters,page:currentPage,limit:EXPENSE_PAGE_SIZE}),
      getExpenseSummary(filters)
    ]);

    if(requestId!==expenseListRequestRef.current)return;

    if(listResult.status==="fulfilled"){
      const list=listResult.value;
      const pages=Math.max(1,Number(list.data?.pages)||1);
      const total=Math.max(0,Number(list.data?.total)||0);
      setPagination({page:Math.min(currentPage,pages),pages,total});
      if(currentPage>pages){
        // The current page may disappear after a delete or filter change.
        // Keep the previously loaded rows until the corrected page is fetched.
        setCurrentPage(pages);
      }else{
        setExpenses(Array.isArray(list.data?.expenses)?list.data.expenses:[]);
      }
    }else{
      const requestError=listResult.reason;
      setListError(requestError.response?.data?.message||"Unable to load expenses.");
    }

    if(summaryResult.status==="fulfilled"){
      setSummary(summaryResult.value.data||null);
      setSummaryError("");
    }else{
      setSummaryError(summaryResult.reason?.response?.data?.message||"Expense summary could not be refreshed.");
    }

    setLoading(false);
  },[filters,currentPage]);

  useEffect(()=>{
    const timer=window.setTimeout(()=>{
      setCurrentPage(1);
      setFilters(current=>current.search===searchInput.trim()?current:{...current,search:searchInput.trim()});
    },250);
    return()=>window.clearTimeout(timer);
  },[searchInput]);

  useEffect(()=>{
    load();
    return()=>{expenseListRequestRef.current+=1;};
  },[load]);

  useEffect(()=>{
    let cancelled=false;
    getExpenseSummary({}).then(response=>{
      if(!cancelled){
        const categories=(response.data?.categoryBreakdown||[])
          .map(item=>String(item?._id||"").trim())
          .filter(Boolean)
          .sort((a,b)=>a.localeCompare(b));
        setAvailableCategories(categories);
      }
    }).catch(()=>{});
    return()=>{cancelled=true;};
  },[]);

  const remove=async expense=>{
    if(!window.confirm("Delete this expense?"))return;
    try{
      setActionError("");
      await deleteExpense(expense._id);
      await load();
    }catch(e){
      setActionError(e.response?.data?.message||"Unable to delete expense.");
    }
  };

  const exportAllExpenses=async()=>{
    try{
      setExporting(true);
      setActionError("");
      const first=await getExpenses({...filters,page:1,limit:EXPENSE_EXPORT_PAGE_SIZE});
      const allExpenses=Array.isArray(first.data?.expenses)?[...first.data.expenses]:[];
      const pages=Math.max(1,Number(first.data?.pages)||1);

      for(let firstPage=2;firstPage<=pages;firstPage+=4){
        const pageNumbers=Array.from(
          {length:Math.min(4,pages-firstPage+1)},
          (_,index)=>firstPage+index
        );
        const responses=await Promise.all(pageNumbers.map(page=>
          getExpenses({...filters,page,limit:EXPENSE_EXPORT_PAGE_SIZE})
        ));
        responses.forEach(response=>{
          if(Array.isArray(response.data?.expenses))allExpenses.push(...response.data.expenses);
        });
      }

      const exportRows=allExpenses.map(expense=>({
        Date:expense.date?new Date(expense.date).toLocaleDateString("en-IN"):"",
        Description:expense.title||expense.description||"",
        Category:expense.category||"",
        Vendor:expense.vendor||"",
        Payment:expense.paymentMethod||"",
        Customer:expense.clientId?.companyName||expense.clientId?.name||"",
        Invoice:expense.orderId?.orderNumber||"",
        Amount:Number(expense.amount||0),
        Tax:Number(expense.taxAmount||0),
        Total:Number(expense.amount||0)+Number(expense.taxAmount||0)
      }));
      const XLSX=await import("xlsx");
      const worksheet=XLSX.utils.json_to_sheet(exportRows);
      const workbook=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook,worksheet,"Expenses");
      XLSX.writeFile(workbook,"expenses_report.xlsx");
    }catch(e){
      setActionError(e.response?.data?.message||"Unable to export expenses.");
    }finally{
      setExporting(false);
    }
  };

  const hasActiveExpenseFilters=Boolean(
    filters.search.trim()||filters.category||filters.startDate||filters.endDate||searchInput.trim()
  );
  const clearExpenseFilters=()=>{
    setSearchInput("");
    setFilters({search:"",category:"",startDate:"",endDate:""});
    setCurrentPage(1);
  };

  const customColumns=expenseFormConfig.fields.filter(field=>field.custom).map(field=>({
    key:field.key,
    label:field.label,
    render:expense=>expense.customFields?.[field.key]??""
  }));

  const columns=[
    {key:"date",label:"Date",sortKey:"date",render:expense=>expense.date?new Date(expense.date).toLocaleDateString("en-IN"):""},
    {key:"title",label:"Description",sortKey:"title",render:expense=>expense.title||expense.description||""},
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
      <button type="button" className="btn btn-light border" onClick={exportAllExpenses} disabled={exporting}>
        {exporting?<span className="spinner-border spinner-border-sm me-2"/>:<i className="bi bi-download me-2"></i>}
        {exporting?"Preparing export...":"Export Excel"}
      </button>
      <button type="button" className="btn btn-primary" onClick={()=>navigate("/add-expense")}><i className="bi bi-plus-lg me-2"></i>Add expense</button>
    </BusinessPageHeader>

    {listError&&(
      <div className="alert alert-danger d-flex flex-wrap align-items-center gap-2" role="alert">
        <div className="flex-grow-1">
          <div className="fw-semibold">Expenses could not be refreshed.</div>
          <div className="small">{expenses.length?"Showing the last loaded expense records below.":listError}</div>
        </div>
        <button type="button" className="btn btn-outline-danger btn-sm" onClick={load} disabled={loading}>
          {loading?"Refreshing…":"Try again"}
        </button>
      </div>
    )}
    {actionError&&<div className="alert alert-danger d-flex align-items-center gap-2" role="alert"><span className="flex-grow-1">{actionError}</span><button type="button" className="btn-close" aria-label="Dismiss message" onClick={()=>setActionError("")}/></div>}
    {summaryError&&<div className="alert alert-warning" role="status">Expense summary figures could not be refreshed. Your expense list remains available.</div>}

    <div className="row g-3 mb-3">
      <div className="col-md-4"><div className="card border-0 shadow-sm h-100"><div className="card-body"><div className="text-muted small">Total spent (incl. tax)</div><div className="fs-4 fw-bold">{summary?money(summary.totalSpent):"—"}</div><div className="small text-muted">Expense amount plus recorded tax</div></div></div></div>
      <div className="col-md-4"><div className="card border-0 shadow-sm h-100"><div className="card-body"><div className="text-muted small">Number of expenses</div><div className="fs-4 fw-bold">{summary?summary.expenseCount||0:"—"}</div></div></div></div>
      <div className="col-md-4"><div className="card border-0 shadow-sm h-100"><div className="card-body"><div className="text-muted small">Average total cost</div><div className="fs-4 fw-bold">{summary?money(summary.averageTotalSpent):"—"}</div><div className="small text-muted">Includes recorded tax</div></div></div></div>
    </div>

    <div className="card border-0 shadow-sm mb-3"><div className="card-body">
      <div className="row g-2 align-items-center">
        <div className="col-lg-7">
          <label className="visually-hidden" htmlFor="expense-search">Search expenses</label>
          <div className="input-group">
            <span className="input-group-text bg-white"><i className="bi bi-search"></i></span>
            <input id="expense-search" className="form-control" placeholder="Search by description or supplier" value={searchInput} onChange={event=>setSearchInput(event.target.value)}/>
            {searchInput&&<button type="button" className="btn btn-light border" onClick={()=>{setSearchInput("");setFilters(v=>({...v,search:""}));setCurrentPage(1);}}>Clear</button>}
          </div>
        </div>
        <div className="col-lg-5">
          <select aria-label="Filter expenses by category" className="form-select" value={filters.category} onChange={event=>{setFilters(v=>({...v,category:event.target.value}));setCurrentPage(1);}}>
            <option value="">All expense categories</option>{availableCategories.map(category=><option key={category} value={category}>{category}</option>)}
          </select>
        </div>
      </div>
      <details className="filter-details mt-3">
        <summary><i className="bi bi-calendar3 me-2"></i>Filter by date <span className="text-secondary fw-normal">(optional)</span></summary>
        <div className="row g-2 align-items-end pt-3">
          <div className="col-sm-5">
            <label htmlFor="expense-date-from" className="form-label small">From</label>
            <input id="expense-date-from" type="date" className="form-control" value={filters.startDate} onChange={event=>{setFilters(v=>({...v,startDate:event.target.value}));setCurrentPage(1);}}/>
          </div>
          <div className="col-sm-5">
            <label htmlFor="expense-date-to" className="form-label small">To</label>
            <input id="expense-date-to" type="date" className="form-control" value={filters.endDate} onChange={event=>{setFilters(v=>({...v,endDate:event.target.value}));setCurrentPage(1);}}/>
          </div>
          <div className="col-sm-2">
            <button type="button" className="btn btn-outline-secondary w-100" onClick={()=>{setFilters(v=>({...v,startDate:"",endDate:""}));setCurrentPage(1);}}>Clear dates</button>
          </div>
        </div>
      </details>
      {hasActiveExpenseFilters&&<div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3">
        <span className="small text-secondary">Filters are active</span>
        <button type="button" className="btn btn-sm btn-light border" onClick={clearExpenseFilters}>Clear all filters</button>
      </div>}
    </div></div>

    <div className="card border-0 shadow-sm"><div className="card-body">
      <div className="d-flex justify-content-between align-items-center small text-secondary mb-2"><span>Showing {expenses.length} on this page · {pagination.total} matching expense{pagination.total===1?"":"s"}</span><span>Amounts in INR (₹)</span></div>
      <DynamicTable
        tableKey="expenses.list"
        autoOpenSettings={tableCustomizeRequested}
        rows={expenses}
        getRowKey={expense=>expense._id}
        columns={columns}
        loading={loading}
        emptyText={listError&&!expenses.length?"Expense records could not be loaded. Try again above.":hasActiveExpenseFilters?"No expenses match these filters. Clear filters to see all expenses.":"No expenses yet. Add your first business cost to keep your spending up to date."}
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
          return <tr>{visibleColumns.map((column,index)=><td key={column.key} className={column.key==="amount"?"fw-bold":index===0?"text-end fw-bold":""}>{column.key==="amount"?money(total):index===0?"Page total:":""}</td>)}{hasActions&&<td></td>}</tr>;
        }}
      />
      {pagination.pages>1&&(
        <nav aria-label="Expense pages" className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3">
          <div className="small text-secondary">
            Showing {(currentPage-1)*EXPENSE_PAGE_SIZE+1}–{Math.min(currentPage*EXPENSE_PAGE_SIZE,pagination.total)} of {pagination.total} expenses
          </div>
          <ul className="pagination mb-0">
            <li className={`page-item ${currentPage===1?"disabled":""}`}>
              <button type="button" className="page-link" disabled={currentPage===1} onClick={()=>setCurrentPage(page=>Math.max(1,page-1))}>Previous</button>
            </li>
            {Array.from(
              {length:Math.min(7,pagination.pages)},
              (_,index)=>Math.max(1,Math.min(currentPage-3,pagination.pages-6))+index
            ).map(page=>(
              <li key={page} className={`page-item ${currentPage===page?"active":""}`}>
                <button type="button" className="page-link" aria-current={currentPage===page?"page":undefined} onClick={()=>setCurrentPage(page)}>{page}</button>
              </li>
            ))}
            <li className={`page-item ${currentPage===pagination.pages?"disabled":""}`}>
              <button type="button" className="page-link" disabled={currentPage===pagination.pages} onClick={()=>setCurrentPage(page=>Math.min(pagination.pages,page+1))}>Next</button>
            </li>
          </ul>
        </nav>
      )}
    </div></div>
  </div>;
}
