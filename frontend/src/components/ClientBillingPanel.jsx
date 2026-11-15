import React,{useCallback,useEffect,useMemo,useState} from "react";
import axios from "axios";
import {useNavigate} from "react-router-dom";
import "./ClientBillingPanel.css";

const FILTERS=[{key:"all",label:"All"},{key:"Invoice",label:"Invoices"},{key:"Payment",label:"Payments"},{key:"Credit Note",label:"Credit notes"}];
const money=value=>"₹"+Number(value||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
const formatDate=value=>{
 const date=value?new Date(value):null;
 return date&&!Number.isNaN(date.getTime())?date.toLocaleDateString("en-IN",{dateStyle:"medium"}):"Date not available";
};

export default function ClientBillingPanel({clientId,apiBase}){
 const navigate=useNavigate();
 const [transactions,setTransactions]=useState([]);
 const [filter,setFilter]=useState("all");
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [receiptError,setReceiptError]=useState("");
 const [receiptLoadingId,setReceiptLoadingId]=useState("");
 const load=useCallback(async()=>{
  if(!clientId)return;
  setLoading(true);setError("");setReceiptError("");
  try{
   const response=await axios.get(apiBase+"/api/clients/"+clientId+"/transactions",{
    headers:{"x-auth-token":localStorage.getItem("token")||""}
   });
   setTransactions(Array.isArray(response.data)?response.data:[]);
  }catch(loadError){
   setError(loadError.response?.data?.message||"Billing history could not be loaded. Please try again.");
  }finally{setLoading(false);}
 },[apiBase,clientId]);
 useEffect(()=>{load();},[load]);

 const visible=useMemo(()=>filter==="all"?transactions:transactions.filter(item=>item.type===filter),[filter,transactions]);
 const invoices=transactions.filter(item=>item.type==="Invoice");
 const payments=transactions.filter(item=>item.type==="Payment");
 const credits=transactions.filter(item=>item.type==="Credit Note");
 const received=payments.reduce((sum,item)=>sum+Number(item.amount||0),0);
 const openRecord=item=>{
  if(item.type==="Credit Note"&&item.creditNoteId)navigate("/credit-notes?openCreditNote="+encodeURIComponent(item.creditNoteId));
  else if(item.orderId)navigate("/orders?openInvoice="+encodeURIComponent(item.orderId));
 };

 const printReceipt=async item=>{
  if(item.type!=="Payment"||!item.orderId||!item.paymentId)return;
  const receiptKey=String(item.orderId)+":"+String(item.paymentId);
  if(receiptLoadingId===receiptKey)return;
  setReceiptError("");
  // Open the window from the click itself so the browser does not block it
  // while the authenticated receipt request is in progress.
  const printWindow=window.open("","_blank");
  if(!printWindow){
   setReceiptError("Allow pop-ups to open this payment receipt, then try again.");
   return;
  }
  setReceiptLoadingId(receiptKey);
  printWindow.document.open();
  printWindow.document.write("<p style='font-family:Arial,sans-serif;padding:24px'>Preparing payment receipt...</p>");
  printWindow.document.close();
  try{
   const response=await axios.get(
    apiBase+"/api/order/"+encodeURIComponent(item.orderId)+"/payments/"+encodeURIComponent(item.paymentId)+"/invoice",
    {
     headers:{"x-auth-token":localStorage.getItem("token")||""},
     responseType:"text"
    }
   );
   printWindow.document.open();
   printWindow.document.write(response.data);
   printWindow.document.close();
   printWindow.focus();
  }catch(receiptLoadError){
   printWindow.close();
   setReceiptError(receiptLoadError.response?.data?.message||"The payment receipt could not be opened. Please try again.");
  }finally{
   setReceiptLoadingId("");
  }
 };

 return (
  <section className="client-billing-panel" aria-label="Customer billing history">
   <header className="client-billing-heading">
    <div><h3>Bills & payments</h3><p>Invoices, money received and credit notes linked to this customer.</p></div>
    <button type="button" className="btn btn-light border" onClick={load} disabled={loading}><i className="bi bi-arrow-clockwise me-1"></i>Refresh</button>
   </header>
   <div className="client-billing-summary">
    <div><span>Invoices</span><strong>{invoices.length.toLocaleString("en-IN")}</strong></div>
    <div><span>Payments received</span><strong>{money(received)}</strong></div>
    <div><span>Credit notes</span><strong>{credits.length.toLocaleString("en-IN")}</strong></div>
   </div>
   {error&&<div className="alert alert-warning py-2 mx-3 mt-3 mb-0" role="alert">{error}</div>}
   {receiptError&&<div className="alert alert-warning py-2 mx-3 mt-3 mb-0" role="alert">{receiptError}</div>}
   <div className="client-billing-toolbar">
    <div className="client-billing-filters" role="group" aria-label="Filter billing history">
     {FILTERS.map(item=><button type="button" key={item.key} className={filter===item.key?"is-active":""} onClick={()=>setFilter(item.key)}>{item.label}</button>)}
    </div>
    <span>{visible.length} record{visible.length===1?"":"s"}</span>
   </div>
   {loading?<div className="client-billing-state"><span className="spinner-border spinner-border-sm me-2"></span>Loading billing history...</div>
    :!visible.length?<div className="client-billing-empty"><span><i className="bi bi-receipt"></i></span><strong>No billing records in this view</strong><p>Invoices, payments and credit notes for this customer will appear here.</p></div>
    :<div className="client-billing-list">
      {visible.map((item,index)=>{
       const reference=item.type==="Invoice"?item.orderNumber:item.type==="Credit Note"?item.creditNoteNumber:(item.orderNumber||"Payment");
       const date=item.date||item.paymentDate||item.creditNoteDate;
       const detail=item.type==="Invoice"
        ?"Paid "+money(item.paid)+" · Due "+money(item.due)
        :item.type==="Payment"
         ?[item.method,item.reference].filter(Boolean).join(" · ")||"Payment received"
         :[item.status,item.orderNumber].filter(Boolean).join(" · ")||"Credit note";
       const amount=Number(item.amount||0);
       const canOpen=Boolean(item.orderId||item.creditNoteId);
       const receiptKey=String(item.orderId||"")+":"+String(item.paymentId||"");
       return (
        <article className="client-billing-row" key={String(item.type)+"-"+String(item.paymentId||item.creditNoteId||item.orderId||index)+"-"+index}>
         <span className={"client-billing-icon "+(item.type==="Payment"?"is-payment":item.type==="Credit Note"?"is-credit":"")}><i className={"bi "+(item.type==="Payment"?"bi-cash-coin":item.type==="Credit Note"?"bi-file-earmark-minus":"bi-receipt")}></i></span>
         <div className="client-billing-copy">
          <div className="client-billing-meta"><span>{item.type}</span><time>{formatDate(date)}</time></div>
          <strong>{reference||item.type}</strong><small>{detail}</small>
         </div>
         <div className="client-billing-amount">
          <strong>{money(amount)}</strong>
          <div className="client-billing-actions">
           {canOpen&&<button type="button" onClick={()=>openRecord(item)}>Open <i className="bi bi-arrow-up-right"></i></button>}
           {item.type==="Payment"&&item.orderId&&item.paymentId&&(
            <button type="button" onClick={()=>printReceipt(item)} disabled={receiptLoadingId===receiptKey} aria-label={"Print receipt for "+(item.orderNumber||"payment")}>
             {receiptLoadingId===receiptKey
              ?<><span className="spinner-border spinner-border-sm" aria-hidden="true"></span>Opening</>
              :<><i className="bi bi-printer" aria-hidden="true"></i>Receipt</>}
            </button>
           )}
          </div>
         </div>
        </article>
       );
      })}
     </div>}
  </section>
 );
}
