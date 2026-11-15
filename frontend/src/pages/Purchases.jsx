import React,{useCallback,useEffect,useMemo,useRef,useState} from "react";
import axios from "axios";
import {useNavigate,useSearchParams} from "react-router-dom";
import BusinessPageHeader from "../components/BusinessPageHeader";
import DynamicTable from "../components/DynamicTable";
import {fetchAllProducts} from "../services/productService";
import "./Purchases.css";

const API=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const auth=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});
const money=value=>"₹"+Number(value||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
const today=()=>new Date().toISOString().slice(0,10);
const newItem=()=>({productId:"",quantity:"",unit:"PCS",unitCost:"",discountRate:0,taxRate:0});
const EMPTY_FORM={supplierId:"",supplierInvoiceNumber:"",purchaseDate:today(),dueDate:"",notes:"",items:[newItem()]};
const formatDate=value=>value?new Date(value).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}):"—";
const paymentStatus=item=>Number(item.dueAmount||0)<=0?"Paid":Number(item.paidAmount||0)>0?"Partial":"Unpaid";

export default function Purchases(){
 const navigate=useNavigate();
 const [searchParams,setSearchParams]=useSearchParams();
 const [purchases,setPurchases]=useState([]);
 const [suppliers,setSuppliers]=useState([]);
 const [products,setProducts]=useState([]);
 const [loading,setLoading]=useState(true);
 const [suppliersLoading,setSuppliersLoading]=useState(true);
 const [productsLoading,setProductsLoading]=useState(true);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [search,setSearch]=useState("");
 const [status,setStatus]=useState("Received");
 const [supplierFilter,setSupplierFilter]=useState("");
 const [pagination,setPagination]=useState({page:1,pages:1,total:0});
 const [summary,setSummary]=useState({purchaseCount:0,totalPurchased:0,totalPaid:0,outstanding:0});
 const [formOpen,setFormOpen]=useState(false);
 const [saving,setSaving]=useState(false);
 const [formError,setFormError]=useState("");
 const [draft,setDraft]=useState(EMPTY_FORM);
 const [initialPayment,setInitialPayment]=useState({amount:"",method:"Bank Transfer",reference:""});
 const [draggedIndex,setDraggedIndex]=useState(null);
 const [dropIndex,setDropIndex]=useState(null);
 const [viewingPurchase,setViewingPurchase]=useState(null);
 const [viewLoading,setViewLoading]=useState(false);
 const [paymentPurchase,setPaymentPurchase]=useState(null);
 const [payment,setPayment]=useState({amount:"",method:"Bank Transfer",reference:"",paidAt:today(),note:""});
 const [paymentSaving,setPaymentSaving]=useState(false);
 const [pageFeedback,setPageFeedback]=useState("");

 const loadPurchases=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const response=await axios.get(API+"/api/purchases",{...auth(),params:{search:search.trim(),status,supplierId:supplierFilter,page:pagination.page,limit:25}});
   setPurchases(Array.isArray(response.data?.purchases)?response.data.purchases:[]);
   setPagination(previous=>({...previous,...(response.data?.pagination||{})}));
   setSummary(response.data?.summary||{purchaseCount:0,totalPurchased:0,totalPaid:0,outstanding:0});
  }catch(loadError){
   setError(loadError.response?.data?.message||"Purchases could not be loaded. Please try again.");
  }finally{setLoading(false);}
 },[search,status,supplierFilter,pagination.page]);

 useEffect(()=>{loadPurchases();},[loadPurchases]);

 useEffect(()=>{
  let active=true;
  setSuppliersLoading(true);
  axios.get(API+"/api/suppliers",{...auth(),params:{status:"Active",limit:100}})
   .then(response=>{if(active)setSuppliers(Array.isArray(response.data?.suppliers)?response.data.suppliers:[]);})
   .catch(loadError=>{if(active)setError(loadError.response?.data?.message||"Suppliers could not be loaded.");})
   .finally(()=>{if(active)setSuppliersLoading(false);});
  return()=>{active=false;};
 },[]);

 useEffect(()=>{
  let active=true;
  setProductsLoading(true);
  fetchAllProducts({sort:"productName",order:"asc"})
   .then(response=>{if(active)setProducts(Array.isArray(response.data?.products)?response.data.products:[]);})
   .catch(loadError=>{if(active)setError(loadError.response?.data?.message||"Products could not be loaded.");})
   .finally(()=>{if(active)setProductsLoading(false);});
  return()=>{active=false;};
 },[]);

 const openNew=useCallback(supplierId=>{
  setViewingPurchase(null);
  setFormError("");
  setDraft({...EMPTY_FORM,supplierId:supplierId||"",items:[newItem()]});
  setInitialPayment({amount:"",method:"Bank Transfer",reference:""});
  setFormOpen(true);
 },[]);

 useEffect(()=>{
  const action=searchParams.get("action");
  const supplierId=searchParams.get("supplierId");
  if(action!=="new"&&!supplierId)return;
  const params=new URLSearchParams(searchParams);
  params.delete("action");params.delete("supplierId");
  setSearchParams(params,{replace:true});
  openNew(supplierId||"");
 },[searchParams,setSearchParams,openNew]);

 const openPurchase=useCallback(async id=>{
  setViewLoading(true);setViewingPurchase(null);
  try{
   const response=await axios.get(API+"/api/purchases/"+encodeURIComponent(id),auth());
   setViewingPurchase(response.data||null);
  }catch(loadError){
   setError(loadError.response?.data?.message||"Purchase details could not be opened.");
  }finally{setViewLoading(false);}
 },[]);

 const openPurchaseRequestRef=useRef("");
 useEffect(()=>{
  const id=searchParams.get("openPurchase");
  if(!id){openPurchaseRequestRef.current="";return;}
  if(openPurchaseRequestRef.current===id)return;
  openPurchaseRequestRef.current=id;
  openPurchase(id).finally(()=>{
   const params=new URLSearchParams(searchParams);
   params.delete("openPurchase");
   setSearchParams(params,{replace:true});
  });
 },[searchParams,setSearchParams,openPurchase]);

 const updateDraft=(key,value)=>setDraft(previous=>({...previous,[key]:value}));
 const updateItem=(index,key,value)=>{
  setDraft(previous=>({...previous,items:previous.items.map((item,i)=>i===index?{...item,[key]:value}:item)}));
 };
 const selectProduct=(index,productId)=>{
  const product=products.find(item=>String(item._id)===String(productId));
  setDraft(previous=>({...previous,items:previous.items.map((item,i)=>i!==index?item:{
   ...item,
   productId,
   unit:product?.stockUnit||"PCS",
   unitCost:product?String(product.purchasePrice??product.rate??0):""
  })}));
 };
 const addItem=()=>setDraft(previous=>({...previous,items:[...previous.items,newItem()]}));
 const removeItem=index=>setDraft(previous=>({...previous,items:previous.items.length<=1?previous.items:previous.items.filter((_,i)=>i!==index)}));
 const moveItem=(from,to)=>{
  if(from===to||from<0||to<0||from>=draft.items.length||to>=draft.items.length)return;
  setDraft(previous=>{
   const items=previous.items.slice();
   const [moved]=items.splice(from,1);items.splice(to,0,moved);
   return {...previous,items};
  });
 };
 const dropItem=(event,to)=>{
  event.preventDefault();
  const raw=event.dataTransfer?.getData("text/plain");
  const from=raw===""||raw===undefined?draggedIndex:Number(raw);
  if(Number.isInteger(from))moveItem(from,to);
  setDraggedIndex(null);setDropIndex(null);
 };

 const totals=useMemo(()=>{
  const lines=draft.items.map(item=>{
   const quantity=Math.max(0,Number(item.quantity||0));
   const rate=Math.max(0,Number(item.unitCost||0));
   const discountRate=Math.min(100,Math.max(0,Number(item.discountRate||0)));
   const taxRate=Math.min(100,Math.max(0,Number(item.taxRate||0)));
   const subtotal=Math.round((quantity*rate+Number.EPSILON)*100)/100;
   const discount=Math.round((subtotal*discountRate/100+Number.EPSILON)*100)/100;
   const taxable=Math.round((subtotal-discount+Number.EPSILON)*100)/100;
   const tax=Math.round((taxable*taxRate/100+Number.EPSILON)*100)/100;
   return {subtotal,discount,tax,total:Math.round((taxable+tax+Number.EPSILON)*100)/100};
  });
  const sum=key=>Math.round((lines.reduce((total,line)=>total+line[key],0)+Number.EPSILON)*100)/100;
  return {subtotal:sum("subtotal"),discount:sum("discount"),tax:sum("tax"),total:sum("total")};
 },[draft.items]);

 const savePurchase=async event=>{
  event.preventDefault();setFormError("");setPageFeedback("");
  if(!draft.supplierId){setFormError("Choose the supplier for this purchase.");return;}
  if(!draft.items.length||draft.items.some(item=>!item.productId||Number(item.quantity)<=0)){
   setFormError("Choose a product and enter a quantity greater than zero on every line.");return;
  }
  const selectedSupplier=suppliers.find(item=>String(item._id)===String(draft.supplierId));
  if(!selectedSupplier){setFormError("Choose an active supplier.");return;}
  try{
   setSaving(true);
   const response=await axios.post(API+"/api/purchases",{
    supplierId:draft.supplierId,
    supplierInvoiceNumber:draft.supplierInvoiceNumber,
    purchaseDate:draft.purchaseDate,
    dueDate:draft.dueDate||null,
    notes:draft.notes,
    items:draft.items.map(item=>({
     productId:item.productId,quantity:Number(item.quantity),unit:item.unit,
     unitCost:Number(item.unitCost),discountRate:Number(item.discountRate||0),taxRate:Number(item.taxRate||0)
    })),
    initialPayment:{
     amount:Number(initialPayment.amount||0),
     method:initialPayment.method,
     reference:initialPayment.reference
    }
   },auth());
   setFormOpen(false);
   setMessage(response.data?.message||"Purchase received successfully.");
   setPagination(previous=>({...previous,page:1}));
   setSearch("");setSupplierFilter("");setStatus("Received");
   await loadPurchases();
  }catch(saveError){
   setFormError(saveError.response?.data?.message||"Purchase could not be received. Check the details and try again.");
  }finally{setSaving(false);}
 };

 const startPayment=purchase=>{
  setPaymentPurchase(purchase);
  setPayment({amount:String(purchase.dueAmount||""),method:"Bank Transfer",reference:"",paidAt:today(),note:""});
 };
 const savePayment=async event=>{
  event.preventDefault();
  if(!paymentPurchase)return;
  try{
   setPaymentSaving(true);setPageFeedback("");
   const response=await axios.post(API+"/api/purchases/"+encodeURIComponent(paymentPurchase._id)+"/payments",{
    ...payment,amount:Number(payment.amount)
   },auth());
   setPaymentPurchase(null);
   setMessage(response.data?.message||"Supplier payment recorded.");
   if(viewingPurchase?.purchase?._id===paymentPurchase._id)await openPurchase(paymentPurchase._id);
   await loadPurchases();
  }catch(saveError){
   setPageFeedback(saveError.response?.data?.message||"Payment could not be recorded.");
  }finally{setPaymentSaving(false);}
 };

 const cancelPurchase=async purchase=>{
  if(Number(purchase.paidAmount||0)>0||(purchase.payments||[]).length>0){
   setPageFeedback("This purchase has supplier payments recorded. A refund must be handled and reconciled before cancellation.");
   return;
  }
  if(!window.confirm("Cancel this purchase? The app will reverse only the stock that is still available. If any of these units have already been sold or used, cancellation will be blocked."))return;
  try{
   setPageFeedback("");
   const response=await axios.post(API+"/api/purchases/"+encodeURIComponent(purchase._id)+"/cancel",{},auth());
   setMessage(response.data?.message||"Purchase cancelled.");
   if(viewingPurchase?.purchase?._id===purchase._id)await openPurchase(purchase._id);
   await loadPurchases();
  }catch(cancelError){
   setPageFeedback(cancelError.response?.data?.message||"Purchase could not be cancelled.");
  }
 };

 const columns=[
  {key:"purchaseNumber",label:"Purchase No.",render:item=><button type="button" className="btn btn-link p-0 text-decoration-none fw-semibold" onClick={()=>openPurchase(item._id)}>{item.purchaseNumber}</button>},
  {key:"supplier",label:"Supplier",render:item=><button type="button" className="btn btn-link p-0 text-decoration-none" onClick={()=>navigate("/suppliers?openSupplier="+encodeURIComponent(item.supplierId?._id||item.supplierId))}>{item.supplierName||item.supplierId?.name||"Supplier"}</button>},
  {key:"supplierInvoiceNumber",label:"Supplier bill no.",visible:false},
  {key:"purchaseDate",label:"Date",render:item=>formatDate(item.purchaseDate)},
  {key:"grandTotal",label:"Total",render:item=>money(item.grandTotal)},
  {key:"paidAmount",label:"Paid",visible:false,render:item=>money(item.paidAmount)},
  {key:"dueAmount",label:"Outstanding",render:item=><strong className={Number(item.dueAmount)>0?"text-danger":""}>{money(item.dueAmount)}</strong>},
  {key:"paymentStatus",label:"Payment",render:item=><span className={"purchase-payment-status is-"+paymentStatus(item).toLowerCase()}>{paymentStatus(item)}</span>},
  {key:"status",label:"Status",render:item=><span className={"purchase-state "+(item.status==="Cancelled"?"is-cancelled":"")}>{item.status}</span>}
 ];

 return <div className="container-fluid py-3 purchases-page">
  <BusinessPageHeader eyebrow="INVENTORY IN" title="Purchases" description="Record supplier bills, receive products into stock and keep track of what you still owe." className="mb-3">
   <button type="button" className="btn btn-light border" onClick={()=>navigate("/suppliers")}><i className="bi bi-truck me-2"/>Suppliers</button>
   <button type="button" className="btn btn-primary" onClick={()=>openNew("")}><i className="bi bi-plus-lg me-2"/>Record purchase</button>
  </BusinessPageHeader>

  {error&&<div className="alert alert-warning" role="alert">{error}<button type="button" className="btn-close float-end" aria-label="Dismiss" onClick={()=>setError("")}/></div>}
  {message&&<div className="alert alert-success d-flex align-items-center gap-2" role="status"><i className="bi bi-check-circle-fill"/><span>{message}</span><button type="button" className="btn-close ms-auto" aria-label="Dismiss" onClick={()=>setMessage("")}/></div>}
  {pageFeedback&&<div className="alert alert-danger" role="alert">{pageFeedback}<button type="button" className="btn-close float-end" aria-label="Dismiss" onClick={()=>setPageFeedback("")}/></div>}

  <div className="row g-3 mb-3">
   <div className="col-sm-4"><div className="purchase-summary-card"><span>Received purchases</span><strong>{Number(summary.purchaseCount||0).toLocaleString("en-IN")}</strong></div></div>
   <div className="col-sm-4"><div className="purchase-summary-card"><span>Total purchased</span><strong>{money(summary.totalPurchased)}</strong></div></div>
   <div className="col-sm-4"><div className="purchase-summary-card"><span>Supplier balance due</span><strong className="text-danger">{money(summary.outstanding)}</strong></div></div>
  </div>

  <section className="card border-0 shadow-sm">
   <div className="card-body">
    <div className="row g-2 align-items-center mb-3">
     <div className="col-lg-5"><div className="input-group"><span className="input-group-text bg-white"><i className="bi bi-search"/></span><input className="form-control" value={search} onChange={event=>{setSearch(event.target.value);setPagination(previous=>({...previous,page:1}));}} placeholder="Search purchase or supplier" aria-label="Search purchases"/></div></div>
     <div className="col-lg-3"><select className="form-select" value={supplierFilter} onChange={event=>{setSupplierFilter(event.target.value);setPagination(previous=>({...previous,page:1}));}} aria-label="Filter by supplier"><option value="">All suppliers</option>{suppliers.map(item=><option key={item._id} value={item._id}>{item.name}</option>)}</select></div>
     <div className="col-lg-2"><select className="form-select" value={status} onChange={event=>{setStatus(event.target.value);setPagination(previous=>({...previous,page:1}));}} aria-label="Filter purchase status"><option value="Received">Received</option><option value="Cancelled">Cancelled</option><option value="">All status</option></select></div>
     <div className="col-lg-2 text-lg-end"><span className="small text-secondary">{pagination.total} purchase records</span></div>
    </div>
    <DynamicTable
     tableKey="purchases.list"
     rows={purchases}
     getRowKey={item=>item._id}
     loading={loading}
     columns={columns}
     emptyText="No purchases found. Record a supplier purchase to add received quantities to product stock."
     actionColumn={{label:"Actions",locked:true,render:item=><div className="d-flex justify-content-end flex-wrap gap-1">
      <button type="button" className="btn btn-sm btn-light border" onClick={()=>openPurchase(item._id)} title="View purchase"><i className="bi bi-eye"/></button>
      {item.status==="Received"&&Number(item.dueAmount)>0&&<button type="button" className="btn btn-sm btn-light border" onClick={()=>startPayment(item)} title="Record supplier payment"><i className="bi bi-cash-coin"/></button>}
      {item.status==="Received"&&<button type="button" className="btn btn-sm btn-outline-danger" onClick={()=>cancelPurchase(item)} disabled={Number(item.paidAmount||0)>0} title={Number(item.paidAmount||0)>0?"Supplier payments must be refunded and reconciled before cancellation":"Cancel purchase"}><i className="bi bi-x-circle"/></button>}
     </div>}}
    />
    {pagination.pages>1&&<div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-3">
     <span className="small text-secondary">Page {pagination.page} of {pagination.pages}</span>
     <div className="btn-group"><button type="button" className="btn btn-sm btn-light border" disabled={pagination.page<=1} onClick={()=>setPagination(previous=>({...previous,page:previous.page-1}))}>Previous</button><button type="button" className="btn btn-sm btn-light border" disabled={pagination.page>=pagination.pages} onClick={()=>setPagination(previous=>({...previous,page:previous.page+1}))}>Next</button></div>
    </div>}
   </div>
  </section>

  {formOpen&&<div className="purchase-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!saving)setFormOpen(false);}}>
   <form className="purchase-modal" role="dialog" aria-modal="true" aria-labelledby="purchase-form-title" onSubmit={savePurchase}>
    <header className="purchase-modal-header"><div><span className="small text-primary fw-semibold text-uppercase">SUPPLIER BILL</span><h2 id="purchase-form-title">Receive a purchase</h2><p>Stock increases only after you save this purchase.</p></div><button type="button" className="btn-close" aria-label="Close" onClick={()=>setFormOpen(false)} disabled={saving}/></header>
    {formError&&<div className="alert alert-danger mx-4 mt-3 mb-0" role="alert">{formError}</div>}
    <div className="purchase-modal-body">
     <section className="purchase-section">
      <h3>Supplier and bill details</h3>
      <div className="row g-3">
       <div className="col-md-6"><label className="form-label" htmlFor="purchase-supplier">Supplier *</label><select id="purchase-supplier" className="form-select" value={draft.supplierId} onChange={event=>updateDraft("supplierId",event.target.value)} disabled={suppliersLoading} required><option value="">{suppliersLoading?"Loading suppliers...":"Choose supplier"}</option>{suppliers.map(item=><option key={item._id} value={item._id}>{item.name}{item.gstin?" · "+item.gstin:""}</option>)}</select>{!suppliersLoading&&!suppliers.length&&<small className="text-warning">Add an active supplier first.</small>}</div>
       <div className="col-md-6"><label className="form-label" htmlFor="purchase-bill">Supplier invoice / bill number</label><input id="purchase-bill" className="form-control" maxLength={80} value={draft.supplierInvoiceNumber} onChange={event=>updateDraft("supplierInvoiceNumber",event.target.value)} placeholder="As printed on supplier's bill"/></div>
       <div className="col-md-6"><label className="form-label" htmlFor="purchase-date">Purchase date *</label><input id="purchase-date" type="date" className="form-control" value={draft.purchaseDate} onChange={event=>updateDraft("purchaseDate",event.target.value)} required/></div>
       <div className="col-md-6"><label className="form-label" htmlFor="purchase-due-date">Payment due date</label><input id="purchase-due-date" type="date" className="form-control" value={draft.dueDate} onChange={event=>updateDraft("dueDate",event.target.value)}/></div>
      </div>
     </section>
     <section className="purchase-section">
      <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-2"><div><h3 className="mb-1">Products received</h3><p className="small text-secondary mb-0">Select catalogue products and enter the quantities actually received.</p></div><button type="button" className="btn btn-sm btn-light border" onClick={addItem}><i className="bi bi-plus-lg me-1"/>Add product</button></div>
      {productsLoading?<div className="text-center py-4"><span className="spinner-border spinner-border-sm me-2"/>Loading products...</div>
       :!products.length?<div className="purchase-empty-products">No products in your catalogue yet. <button type="button" className="btn btn-link p-0" onClick={()=>navigate("/products?action=new")}>Add a product</button> before recording a purchase.</div>
       :<div className="purchase-lines">
        {draft.items.map((item,index)=>{
         const product=products.find(entry=>String(entry._id)===String(item.productId));
         const lineTotal=Math.max(0,Number(item.quantity||0))*Math.max(0,Number(item.unitCost||0))*(1-Math.min(100,Math.max(0,Number(item.discountRate||0)))/100)*(1+Math.min(100,Math.max(0,Number(item.taxRate||0)))/100);
         return <article key={index} className={"purchase-line "+(dropIndex===index&&draggedIndex!==index?"is-drop-target":"")} onDragOver={event=>{if(draggedIndex!==null&&draggedIndex!==index){event.preventDefault();setDropIndex(index);}}} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget))setDropIndex(current=>current===index?null:current);}} onDrop={event=>dropItem(event,index)}>
          <div className="purchase-line-heading">
           <div className="d-flex align-items-center gap-2"><button type="button" className="btn btn-sm btn-light border purchase-line-grip" draggable aria-label={"Drag to move purchase item "+(index+1)} title="Drag to reorder" onDragStart={event=>{event.dataTransfer?.setData("text/plain",String(index));if(event.dataTransfer)event.dataTransfer.effectAllowed="move";setDraggedIndex(index);setDropIndex(null);}} onDragEnd={()=>{setDraggedIndex(null);setDropIndex(null);}}><i className="bi bi-grip-vertical"/></button><strong>Product {index+1}</strong></div>
           <button type="button" className="btn btn-sm btn-outline-danger" onClick={()=>removeItem(index)} disabled={draft.items.length<=1} title="Remove product"><i className="bi bi-trash"/></button>
          </div>
          <div className="row g-2 align-items-end">
           <div className="col-lg-4"><label className="form-label">Product *</label><select className="form-select" value={item.productId} onChange={event=>selectProduct(index,event.target.value)} required><option value="">Choose a product</option>{products.map(entry=><option key={entry._id} value={entry._id}>{entry.productName} · {entry.productCode}</option>)}</select>{product&&<small className="text-secondary">Current stock: {Number(product.quantity||0).toLocaleString("en-IN")} {product.stockUnit||"PCS"}</small>}</div>
           <div className="col-6 col-lg-2"><label className="form-label">Quantity *</label><input className="form-control" type="number" min="0.0001" step="0.0001" value={item.quantity} onChange={event=>updateItem(index,"quantity",event.target.value)} required/></div>
           <div className="col-6 col-lg-2"><label className="form-label">Unit</label><select className="form-select" value={item.unit} onChange={event=>updateItem(index,"unit",event.target.value)}><option value="PCS">PCS</option><option value="MTR">MTR</option></select></div>
           <div className="col-6 col-lg-2"><label className="form-label">Purchase rate</label><input className="form-control" type="number" min="0" step="0.01" value={item.unitCost} onChange={event=>updateItem(index,"unitCost",event.target.value)} required/></div>
           <div className="col-6 col-lg-2"><label className="form-label">Tax %</label><input className="form-control" type="number" min="0" max="100" step="0.01" value={item.taxRate} onChange={event=>updateItem(index,"taxRate",event.target.value)}/></div>
           <div className="col-6 col-lg-2"><label className="form-label">Discount %</label><input className="form-control" type="number" min="0" max="100" step="0.01" value={item.discountRate} onChange={event=>updateItem(index,"discountRate",event.target.value)}/></div>
           <div className="col-6 col-lg-2"><label className="form-label">Line total</label><div className="purchase-line-total">{money(lineTotal)}</div></div>
          </div>
         </article>;
        })}
       </div>}
     </section>
     <section className="purchase-section">
      <h3>Payment and notes</h3>
      <div className="row g-3">
       <div className="col-md-4"><label className="form-label" htmlFor="purchase-paid">Paid now</label><input id="purchase-paid" className="form-control" type="number" min="0" max={totals.total} step="0.01" value={initialPayment.amount} onChange={event=>setInitialPayment(previous=>({...previous,amount:event.target.value}))}/></div>
       <div className="col-md-4"><label className="form-label" htmlFor="purchase-method">Payment method</label><select id="purchase-method" className="form-select" value={initialPayment.method} onChange={event=>setInitialPayment(previous=>({...previous,method:event.target.value}))}><option>Bank Transfer</option><option>UPI</option><option>Cash</option><option>Cheque</option><option>Bank</option></select></div>
       <div className="col-md-4"><label className="form-label" htmlFor="purchase-reference">Payment reference</label><input id="purchase-reference" className="form-control" value={initialPayment.reference} onChange={event=>setInitialPayment(previous=>({...previous,reference:event.target.value}))}/></div>
       <div className="col-12"><label className="form-label" htmlFor="purchase-notes">Notes</label><textarea id="purchase-notes" className="form-control" rows={2} value={draft.notes} onChange={event=>updateDraft("notes",event.target.value)} placeholder="Optional details for this supplier bill"/></div>
      </div>
     </section>
     <section className="purchase-total-box">
      <div><span>Subtotal</span><strong>{money(totals.subtotal)}</strong></div>
      <div><span>Discount</span><strong>{money(totals.discount)}</strong></div>
      <div><span>Tax</span><strong>{money(totals.tax)}</strong></div>
      <div className="purchase-grand-total"><span>Purchase total</span><strong>{money(totals.total)}</strong></div>
      <small>Saving this purchase will add the received quantities to stock and update the supplier balance.</small>
     </section>
    </div>
    <footer className="purchase-modal-footer"><button type="button" className="btn btn-light border" onClick={()=>setFormOpen(false)} disabled={saving}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving||productsLoading||suppliersLoading||!products.length||!suppliers.length}>{saving?<><span className="spinner-border spinner-border-sm me-2"/>Receiving stock...</>:<><i className="bi bi-box-arrow-in-down me-2"/>Save and receive stock</>}</button></footer>
   </form>
  </div>}

  {(viewingPurchase||viewLoading)&&<div className="purchase-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setViewingPurchase(null);}}>
   {viewLoading?<div className="purchase-view-loading"><span className="spinner-border spinner-border-sm me-2"/>Loading purchase...</div>:viewingPurchase?.purchase&&<section className="purchase-modal purchase-detail-modal" role="dialog" aria-modal="true" aria-labelledby="purchase-detail-title">
    <header className="purchase-modal-header"><div><span className="small text-primary fw-semibold text-uppercase">PURCHASE RECORD</span><h2 id="purchase-detail-title">{viewingPurchase.purchase.purchaseNumber}</h2><p>{viewingPurchase.purchase.supplierName} · {formatDate(viewingPurchase.purchase.purchaseDate)}</p></div><button type="button" className="btn-close" aria-label="Close" onClick={()=>setViewingPurchase(null)}/></header>
    <div className="purchase-modal-body">
     <div className="row g-2 mb-3">
      <div className="col-sm-4"><div className="purchase-detail-stat"><span>Purchase total</span><strong>{money(viewingPurchase.purchase.grandTotal)}</strong></div></div>
      <div className="col-sm-4"><div className="purchase-detail-stat"><span>Paid</span><strong>{money(viewingPurchase.purchase.paidAmount)}</strong></div></div>
      <div className="col-sm-4"><div className="purchase-detail-stat"><span>Outstanding</span><strong className="text-danger">{money(viewingPurchase.purchase.dueAmount)}</strong></div></div>
     </div>
     <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
      <div><strong>Supplier invoice:</strong> {viewingPurchase.purchase.supplierInvoiceNumber||"Not entered"} <span className="text-secondary">· {viewingPurchase.purchase.status}</span></div>
      <button type="button" className="btn btn-sm btn-light border" onClick={()=>{setViewingPurchase(null);navigate("/suppliers?openSupplier="+encodeURIComponent(viewingPurchase.purchase.supplierId?._id||viewingPurchase.purchase.supplierId));}}>Open supplier</button>
     </div>
     <div className="table-responsive"><table className="table align-middle purchase-detail-table"><thead><tr><th>Product</th><th>Quantity</th><th className="text-end">Rate</th><th className="text-end">Total</th></tr></thead><tbody>
      {(viewingPurchase.purchase.items||[]).map(item=><tr key={item._id}><td><button type="button" className="btn btn-link p-0 text-decoration-none" onClick={()=>{setViewingPurchase(null);navigate("/products?openProduct="+encodeURIComponent(item.productId?._id||item.productId));}}>{item.productName}</button><small className="d-block text-secondary">{item.productCode}</small></td><td>{Number(item.quantity||0).toLocaleString("en-IN")} {item.unit}</td><td className="text-end">{money(item.unitCost)}</td><td className="text-end fw-semibold">{money(item.totalAmount)}</td></tr>)}
     </tbody></table></div>
     <section className="purchase-detail-payment-history"><h3>Supplier payments</h3>
      {!viewingPurchase.purchase.payments?.length?<p className="small text-secondary">No payment has been recorded yet.</p>:viewingPurchase.purchase.payments.map(item=><div key={item._id}><span>{formatDate(item.paidAt)} · {item.method}{item.reference?" · "+item.reference:""}</span><strong>{money(item.amount)}</strong></div>)}
     </section>
     {viewingPurchase.movements?.length>0&&<div className="small text-secondary mt-3">{viewingPurchase.movements.length} stock movement(s) recorded for this purchase.</div>}
    </div>
    <footer className="purchase-modal-footer">
     {viewingPurchase.purchase.status==="Received"&&Number(viewingPurchase.purchase.dueAmount)>0&&<button type="button" className="btn btn-light border me-auto" onClick={()=>{const item=viewingPurchase.purchase;setViewingPurchase(null);startPayment(item);}}>Record payment</button>}
     {viewingPurchase.purchase.status==="Received"&&<button type="button" className="btn btn-outline-danger" disabled={Number(viewingPurchase.purchase.paidAmount||0)>0} title={Number(viewingPurchase.purchase.paidAmount||0)>0?"Supplier payments must be refunded and reconciled before cancellation":"Cancel purchase"} onClick={()=>{const item=viewingPurchase.purchase;setViewingPurchase(null);cancelPurchase(item);}}>Cancel purchase</button>}
     <button type="button" className="btn btn-light border" onClick={()=>setViewingPurchase(null)}>Close</button>
    </footer>
   </section>}
  </div>}

  {paymentPurchase&&<div className="purchase-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!paymentSaving)setPaymentPurchase(null);}}>
   <form className="purchase-payment-modal" role="dialog" aria-modal="true" aria-labelledby="purchase-payment-title" onSubmit={savePayment}>
    <header className="purchase-modal-header"><div><span className="small text-primary fw-semibold text-uppercase">SUPPLIER PAYMENT</span><h2 id="purchase-payment-title">Record payment</h2><p>{paymentPurchase.purchaseNumber} · Remaining {money(paymentPurchase.dueAmount)}</p></div><button type="button" className="btn-close" aria-label="Close" onClick={()=>setPaymentPurchase(null)} disabled={paymentSaving}/></header>
    {pageFeedback&&<div className="alert alert-danger mx-4 mt-3 mb-0">{pageFeedback}</div>}
    <div className="purchase-modal-body">
     <div className="mb-3"><label className="form-label" htmlFor="supplier-payment-amount">Payment amount *</label><input id="supplier-payment-amount" className="form-control" type="number" min="0.01" max={paymentPurchase.dueAmount} step="0.01" value={payment.amount} onChange={event=>setPayment(previous=>({...previous,amount:event.target.value}))} required/></div>
     <div className="row g-3">
      <div className="col-md-6"><label className="form-label" htmlFor="supplier-payment-method">Method</label><select id="supplier-payment-method" className="form-select" value={payment.method} onChange={event=>setPayment(previous=>({...previous,method:event.target.value}))}><option>Bank Transfer</option><option>UPI</option><option>Cash</option><option>Cheque</option><option>Bank</option></select></div>
      <div className="col-md-6"><label className="form-label" htmlFor="supplier-payment-date">Date</label><input id="supplier-payment-date" className="form-control" type="date" value={payment.paidAt} onChange={event=>setPayment(previous=>({...previous,paidAt:event.target.value}))}/></div>
      <div className="col-12"><label className="form-label" htmlFor="supplier-payment-reference">Reference</label><input id="supplier-payment-reference" className="form-control" value={payment.reference} onChange={event=>setPayment(previous=>({...previous,reference:event.target.value}))}/></div>
      <div className="col-12"><label className="form-label" htmlFor="supplier-payment-note">Note</label><input id="supplier-payment-note" className="form-control" value={payment.note} onChange={event=>setPayment(previous=>({...previous,note:event.target.value}))}/></div>
     </div>
    </div>
    <footer className="purchase-modal-footer"><button type="button" className="btn btn-light border" onClick={()=>setPaymentPurchase(null)} disabled={paymentSaving}>Cancel</button><button type="submit" className="btn btn-primary" disabled={paymentSaving}>{paymentSaving?"Saving...":"Save payment"}</button></footer>
   </form>
  </div>}
 </div>;
}
