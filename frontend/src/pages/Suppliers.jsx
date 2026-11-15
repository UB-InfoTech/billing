import React,{useCallback,useEffect,useMemo,useState} from "react";
import axios from "axios";
import {useNavigate,useSearchParams} from "react-router-dom";
import BusinessPageHeader from "../components/BusinessPageHeader";
import DynamicTable from "../components/DynamicTable";
import "./Suppliers.css";

const API=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const auth=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});
const money=value=>"₹"+Number(value||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
const EMPTY={
 name:"",legalName:"",gstin:"",
 contact:{person:"",email:"",phone:""},
 address:"",city:"",state:"",pinCode:"",
 paymentTerms:"30",notes:"",status:"Active"
};

export default function Suppliers(){
 const navigate=useNavigate();
 const [searchParams,setSearchParams]=useSearchParams();
 const [suppliers,setSuppliers]=useState([]);
 const [pagination,setPagination]=useState({page:1,pages:1,total:0});
 const [search,setSearch]=useState("");
 const [status,setStatus]=useState("Active");
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [dialogOpen,setDialogOpen]=useState(false);
 const [saving,setSaving]=useState(false);
 const [editingId,setEditingId]=useState("");
 const [form,setForm]=useState(EMPTY);
 const [formError,setFormError]=useState("");
 const [viewingSupplier,setViewingSupplier]=useState(null);
 const [viewLoading,setViewLoading]=useState(false);

 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const response=await axios.get(API+"/api/suppliers",{...auth(),params:{search:search.trim(),status,page:pagination.page,limit:50}});
   setSuppliers(Array.isArray(response.data?.suppliers)?response.data.suppliers:[]);
   setPagination(previous=>({...previous,...(response.data?.pagination||{})}));
  }catch(loadError){
   setError(loadError.response?.data?.message||"Suppliers could not be loaded. Please try again.");
  }finally{setLoading(false);}
 },[search,status,pagination.page]);

 useEffect(()=>{load();},[load]);

 const openSupplier=useCallback(async id=>{
  setViewLoading(true);setViewingSupplier(null);
  try{
   const response=await axios.get(API+"/api/suppliers/"+encodeURIComponent(id),auth());
   setViewingSupplier(response.data);
  }catch(loadError){
   setError(loadError.response?.data?.message||"Supplier details could not be opened.");
  }finally{setViewLoading(false);}
 },[]);

 useEffect(()=>{
  const id=searchParams.get("openSupplier");
  if(!id)return;
  let active=true;
  const params=new URLSearchParams(searchParams);
  params.delete("openSupplier");
  setSearchParams(params,{replace:true});
  axios.get(API+"/api/suppliers/"+encodeURIComponent(id),auth())
   .then(response=>{if(active)setViewingSupplier(response.data);})
   .catch(loadError=>{if(active)setError(loadError.response?.data?.message||"Supplier details could not be opened.");});
  return()=>{active=false;};
 },[searchParams,setSearchParams]);

 useEffect(()=>{
  if(searchParams.get("action")!=="new")return;
  const params=new URLSearchParams(searchParams);
  params.delete("action");
  setSearchParams(params,{replace:true});
  startNew();
 },[searchParams,setSearchParams]);

 const startNew=()=>{
  setEditingId("");setForm({...EMPTY,contact:{...EMPTY.contact}});
  setFormError("");setDialogOpen(true);
 };
 const startEdit=supplier=>{
  const item=supplier.supplier||supplier;
  setEditingId(item._id);
  setForm({
   ...EMPTY,...item,
   contact:{...EMPTY.contact,...(item.contact||{})}
  });
  setFormError("");setDialogOpen(true);
 };
 const update=(key,value)=>setForm(previous=>({...previous,[key]:value}));
 const updateContact=(key,value)=>setForm(previous=>({...previous,contact:{...(previous.contact||{}),[key]:value}}));

 const save=async event=>{
  event.preventDefault();setFormError("");
  if(!form.name.trim()){setFormError("Enter the supplier name.");return;}
  try{
   setSaving(true);
   const response=editingId
    ?await axios.put(API+"/api/suppliers/"+encodeURIComponent(editingId),form,auth())
    :await axios.post(API+"/api/suppliers",form,auth());
   setMessage(response.data?.message||"Supplier saved.");
   setDialogOpen(false);
   await load();
   if(editingId&&viewingSupplier?.supplier?._id===editingId)await openSupplier(editingId);
  }catch(saveError){
   setFormError(saveError.response?.data?.message||"Supplier could not be saved.");
  }finally{setSaving(false);}
 };

 const createPurchase=supplier=>navigate("/purchases?action=new&supplierId="+encodeURIComponent(supplier._id));
 const columns=useMemo(()=>[
  {key:"name",label:"Supplier",sortKey:"name",render:supplier=><button type="button" className="btn btn-link p-0 text-decoration-none fw-semibold" onClick={()=>openSupplier(supplier._id)}>{supplier.name}</button>},
  {key:"gstin",label:"GSTIN",visible:false},
  {key:"contact",label:"Contact",render:supplier=><span>{supplier.contact?.person||supplier.contact?.phone||supplier.contact?.email||"—"}</span>},
  {key:"purchaseCount",label:"Purchases",render:supplier=>Number(supplier.summary?.purchaseCount||0).toLocaleString("en-IN")},
  {key:"totalPurchased",label:"Purchased",render:supplier=>money(supplier.summary?.totalPurchased)},
  {key:"outstanding",label:"Payable",render:supplier=><strong className={Number(supplier.summary?.outstanding||0)>0?"text-danger":""}>{money(supplier.summary?.outstanding)}</strong>},
  {key:"status",label:"Status",render:supplier=><span className={"supplier-status "+(supplier.status==="Inactive"?"is-inactive":"")}>{supplier.status||"Active"}</span>}
 ],[openSupplier]);

 return <div className="container-fluid py-3 suppliers-page">
  <BusinessPageHeader eyebrow="BUSINESS CONTACTS" title="Suppliers" description="Keep supplier details, purchase history and outstanding payments together." className="mb-3">
   <button type="button" className="btn btn-light border" onClick={()=>navigate("/purchases")}><i className="bi bi-cart-check me-2"/>View purchases</button>
   <button type="button" className="btn btn-primary" onClick={startNew}><i className="bi bi-plus-lg me-2"/>Add supplier</button>
  </BusinessPageHeader>
  {error&&<div className="alert alert-warning" role="alert">{error}<button type="button" className="btn-close float-end" aria-label="Dismiss" onClick={()=>setError("")}/></div>}
  {message&&<div className="alert alert-success d-flex align-items-center gap-2" role="status"><i className="bi bi-check-circle-fill"/><span>{message}</span><button type="button" className="btn-close ms-auto" aria-label="Dismiss" onClick={()=>setMessage("")}/></div>}
  <section className="card border-0 shadow-sm">
   <div className="card-body">
    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
     <div className="supplier-search">
      <div className="input-group"><span className="input-group-text bg-white"><i className="bi bi-search"/></span><input className="form-control" value={search} onChange={event=>{setSearch(event.target.value);setPagination(previous=>({...previous,page:1}));}} placeholder="Search supplier, GSTIN or phone" aria-label="Search suppliers"/></div>
     </div>
     <div className="d-flex align-items-center gap-2">
      <select className="form-select" value={status} onChange={event=>{setStatus(event.target.value);setPagination(previous=>({...previous,page:1}));}} aria-label="Filter supplier status">
       <option value="Active">Active suppliers</option><option value="Inactive">Inactive suppliers</option><option value="">All suppliers</option>
      </select>
      <span className="small text-secondary text-nowrap">{pagination.total} suppliers</span>
     </div>
    </div>
    <DynamicTable
     tableKey="suppliers.list"
     rows={suppliers}
     getRowKey={supplier=>supplier._id}
     loading={loading}
     columns={columns}
     emptyText={search?"No suppliers match your search.":"No suppliers yet. Add a supplier before recording your first purchase."}
     actionColumn={{label:"Actions",locked:true,render:supplier=><div className="d-flex justify-content-end gap-1 flex-wrap">
      <button type="button" className="btn btn-sm btn-light border" onClick={()=>createPurchase(supplier)} title="Create purchase"><i className="bi bi-cart-plus me-1"/>Purchase</button>
      <button type="button" className="btn btn-sm btn-light border" onClick={()=>openSupplier(supplier._id)} title="View supplier"><i className="bi bi-eye me-1"/>View</button>
      <button type="button" className="btn btn-sm btn-light border" onClick={()=>startEdit(supplier)} title="Edit supplier"><i className="bi bi-pencil"/></button>
     </div>}}
    />
    {pagination.pages>1&&<div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-3">
     <span className="small text-secondary">Page {pagination.page} of {pagination.pages}</span>
     <div className="btn-group">
      <button type="button" className="btn btn-sm btn-light border" disabled={pagination.page<=1} onClick={()=>setPagination(previous=>({...previous,page:previous.page-1}))}>Previous</button>
      <button type="button" className="btn btn-sm btn-light border" disabled={pagination.page>=pagination.pages} onClick={()=>setPagination(previous=>({...previous,page:previous.page+1}))}>Next</button>
     </div>
    </div>}
   </div>
  </section>

  {dialogOpen&&<div className="supplier-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!saving)setDialogOpen(false);}}>
   <form className="supplier-modal" role="dialog" aria-modal="true" aria-labelledby="supplier-form-title" onSubmit={save}>
    <header className="supplier-modal-header">
     <div><span className="small text-primary fw-semibold text-uppercase">SUPPLIER DETAILS</span><h2 id="supplier-form-title">{editingId?"Edit supplier":"Add a supplier"}</h2><p>Save the contact once, then reuse it on every purchase and expense.</p></div>
     <button type="button" className="btn-close" aria-label="Close" onClick={()=>setDialogOpen(false)} disabled={saving}/>
    </header>
    {formError&&<div className="alert alert-danger mx-4 mt-3 mb-0" role="alert">{formError}</div>}
    <div className="supplier-modal-body">
     <section><h3>Business details</h3><div className="row g-3">
      <div className="col-md-6"><label className="form-label" htmlFor="supplier-name">Supplier name *</label><input id="supplier-name" className="form-control" maxLength={160} value={form.name} onChange={event=>update("name",event.target.value)} required/></div>
      <div className="col-md-6"><label className="form-label" htmlFor="supplier-legal">Legal name</label><input id="supplier-legal" className="form-control" maxLength={180} value={form.legalName} onChange={event=>update("legalName",event.target.value)}/></div>
      <div className="col-md-6"><label className="form-label" htmlFor="supplier-gstin">GSTIN</label><input id="supplier-gstin" className="form-control text-uppercase" maxLength={15} value={form.gstin} onChange={event=>update("gstin",event.target.value.toUpperCase())} placeholder="15-character GSTIN"/></div>
      <div className="col-md-6"><label className="form-label" htmlFor="supplier-status">Status</label><select id="supplier-status" className="form-select" value={form.status} onChange={event=>update("status",event.target.value)}><option>Active</option><option>Inactive</option></select></div>
     </div></section>
     <section><h3>Contact person</h3><div className="row g-3">
      <div className="col-md-4"><label className="form-label" htmlFor="supplier-contact">Name</label><input id="supplier-contact" className="form-control" value={form.contact.person} onChange={event=>updateContact("person",event.target.value)}/></div>
      <div className="col-md-4"><label className="form-label" htmlFor="supplier-phone">Phone</label><input id="supplier-phone" className="form-control" value={form.contact.phone} onChange={event=>updateContact("phone",event.target.value)}/></div>
      <div className="col-md-4"><label className="form-label" htmlFor="supplier-email">Email</label><input id="supplier-email" type="email" className="form-control" value={form.contact.email} onChange={event=>updateContact("email",event.target.value)}/></div>
     </div></section>
     <section><h3>Address and payment terms</h3><div className="row g-3">
      <div className="col-12"><label className="form-label" htmlFor="supplier-address">Address</label><textarea id="supplier-address" className="form-control" rows={2} value={form.address} onChange={event=>update("address",event.target.value)}/></div>
      <div className="col-md-4"><label className="form-label" htmlFor="supplier-city">City</label><input id="supplier-city" className="form-control" value={form.city} onChange={event=>update("city",event.target.value)}/></div>
      <div className="col-md-4"><label className="form-label" htmlFor="supplier-state">State</label><input id="supplier-state" className="form-control" value={form.state} onChange={event=>update("state",event.target.value)}/></div>
      <div className="col-md-4"><label className="form-label" htmlFor="supplier-pin">PIN Code</label><input id="supplier-pin" className="form-control" value={form.pinCode} onChange={event=>update("pinCode",event.target.value)}/></div>
      <div className="col-md-4"><label className="form-label" htmlFor="supplier-terms">Payment terms</label><select id="supplier-terms" className="form-select" value={form.paymentTerms} onChange={event=>update("paymentTerms",event.target.value)}><option value="0">Immediate</option><option value="15">15 days</option><option value="30">30 days</option><option value="45">45 days</option><option value="60">60 days</option><option value="90">90 days</option></select></div>
      <div className="col-12"><label className="form-label" htmlFor="supplier-notes">Notes</label><textarea id="supplier-notes" className="form-control" rows={2} maxLength={4000} value={form.notes} onChange={event=>update("notes",event.target.value)}/></div>
     </div></section>
    </div>
    <footer className="supplier-modal-footer"><button type="button" className="btn btn-light border" onClick={()=>setDialogOpen(false)} disabled={saving}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving?"Saving...":editingId?"Save changes":"Save supplier"}</button></footer>
   </form>
  </div>}

  {(viewingSupplier||viewLoading)&&<div className="supplier-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setViewingSupplier(null);}}>
   {viewLoading?<div className="supplier-view-loading"><span className="spinner-border spinner-border-sm me-2"/>Loading supplier...</div>:viewingSupplier&&<section className="supplier-modal supplier-profile-modal" role="dialog" aria-modal="true" aria-labelledby="supplier-profile-title">
    <header className="supplier-modal-header">
     <div><span className="small text-primary fw-semibold text-uppercase">SUPPLIER PROFILE</span><h2 id="supplier-profile-title">{viewingSupplier.supplier.name}</h2><p>{viewingSupplier.supplier.gstin||"GSTIN not recorded"} · {viewingSupplier.supplier.status}</p></div>
     <button type="button" className="btn-close" aria-label="Close" onClick={()=>setViewingSupplier(null)}/>
    </header>
    <div className="supplier-modal-body">
     <div className="row g-2 mb-3">
      <div className="col-sm-4"><div className="supplier-stat"><span>Purchases</span><strong>{Number(viewingSupplier.summary?.purchaseCount||0)}</strong></div></div>
      <div className="col-sm-4"><div className="supplier-stat"><span>Total purchased</span><strong>{money(viewingSupplier.summary?.totalPurchased)}</strong></div></div>
      <div className="col-sm-4"><div className="supplier-stat"><span>Outstanding</span><strong className="text-danger">{money(viewingSupplier.summary?.outstanding)}</strong></div></div>
     </div>
     <section><h3>Contact details</h3><div className="supplier-profile-details">
      <span><i className="bi bi-person me-2"/>{viewingSupplier.supplier.contact?.person||"Contact person not recorded"}</span>
      <span><i className="bi bi-telephone me-2"/>{viewingSupplier.supplier.contact?.phone||"Phone not recorded"}</span>
      <span><i className="bi bi-envelope me-2"/>{viewingSupplier.supplier.contact?.email||"Email not recorded"}</span>
      <span><i className="bi bi-geo-alt me-2"/>{[viewingSupplier.supplier.address,viewingSupplier.supplier.city,viewingSupplier.supplier.state,viewingSupplier.supplier.pinCode].filter(Boolean).join(", ")||"Address not recorded"}</span>
     </div></section>
     <section><div className="d-flex justify-content-between align-items-center gap-2 mb-2"><h3 className="mb-0">Recent purchases</h3><button type="button" className="btn btn-sm btn-light border" onClick={()=>navigate("/purchases?supplierId="+encodeURIComponent(viewingSupplier.supplier._id))}>All purchases</button></div>
      {!viewingSupplier.recentPurchases?.length?<p className="text-secondary small">No purchases recorded for this supplier yet.</p>:<div className="supplier-recent-purchases">
       {viewingSupplier.recentPurchases.map(purchase=><button type="button" key={purchase._id} onClick={()=>{setViewingSupplier(null);navigate("/purchases?openPurchase="+encodeURIComponent(purchase._id));}}>
        <span><strong>{purchase.purchaseNumber}</strong><small>{purchase.supplierInvoiceNumber||"Supplier bill number not entered"} · {purchase.purchaseDate?new Date(purchase.purchaseDate).toLocaleDateString("en-IN"):""}</small></span>
        <strong>{money(purchase.grandTotal)}</strong>
       </button>)}
      </div>}
     </section>
     {viewingSupplier.supplier.notes&&<section><h3>Notes</h3><p className="small text-secondary">{viewingSupplier.supplier.notes}</p></section>}
    </div>
    <footer className="supplier-modal-footer">
     <button type="button" className="btn btn-light border me-auto" onClick={()=>startEdit(viewingSupplier.supplier)}>Edit supplier</button>
     <button type="button" className="btn btn-primary" onClick={()=>createPurchase(viewingSupplier.supplier)}><i className="bi bi-cart-plus me-2"/>New purchase</button>
     <button type="button" className="btn btn-light border" onClick={()=>setViewingSupplier(null)}>Close</button>
    </footer>
   </section>}
  </div>}
 </div>;
}
