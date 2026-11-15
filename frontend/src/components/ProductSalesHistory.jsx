import React,{useEffect,useState} from "react";
import axios from "axios";
import {useNavigate} from "react-router-dom";

const API=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const auth=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});
const money=value=>"₹"+Number(value||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
const date=value=>{
 if(!value)return "—";
 const parsed=new Date(value);
 return Number.isNaN(parsed.getTime())?"—":parsed.toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});
};

export default function ProductSalesHistory({product,onClose}){
 const navigate=useNavigate();
 const [data,setData]=useState(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");

 useEffect(()=>{
  if(!product?._id)return undefined;
  let active=true;
  setLoading(true);setError("");setData(null);
  axios.get(API+"/api/products/"+encodeURIComponent(product._id)+"/usage",auth())
   .then(response=>{if(active)setData(response.data||null);})
   .catch(loadError=>{if(active)setError(loadError.response?.data?.message||"Product sales history could not be loaded.");})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[product?._id]);

 if(!product)return null;
 const invoices=data?.invoices||[];
 const invoiceCount=Number(data?.totalInvoices||0);
 const totalUnits=invoices.reduce((sum,invoice)=>sum+invoice.lines.reduce((lineSum,line)=>lineSum+(line.unit==="MTR"?Number(line.meters||0):Number(line.quantity||0)),0),0);
 const totalDue=invoices.reduce((sum,invoice)=>sum+Number(invoice.dueAmount||0),0);

 return <div className="modal show d-block" role="presentation" style={{background:"rgba(15,30,45,.48)",zIndex:1080}} onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
  <section className="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg" role="dialog" aria-modal="true" aria-labelledby="product-sales-history-title">
   <div className="modal-content border-0 shadow">
    <header className="modal-header">
     <div><div className="small text-uppercase text-primary fw-semibold mb-1">PRODUCT CONNECTIONS</div><h2 className="modal-title fs-5" id="product-sales-history-title">{product.productName}</h2><div className="small text-secondary">Invoices that contain this product</div></div>
     <button type="button" className="btn-close" aria-label="Close product sales history" onClick={onClose}/>
    </header>
    <div className="modal-body">
     {loading?<div className="text-center py-5"><span className="spinner-border spinner-border-sm me-2"/>Finding linked invoices…</div>
      :error?<div className="alert alert-warning" role="alert">{error}</div>
      :<>
       <div className="row g-2 mb-3">
        <div className="col-4"><div className="rounded border p-3 h-100"><div className="small text-muted">Invoices</div><strong className="fs-5">{invoiceCount.toLocaleString("en-IN")}</strong></div></div>
        <div className="col-4"><div className="rounded border p-3 h-100"><div className="small text-muted">Units sold</div><strong className="fs-5">{totalUnits.toLocaleString("en-IN",{maximumFractionDigits:2})}</strong></div></div>
        <div className="col-4"><div className="rounded border p-3 h-100"><div className="small text-muted">Still due</div><strong className="fs-5">{money(totalDue)}</strong></div></div>
       </div>
       {!invoices.length?<div className="text-center py-4">
        <div className="fs-2 text-secondary mb-2"><i className="bi bi-receipt"/></div>
        <strong>No linked invoices yet</strong>
        <p className="small text-secondary mt-1 mb-0">When you select this product on an invoice, it will appear here automatically. Older invoices without a saved product link are not guessed.</p>
       </div>:<div className="d-flex flex-column gap-2">
        {invoices.map(invoice=><article key={invoice.invoiceId} className="border rounded-3 p-3">
         <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
          <div><strong>{invoice.invoiceNumber}</strong><div className="small text-muted">{date(invoice.invoiceDate)} · {invoice.status} · {invoice.paymentStatus}</div></div>
          <strong>{money(invoice.totalAmount)}</strong>
         </div>
         <div className="small mt-2">
          {invoice.lines.map((line,index)=><div key={index} className="d-flex justify-content-between gap-2"><span>{line.productName}{line.designNumber?" · "+line.designNumber:""} · {line.unit==="MTR"?Number(line.meters||0).toLocaleString("en-IN")+" MTR":Number(line.quantity||0).toLocaleString("en-IN")+" PCS"} × {money(line.rate)}</span></div>)}
         </div>
         <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-3 pt-2 border-top">
          <span className="small text-secondary">Customer: {invoice.customerName}</span>
          <div className="d-flex gap-2">
           {invoice.customerId&&<button type="button" className="btn btn-sm btn-light border" onClick={()=>navigate("/clients?openClient="+encodeURIComponent(invoice.customerId))}>Customer</button>}
           <button type="button" className="btn btn-sm btn-outline-primary" onClick={()=>{onClose();navigate("/orders?openInvoice="+encodeURIComponent(invoice.invoiceId));}}>Open invoice <i className="bi bi-arrow-up-right ms-1" aria-hidden="true"/></button>
          </div>
         </div>
         {Number(invoice.dueAmount)>0&&<div className="small text-danger mt-2">Invoice due: {money(invoice.dueAmount)}</div>}
        </article>)}
       </div>}
       {data?.hasMore&&<p className="small text-secondary mt-3 mb-0">Showing the latest 100 linked invoices.</p>}
      </>}
    </div>
    <footer className="modal-footer"><button type="button" className="btn btn-light border" onClick={onClose}>Close</button><button type="button" className="btn btn-primary" onClick={()=>navigate("/orders?action=new")}><i className="bi bi-plus-lg me-1"/>Create invoice</button></footer>
   </div>
  </section>
 </div>;
}
