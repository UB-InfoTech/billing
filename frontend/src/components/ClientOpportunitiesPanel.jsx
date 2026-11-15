import React,{useCallback,useEffect,useState} from "react";
import axios from "axios";
import {useNavigate} from "react-router-dom";
import "./ClientOpportunitiesPanel.css";

const API=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const auth=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});
const money=value=>"₹"+Number(value||0).toLocaleString("en-IN",{maximumFractionDigits:0});
const date=value=>{
 if(!value)return "No date set";
 const parsed=new Date(value);
 return Number.isNaN(parsed.getTime())?"No date set":parsed.toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});
};

export default function ClientOpportunitiesPanel({clientId}){
 const navigate=useNavigate();
 const [items,setItems]=useState([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");

 const load=useCallback(async()=>{
  if(!clientId)return;
  setLoading(true);setError("");
  try{
   const response=await axios.get(API+"/api/deals",{...auth(),params:{clientId,limit:500}});
   setItems(Array.isArray(response.data?.deals)?response.data.deals:[]);
  }catch(loadError){
   setError(loadError.response?.data?.message||"Sales opportunities could not be loaded.");
  }finally{setLoading(false);}
 },[clientId]);

 useEffect(()=>{load();},[load]);

 const open=deal=>navigate("/deals?dealId="+encodeURIComponent(deal._id));
 const openNew=()=>navigate("/deals?clientId="+encodeURIComponent(clientId));

 return <section className="client-opportunities-panel" aria-label="Customer sales opportunities">
  <header className="client-opportunities-heading">
   <div><h3>Sales opportunities</h3><p>Enquiries, quotations and potential orders linked to this customer.</p></div>
   <div className="d-flex gap-2 flex-wrap">
    <button type="button" className="btn btn-light border" onClick={load} disabled={loading}><i className="bi bi-arrow-clockwise me-1"></i>Refresh</button>
    <button type="button" className="btn btn-primary" onClick={openNew}><i className="bi bi-plus-lg me-1"></i>New opportunity</button>
   </div>
  </header>
  {error&&<div className="alert alert-warning py-2" role="alert">{error}</div>}
  {loading?<div className="client-opportunities-state"><span className="spinner-border spinner-border-sm me-2"></span>Loading opportunities…</div>
   :!items.length?<div className="client-opportunities-empty">
    <span><i className="bi bi-kanban"></i></span>
    <strong>No sales opportunities linked yet</strong>
    <p>Track an enquiry, quotation or potential order for this customer. It will also appear in the main sales pipeline.</p>
    <button type="button" className="btn btn-primary btn-sm" onClick={openNew}>Add first opportunity</button>
   </div>
   :<div className="client-opportunities-list">
    {items.map(deal=>{
     const status=deal.status==="won"?"Won":deal.status==="lost"?"Lost":"Open";
     const stage=deal.stageLabel||String(deal.stageKey||"").replace(/[-_]+/g," ");
     return <button type="button" key={deal._id} className="client-opportunity-row" onClick={()=>open(deal)}>
      <span className={"client-opportunity-icon "+(deal.status==="won"?"is-won":deal.status==="lost"?"is-lost":"")}><i className={"bi "+(deal.status==="won"?"bi-trophy":deal.status==="lost"?"bi-flag":"bi-kanban")}></i></span>
      <span className="client-opportunity-main">
       <strong>{deal.title||"Untitled opportunity"}</strong>
       <span>{stage} · {status}{deal.expectedCloseDate?" · Expected "+date(deal.expectedCloseDate):""}</span>
      </span>
      <span className="client-opportunity-value">{money(deal.value)}</span>
      <i className="bi bi-chevron-right client-opportunity-arrow" aria-hidden="true"></i>
     </button>;
    })}
   </div>}
 </section>;
}
