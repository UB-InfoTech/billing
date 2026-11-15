import React,{useCallback,useEffect,useState} from "react";
import axios from "axios";
import {useNavigate} from "react-router-dom";
import "./ProductStockHistory.css";

const API=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const auth=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});
const formatDate=value=>{
 const date=value?new Date(value):null;
 return date&&!Number.isNaN(date.getTime())?date.toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"}):"Date not available";
};
const movementLabel=type=>({
 purchase_received:"Purchase received",
 purchase_cancelled:"Purchase reversed",
 invoice_sale:"Issued on invoice",
 invoice_cancelled:"Invoice stock returned",
 credit_note_return:"Sales return",credit_note_reversal:"Credit Note stock reversed",
 manual_adjustment:"Manual adjustment"
}[type]||"Stock movement");

export default function ProductStockHistory({product,onClose,onUpdated}){
 const navigate=useNavigate();
 const [data,setData]=useState(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [saving,setSaving]=useState(false);
 const [direction,setDirection]=useState("add");
 const [quantity,setQuantity]=useState("");
 const [unit,setUnit]=useState(product?.stockUnit||"PCS");
 const [note,setNote]=useState("");

 const load=useCallback(async()=>{
  if(!product?._id)return;
  setLoading(true);setError("");
  try{
   const response=await axios.get(API+"/api/products/"+encodeURIComponent(product._id)+"/stock-movements",{...auth(),params:{limit:100}});
   setData(response.data||null);
   setUnit(response.data?.product?.stockUnit||product.stockUnit||"PCS");
  }catch(loadError){
   setError(loadError.response?.data?.message||"Stock history could not be loaded.");
  }finally{setLoading(false);}
 },[product?._id,product?.stockUnit]);

 useEffect(()=>{load();},[load]);

 const submit=async event=>{
  event.preventDefault();
  const amount=Number(quantity);
  if(!Number.isFinite(amount)||amount<=0){setError("Enter a quantity greater than zero.");return;}
  const delta=direction==="add"?amount:-amount;
  try{
   setSaving(true);setError("");
   await axios.patch(API+"/api/products/"+encodeURIComponent(product._id)+"/stock",{quantity:delta,unit,note:note.trim()|| (direction==="add"?"Stock added":"Stock reduced")},auth());
   setQuantity("");setNote("");
   await load();
   await onUpdated?.();
  }catch(saveError){
   setError(saveError.response?.data?.message||"Stock could not be updated.");
  }finally{setSaving(false);}
 };

 const openSource=movement=>{
  const id=movement.sourceId?._id||movement.sourceId;
  if(!id)return;
  if(movement.sourceType==="purchase")navigate("/purchases?openPurchase="+encodeURIComponent(id));
  else if(movement.sourceType==="invoice")navigate("/orders?openInvoice="+encodeURIComponent(id));
  else if(movement.sourceType==="credit_note")navigate("/credit-notes?openCreditNote="+encodeURIComponent(id));
 };

 const movements=data?.movements||[];
 const current=Number(data?.product?.quantity??product?.quantity??0);
 const stockUnit=data?.product?.stockUnit||product?.stockUnit||unit;
 const canOpen=movement=>Boolean(movement.sourceId&&["purchase","invoice","credit_note"].includes(movement.sourceType));

 return <div className="product-stock-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!saving)onClose();}}>
  <section className="product-stock-dialog" role="dialog" aria-modal="true" aria-labelledby="product-stock-title">
   <header className="product-stock-header">
    <div><span>INVENTORY HISTORY</span><h2 id="product-stock-title">{product.productName}</h2><p>See what increased or reduced this product's stock.</p></div>
    <button type="button" className="btn-close" aria-label="Close stock history" onClick={onClose} disabled={saving}/>
   </header>
   {error&&<div className="alert alert-warning mx-4 mt-3 mb-0" role="alert">{error}</div>}
   <div className="product-stock-body">
    <div className="product-stock-current">
     <span>Current stock</span><strong>{current.toLocaleString("en-IN",{maximumFractionDigits:4})} {stockUnit}</strong>
     <small>{data?.product?.trackInventory?"Stock tracking is active":"Stock tracking will start with your first stock movement."}</small>
    </div>
    <form className="product-stock-adjust" onSubmit={submit}>
     <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap"><strong>Adjust stock</strong><span className="small text-secondary">Use this for opening stock or a physical stock count.</span></div>
     <div className="row g-2 align-items-end mt-1">
      <div className="col-sm-4"><label className="form-label" htmlFor="stock-adjust-direction">Action</label><select id="stock-adjust-direction" className="form-select" value={direction} onChange={event=>setDirection(event.target.value)}><option value="add">Add stock</option><option value="reduce">Reduce stock</option></select></div>
      <div className="col-sm-3"><label className="form-label" htmlFor="stock-adjust-quantity">Quantity</label><input id="stock-adjust-quantity" className="form-control" type="number" min="0.0001" step="0.0001" value={quantity} onChange={event=>setQuantity(event.target.value)} required/></div>
      <div className="col-sm-2"><label className="form-label" htmlFor="stock-adjust-unit">Unit</label><select id="stock-adjust-unit" className="form-select" value={unit} onChange={event=>setUnit(event.target.value)} disabled={Boolean(data?.product?.trackInventory)}><option value="PCS">PCS</option><option value="MTR">MTR</option></select></div>
      <div className="col-sm-3"><button type="submit" className="btn btn-primary w-100" disabled={saving}>{saving?"Saving...":"Save adjustment"}</button></div>
      <div className="col-12"><label className="form-label" htmlFor="stock-adjust-note">Reason <span className="text-secondary fw-normal">(optional)</span></label><input id="stock-adjust-note" className="form-control" maxLength={500} value={note} onChange={event=>setNote(event.target.value)} placeholder="Example: Physical stock count"/></div>
     </div>
    </form>
    <section className="product-stock-ledger">
     <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-2"><strong>Recent stock movements</strong><button type="button" className="btn btn-sm btn-light border" onClick={load} disabled={loading}><i className="bi bi-arrow-clockwise me-1"/>Refresh</button></div>
     {loading?<div className="text-center py-4"><span className="spinner-border spinner-border-sm me-2"/>Loading history...</div>
      :!movements.length?<div className="product-stock-empty">No stock movements have been recorded yet. Your first purchase or adjustment will appear here.</div>
      :<div className="product-stock-movements">
       {movements.map(movement=>{
        const positive=Number(movement.quantityChange)>0;
        return <article key={movement._id} className="product-stock-movement">
         <span className={"product-stock-movement-icon "+(positive?"is-positive":"is-negative")}><i className={"bi "+(positive?"bi-arrow-down-left":"bi-arrow-up-right")}/></span>
         <div className="product-stock-movement-main">
          <strong>{movementLabel(movement.movementType)}</strong>
          <span>{formatDate(movement.createdAt)}{movement.reference?" · "+movement.reference:""}</span>
          {movement.note&&<small>{movement.note}</small>}
          <small>Balance after movement: {Number(movement.quantityAfter||0).toLocaleString("en-IN",{maximumFractionDigits:4})} {movement.unit}</small>
         </div>
         <div className="product-stock-movement-value">
          <strong className={positive?"text-success":"text-danger"}>{positive?"+":""}{Number(movement.quantityChange||0).toLocaleString("en-IN",{maximumFractionDigits:4})}</strong>
          <small>{movement.unit}</small>
          {canOpen(movement)&&<button type="button" className="btn btn-link btn-sm p-0 text-decoration-none" onClick={()=>openSource(movement)}>Open record <i className="bi bi-arrow-up-right"/></button>}
         </div>
        </article>;
       })}
      </div>}
    </section>
    {data?.pagination?.total>movements.length&&<p className="small text-secondary mt-2 mb-0">Showing the latest {movements.length} of {data.pagination.total} movements.</p>}
   </div>
   <footer className="product-stock-footer"><button type="button" className="btn btn-light border" onClick={onClose}>Close</button></footer>
  </section>
 </div>;
}
