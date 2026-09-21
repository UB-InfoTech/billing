import React,{useEffect,useState} from "react";
import {getExpenseOptions,uploadReceipt} from "../services/api";

const CATEGORIES=["Production","Operational","Marketing","Financial","Miscellaneous","Raw Materials","Labor","Maintenance","Shipping","Utilities","Rent","Other"];
const METHODS=["Cash","Bank Transfer","UPI","Cheque","Credit"];

function defaults(initialData={}){
  return {
    title:"",
    description:"",
    amount:"",
    category:"Operational",
    subCategory:"",
    tags:[],
    paymentMethod:"Cash",
    currency:"INR",
    vendor:"",
    gstNo:"",
    taxDeductible:false,
    taxRate:0,
    clientId:"",
    orderId:"",
    date:new Date().toISOString().slice(0,10),
    isRecurring:false,
    recurringInterval:"",
    recurringEndDate:"",
    notes:"",
    receipt:"",
    ...initialData
  };
}

export default function ExpenseForm({onSubmit,initialData={}}){
  const [form,setForm]=useState(defaults(initialData));
  const [clients,setClients]=useState([]);
  const [orders,setOrders]=useState([]);
  const [tagText,setTagText]=useState("");
  const [uploading,setUploading]=useState(false);
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);

  useEffect(()=>{
    let alive=true;
    getExpenseOptions().then(r=>{if(alive){setClients(r.data?.clients||[]);setOrders(r.data?.orders||[]);}})
      .catch(e=>{if(alive)setError(e.response?.data?.message||"Unable to load clients and invoices.");});
    return()=>{alive=false;};
  },[]);

  const change=(name,value)=>setForm(v=>({...v,[name]:value}));

  const addTag=(e)=>{
    if(e.key!=="Enter")return;
    e.preventDefault();
    const tag=tagText.trim();
    if(tag&&!form.tags.includes(tag))setForm(v=>({...v,tags:[...v.tags,tag]}));
    setTagText("");
  };

  const removeTag=(tag)=>setForm(v=>({...v,tags:v.tags.filter(x=>x!==tag)}));

  const receiptUpload=async(e)=>{
    const file=e.target.files?.[0];
    if(!file)return;
    try{
      setUploading(true);setError("");
      const data=await uploadReceipt(file);
      change("receipt",data.receiptUrl);
    }catch(err){setError(err.response?.data?.message||"Receipt upload failed.");}
    finally{setUploading(false);}
  };

  const submit=async(e)=>{
    e.preventDefault();
    setError("");
    const amount=Number(form.amount);
    if(!form.description.trim())return setError("Description is required.");
    if(!Number.isFinite(amount)||amount<=0)return setError("Amount must be greater than zero.");
    if(form.isRecurring&&!form.recurringInterval)return setError("Select a recurring interval.");
    try{
      setSaving(true);
      await onSubmit({...form,amount:Number(amount),taxRate:Number(form.taxRate||0),clientId:form.clientId||null,orderId:form.orderId||null,recurringEndDate:form.recurringEndDate||null,recurringInterval:form.isRecurring?form.recurringInterval:null});
    }catch(err){setError(err.response?.data?.message||err.message||"Unable to save expense.");}
    finally{setSaving(false);}
  };

  return <form onSubmit={submit} className="card p-4 bg-white shadow-sm border-0">
    <div className="d-flex justify-content-between align-items-center mb-4"><h3 className="mb-0">Expense</h3><span className="badge text-bg-light border">Advanced tracking</span></div>
    {error&&<div className="alert alert-danger">{error}</div>}
    <div className="row g-3">
      <div className="col-md-4"><label className="form-label">Date</label><input type="date" className="form-control" value={form.date} onChange={e=>change("date",e.target.value)} required/></div>
      <div className="col-md-4"><label className="form-label">Title</label><input className="form-control" value={form.title} onChange={e=>change("title",e.target.value)} placeholder="Machine repair"/></div>
      <div className="col-md-4"><label className="form-label">Amount</label><input type="number" min="0.01" step="0.01" className="form-control" value={form.amount} onChange={e=>change("amount",e.target.value)} required/></div>
      <div className="col-md-6"><label className="form-label">Description</label><input className="form-control" value={form.description} onChange={e=>change("description",e.target.value)} required/></div>
      <div className="col-md-3"><label className="form-label">Category</label><select className="form-select" value={form.category} onChange={e=>change("category",e.target.value)}>{CATEGORIES.map(x=><option key={x}>{x}</option>)}</select></div>
      <div className="col-md-3"><label className="form-label">Sub Category</label><input className="form-control" value={form.subCategory} onChange={e=>change("subCategory",e.target.value)}/></div>
      <div className="col-md-4"><label className="form-label">Payment Method</label><select className="form-select" value={form.paymentMethod} onChange={e=>change("paymentMethod",e.target.value)}>{METHODS.map(x=><option key={x}>{x}</option>)}</select></div>
      <div className="col-md-4"><label className="form-label">Vendor</label><input className="form-control" value={form.vendor} onChange={e=>change("vendor",e.target.value)}/></div>
      <div className="col-md-4"><label className="form-label">GST Number</label><input className="form-control text-uppercase" maxLength="15" value={form.gstNo} onChange={e=>change("gstNo",e.target.value.toUpperCase())}/></div>
      <div className="col-md-3"><label className="form-label">Tax Rate %</label><input type="number" min="0" max="100" step="0.01" className="form-control" value={form.taxRate} onChange={e=>change("taxRate",e.target.value)}/></div>
      <div className="col-md-3"><label className="form-label">Currency</label><input className="form-control text-uppercase" maxLength="3" value={form.currency} onChange={e=>change("currency",e.target.value.toUpperCase())}/></div>
      <div className="col-md-6"><label className="form-label">Tags</label><input className="form-control" value={tagText} onChange={e=>setTagText(e.target.value)} onKeyDown={addTag} placeholder="Type a tag and press Enter"/><div className="mt-2 d-flex gap-1 flex-wrap">{form.tags.map(t=><span key={t} className="badge text-bg-secondary">{t}<button type="button" className="btn btn-sm text-white p-0 ms-1" onClick={()=>removeTag(t)}>×</button></span>)}</div></div>
      <div className="col-md-6"><label className="form-label">Client</label><select className="form-select" value={form.clientId||""} onChange={e=>change("clientId",e.target.value)}><option value="">Not linked</option>{clients.map(c=><option key={c._id} value={c._id}>{c.companyName||c.name||"Client"}</option>)}</select></div>
      <div className="col-md-6"><label className="form-label">Invoice / Order</label><select className="form-select" value={form.orderId||""} onChange={e=>change("orderId",e.target.value)}><option value="">Not linked</option>{orders.map(o=><option key={o._id} value={o._id}>{o.orderNumber||"Order"}{o.companyName?" - "+o.companyName:""}</option>)}</select></div>
      <div className="col-md-6"><label className="form-label">Receipt</label><input type="file" accept="image/*,.pdf" className="form-control" onChange={receiptUpload} disabled={uploading}/>{uploading&&<div className="small text-muted mt-1">Uploading...</div>}{form.receipt&&<a className="d-inline-block mt-2" target="_blank" rel="noreferrer" href={form.receipt}>View uploaded receipt</a>}</div>
      <div className="col-md-6"><label className="form-label">Notes</label><textarea className="form-control" rows="3" value={form.notes} onChange={e=>change("notes",e.target.value)}/></div>
      <div className="col-12"><div className="d-flex gap-4 flex-wrap">
        <div className="form-check"><input className="form-check-input" type="checkbox" checked={!!form.taxDeductible} onChange={e=>change("taxDeductible",e.target.checked)} id="taxDeductible"/><label className="form-check-label" htmlFor="taxDeductible">Tax deductible</label></div>
        <div className="form-check"><input className="form-check-input" type="checkbox" checked={!!form.isRecurring} onChange={e=>change("isRecurring",e.target.checked)} id="isRecurring"/><label className="form-check-label" htmlFor="isRecurring">Recurring expense</label></div>
      </div></div>
      {form.isRecurring&&<><div className="col-md-4"><label className="form-label">Recurring Interval</label><select className="form-select" value={form.recurringInterval} onChange={e=>change("recurringInterval",e.target.value)}><option value="">Select</option><option>Daily</option><option>Weekly</option><option>Monthly</option><option>Yearly</option></select></div><div className="col-md-4"><label className="form-label">Recurrence End Date</label><input type="date" className="form-control" value={form.recurringEndDate} onChange={e=>change("recurringEndDate",e.target.value)}/></div></>}
    </div>
    <button className="btn btn-primary w-100 mt-4" type="submit" disabled={saving||uploading}>{saving?<><span className="spinner-border spinner-border-sm me-2"/>Saving...</>:"Save Expense"}</button>
  </form>;
}
