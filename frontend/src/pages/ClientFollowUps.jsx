import React,{useCallback,useEffect,useMemo,useState} from "react";
import axios from "axios";
import {useNavigate} from "react-router-dom";
import BusinessPageHeader from "../components/BusinessPageHeader";
import "./ClientFollowUps.css";

const API=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const auth=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});
const EMPTY_SUMMARY={open:0,overdue:0,dueToday:0,upcoming:0,noDate:0,completed:0};
const FILTERS=[
 {key:"all",label:"All open",status:"open",bucket:"all"},
 {key:"overdue",label:"Overdue",status:"open",bucket:"overdue"},
 {key:"today",label:"Due today",status:"open",bucket:"today"},
 {key:"upcoming",label:"Upcoming",status:"open",bucket:"upcoming"},
 {key:"no_date",label:"No due date",status:"open",bucket:"no_date"},
 {key:"completed",label:"Completed",status:"completed",bucket:"all"}
];
const todayRange=()=>{
 const start=new Date();start.setHours(0,0,0,0);
 const end=new Date(start);end.setDate(end.getDate()+1);
 return {todayStart:start.toISOString(),tomorrowStart:end.toISOString()};
};
const dueState=item=>{
 if(item.status==="completed")return "completed";
 if(!item.dueAt)return "no-date";
 const due=new Date(item.dueAt),now=new Date();
 const tomorrow=new Date(now);tomorrow.setHours(0,0,0,0);tomorrow.setDate(tomorrow.getDate()+1);
 if(due<now)return "overdue";
 if(due<tomorrow)return "today";
 return "upcoming";
};
const formatDue=value=>{
 if(!value)return "No due date";
 const date=new Date(value);
 return Number.isNaN(date.getTime())?"Date not set":date.toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"});
};

export default function ClientFollowUps(){
 const navigate=useNavigate();
 const [filter,setFilter]=useState("all");
 const [search,setSearch]=useState("");
 const [page,setPage]=useState(1);
 const [items,setItems]=useState([]);
 const [pagination,setPagination]=useState({page:1,pages:1,total:0,limit:20});
 const [summary,setSummary]=useState(EMPTY_SUMMARY);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [savingId,setSavingId]=useState("");
 const [composerOpen,setComposerOpen]=useState(false);
 const [clients,setClients]=useState([]);
 const [clientsLoading,setClientsLoading]=useState(false);
 const [selectedClientId,setSelectedClientId]=useState("");
 const [subject,setSubject]=useState("");
 const [description,setDescription]=useState("");
 const [dueAt,setDueAt]=useState("");
 const [saving,setSaving]=useState(false);
 const selectedFilter=useMemo(()=>FILTERS.find(item=>item.key===filter)||FILTERS[0],[filter]);

 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const response=await axios.get(API+"/api/clients/follow-ups",{
    ...auth(),
    params:{status:selectedFilter.status,bucket:selectedFilter.bucket,page,limit:20,search:search.trim(),...todayRange()}
   });
   setItems(Array.isArray(response.data?.activities)?response.data.activities:[]);
   setPagination(response.data?.pagination||{page:1,pages:1,total:0,limit:20});
   setSummary(response.data?.summary||EMPTY_SUMMARY);
  }catch(loadError){
   setError(loadError.response?.data?.message||"Follow-ups could not be loaded. Please try again.");
  }finally{setLoading(false);}
 },[selectedFilter,page,search]);

 useEffect(()=>{load();},[load]);

 const openComposer=async()=>{
  setComposerOpen(true);setMessage("");setError("");
  if(clients.length||clientsLoading)return;
  setClientsLoading(true);
  try{
   const response=await axios.get(API+"/api/clients",auth());
   setClients(Array.isArray(response.data)?response.data.filter(client=>client.accountStatus!=="Inactive"):[]);
  }catch(loadError){
   setError(loadError.response?.data?.message||"Customers could not be loaded.");
  }finally{setClientsLoading(false);}
 };

 const resetComposer=()=>{
  setComposerOpen(false);setSelectedClientId("");setSubject("");setDescription("");setDueAt("");
 };

 const saveFollowUp=async event=>{
  event.preventDefault();
  if(!selectedClientId||!subject.trim()){
   setError("Choose a customer and enter what needs to be done.");
   return;
  }
  setSaving(true);setError("");setMessage("");
  try{
   await axios.post(API+"/api/clients/"+selectedClientId+"/activities",{
    type:"follow_up",subject:subject.trim(),description:description.trim(),
    ...(dueAt?{dueAt:new Date(dueAt).toISOString()}: {})
   },auth());
   resetComposer();
   setFilter("all");setPage(1);setSearch("");
   setMessage("Follow-up saved.");
  }catch(saveError){
   setError(saveError.response?.data?.message||"The follow-up could not be saved.");
  }finally{setSaving(false);}
 };

 const updateStatus=async(item,status)=>{
  setSavingId(String(item._id));setError("");
  try{
   await axios.patch(API+"/api/clients/"+item.clientId+"/activities/"+item._id,{status},auth());
   await load();
  }catch(updateError){
   setError(updateError.response?.data?.message||"The follow-up could not be updated.");
  }finally{setSavingId("");}
 };

 const clearSearch=()=>{setSearch("");setPage(1);};
 const showingRange=pagination.total===0?"No follow-ups":"Showing "+((pagination.page-1)*pagination.limit+1)+"–"+Math.min(pagination.page*pagination.limit,pagination.total)+" of "+pagination.total;
 const filteredItems=items;

 return (
  <div className="container-fluid py-4 client-followups-page">
   <BusinessPageHeader
    eyebrow="CUSTOMER REMINDERS"
    title="Follow-ups"
    description="A simple list of what you need to do for your customers."
    className="mb-3"
   >
    <button type="button" className="btn btn-primary client-followup-add" onClick={openComposer}>
     <i className="bi bi-plus-lg"></i><span>Add follow-up</span>
    </button>
   </BusinessPageHeader>

   {message&&<div className="alert alert-success py-2" role="status">{message}</div>}
   {error&&!composerOpen&&<div className="alert alert-warning py-2 d-flex align-items-center justify-content-between gap-2" role="alert"><span>{error}</span><button type="button" className="btn btn-sm btn-light border" onClick={load}>Try again</button></div>}

   <section className="client-followup-workspace">
    <div className="client-followup-toolbar">
     <div className="client-followup-tabs" role="group" aria-label="Filter follow-ups">
      {FILTERS.map(item=>{
       const count=item.key==="all"?summary.open:item.key==="overdue"?summary.overdue:item.key==="today"?summary.dueToday:item.key==="upcoming"?summary.upcoming:item.key==="no_date"?summary.noDate:summary.completed;
       return <button type="button" key={item.key} className={filter===item.key?"is-active":""} onClick={()=>{setFilter(item.key);setPage(1);}}>
        {item.label}<span className="client-followup-tab-count">{count}</span>
       </button>;
      })}
     </div>
     <label className="client-followup-search">
      <i className="bi bi-search"></i>
      <input type="search" aria-label="Search customers and reminders" placeholder="Search customer or reminder" value={search} onChange={event=>{setSearch(event.target.value);setPage(1);}}/>
      {search&&<button type="button" aria-label="Clear search" onClick={clearSearch}><i className="bi bi-x-lg"></i></button>}
     </label>
    </div>

    {loading?<div className="client-followup-loading"><span className="spinner-border spinner-border-sm me-2"/>Loading reminders...</div>
     :!filteredItems.length?<div className="client-followup-empty">
       <span><i className="bi bi-check2-circle"></i></span>
       <strong>{filter==="overdue"?"You're all caught up":filter==="completed"?"No completed reminders yet":"Nothing to do here"}</strong>
       <p>{filter==="overdue"?"There are no overdue customer follow-ups.":filter==="completed"?"Completed reminders will appear here.":"Add a reminder when a customer needs a call, message or next step."}</p>
       {filter!=="completed"&&<button type="button" className="btn btn-primary" onClick={openComposer}><i className="bi bi-plus-lg me-1"></i>Add follow-up</button>}
      </div>
     :<div className="client-followup-list">
      {filteredItems.map(item=>{
       const state=dueState(item);
       const customer=item.client||{};
       const customerName=customer.companyName||customer.name||"Customer";
       return (
        <article className="client-followup-row" key={item._id}>
         <div className={"client-followup-marker "+state}><i className={item.type==="task"?"bi bi-check2-square":"bi bi-bell"}></i></div>
         <div className="client-followup-copy">
          <strong>{item.subject}</strong>
          <button type="button" className="client-followup-customer" onClick={()=>navigate("/clients?openClient="+item.clientId)}>
           {customerName}{customer.phone?" · "+customer.phone:""}<i className="bi bi-arrow-up-right"></i>
          </button>
          {item.description&&<p>{item.description}</p>}
          <div className="client-followup-row-meta">
           <span className={"client-followup-due "+state}><i className="bi bi-calendar3"></i>{state==="overdue"?"Overdue · ":state==="today"?"Due today · ":state==="completed"?"Completed · ":""}{formatDue(item.dueAt)}</span>
           <span>Added {item.createdAt?new Date(item.createdAt).toLocaleDateString("en-IN"):"—"}</span>
          </div>
         </div>
         <div className="client-followup-actions">
          {item.status==="completed"
           ?<button type="button" className="btn btn-sm btn-light border" disabled={savingId===String(item._id)} onClick={()=>updateStatus(item,"open")}>Reopen</button>
           :<button type="button" className="btn btn-sm btn-outline-success" disabled={savingId===String(item._id)} onClick={()=>updateStatus(item,"completed")}>{savingId===String(item._id)?"Saving...":"Mark done"}</button>}
         </div>
        </article>
       );
      })}
     </div>}

    {!loading&&pagination.pages>1&&<div className="client-followup-pagination">
     <span>{showingRange}</span>
     <div>
      <button type="button" className="btn btn-sm btn-light border" disabled={pagination.page<=1} onClick={()=>setPage(value=>Math.max(1,value-1))}>Previous</button>
      <span>{pagination.page} / {pagination.pages}</span>
      <button type="button" className="btn btn-sm btn-light border" disabled={pagination.page>=pagination.pages} onClick={()=>setPage(value=>Math.min(pagination.pages,value+1))}>Next</button>
     </div>
    </div>}
   </section>

   {composerOpen&&(
    <div className="modal show d-block client-followup-modal" role="dialog" aria-modal="true" aria-label="Add customer follow-up" onMouseDown={event=>{if(event.target===event.currentTarget)resetComposer();}}>
     <div className="modal-dialog modal-dialog-centered">
      <form className="modal-content client-followup-dialog" onSubmit={saveFollowUp}>
       <div className="modal-header">
        <div><h2 className="modal-title">Add a follow-up</h2><p>Choose who this is for and what you need to remember.</p></div>
        <button type="button" className="btn-close" aria-label="Close" onClick={resetComposer}/>
       </div>
       <div className="modal-body">
        {error&&<div className="alert alert-warning py-2" role="alert">{error}</div>}
        <div className="mb-3">
         <label className="form-label" htmlFor="followup-client">Customer</label>
         <select id="followup-client" className="form-select" value={selectedClientId} onChange={event=>setSelectedClientId(event.target.value)} disabled={clientsLoading} required>
          <option value="">{clientsLoading?"Loading customers...":"Choose a customer"}</option>
          {clients.map(client=><option key={client._id} value={client._id}>{client.companyName||client.name||"Unnamed customer"}</option>)}
         </select>
        </div>
        <div className="mb-3">
         <label className="form-label" htmlFor="followup-subject">What needs to be done?</label>
         <input id="followup-subject" className="form-control" value={subject} onChange={event=>setSubject(event.target.value)} maxLength={160} placeholder="Example: Call about pending payment" required autoFocus/>
        </div>
        <div className="mb-3">
         <label className="form-label" htmlFor="followup-due">When should you do it? <span className="text-secondary fw-normal">(optional)</span></label>
         <input id="followup-due" className="form-control" type="datetime-local" value={dueAt} onChange={event=>setDueAt(event.target.value)}/>
        </div>
        <div>
         <label className="form-label" htmlFor="followup-description">Extra details <span className="text-secondary fw-normal">(optional)</span></label>
         <textarea id="followup-description" className="form-control" rows={3} maxLength={4000} value={description} onChange={event=>setDescription(event.target.value)} placeholder="Add notes or context..."/>
        </div>
       </div>
       <div className="modal-footer">
        <button type="button" className="btn btn-light border" onClick={resetComposer}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving||clientsLoading||!clients.length}>
         {saving?<><span className="spinner-border spinner-border-sm me-2"/>Saving...</>:"Save follow-up"}
        </button>
       </div>
      </form>
     </div>
    </div>
   )}
  </div>
 );
}
