import React,{useCallback,useEffect,useState} from "react";
import axios from "axios";
import {useNavigate} from "react-router-dom";
import BusinessPageHeader from "../components/BusinessPageHeader";
import "./ClientFollowUps.css";

const API=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const auth=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});
const dateLabel=value=>{
 if(!value)return "No due date";
 const date=new Date(value);
 return Number.isNaN(date.getTime())?"Date not set":date.toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"});
};
const todayRange=()=>{
 const start=new Date();start.setHours(0,0,0,0);
 const end=new Date(start);end.setDate(end.getDate()+1);
 return {todayStart:start.toISOString(),tomorrowStart:end.toISOString()};
};
const getDateState=item=>{
 if(item.status==="completed")return "completed";
 if(!item.dueAt)return "no-date";
 const due=new Date(item.dueAt);
 const today=new Date();today.setHours(0,0,0,0);
 const tomorrow=new Date(today);tomorrow.setDate(tomorrow.getDate()+1);
 if(due<today)return "overdue";
 if(due<tomorrow)return "today";
 return "upcoming";
};
const FILTERS=[
 {key:"all",label:"All open",status:"open",bucket:"all"},
 {key:"overdue",label:"Overdue",status:"open",bucket:"overdue"},
 {key:"today",label:"Due today",status:"open",bucket:"today"},
 {key:"upcoming",label:"Upcoming",status:"open",bucket:"upcoming"},
 {key:"no_date",label:"No due date",status:"open",bucket:"no_date"},
 {key:"completed",label:"Completed",status:"completed",bucket:"all"}
];
const EMPTY_SUMMARY={open:0,overdue:0,dueToday:0,upcoming:0,noDate:0,completed:0};

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

 const selectedFilter=FILTERS.find(item=>item.key===filter)||FILTERS[0];
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const response=await axios.get(API+"/api/clients/follow-ups",{
    ...auth(),
    params:{
     status:selectedFilter.status,
     bucket:selectedFilter.bucket,
     page,limit:20,search:search.trim(),...todayRange()
    }
   });
   setItems(Array.isArray(response.data?.activities)?response.data.activities:[]);
   setPagination(response.data?.pagination||{page:1,pages:1,total:0,limit:20});
   setSummary(response.data?.summary||EMPTY_SUMMARY);
  }catch(loadError){
   setError(loadError.response?.data?.message||"Follow-ups could not be loaded. Try again.");
  }finally{setLoading(false);}
 },[selectedFilter.bucket,selectedFilter.status,page,search]);

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

 const saveFollowUp=async event=>{
  event.preventDefault();
  if(!selectedClientId||!subject.trim()){
   setError("Choose a customer and add a short title.");
   return;
  }
  setSaving(true);setError("");setMessage("");
  try{
   await axios.post(API+"/api/clients/"+selectedClientId+"/activities",{
    type:"follow_up",
    subject:subject.trim(),
    description:description.trim(),
    ...(dueAt?{dueAt:new Date(dueAt).toISOString()}: {})
   },auth());
   setSubject("");setDescription("");setDueAt("");setSelectedClientId("");
   setComposerOpen(false);setFilter("all");setPage(1);
   setMessage("Follow-up added to the customer record.");
   await load();
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

 const showingRange=pagination.total===0?"No follow-ups":"Showing "+((pagination.page-1)*pagination.limit+1)+"–"+Math.min(pagination.page*pagination.limit,pagination.total)+" of "+pagination.total;

 return (
  <div className="container-fluid py-4 client-followups-page">
   <BusinessPageHeader
    eyebrow="CUSTOMER RELATIONSHIPS"
    title="Follow-ups"
    description="See what needs attention, keep your promises and stay on top of every customer conversation."
    className="mb-3"
   >
    <button type="button" className="btn btn-primary" onClick={openComposer}><i className="bi bi-plus-lg me-2"></i>Add follow-up</button>
   </BusinessPageHeader>

   {message&&<div className="alert alert-success py-2" role="status">{message}</div>}
   {error&&<div className="alert alert-warning py-2 d-flex align-items-center justify-content-between gap-2" role="alert"><span>{error}</span><button type="button" className="btn btn-sm btn-light border" onClick={load}>Try again</button></div>}

   <div className="client-followup-stats">
    <button type="button" className={filter==="all"?"is-selected":""} onClick={()=>{setFilter("all");setPage(1);}}>
     <span className="client-followup-stat-label">Open follow-ups</span><strong>{summary.open}</strong><small>Still to do</small>
    </button>
    <button type="button" className={filter==="overdue"?"is-selected":""} onClick={()=>{setFilter("overdue");setPage(1);}}>
     <span className="client-followup-stat-label">Overdue</span><strong className="text-danger">{summary.overdue}</strong><small>Past the due date</small>
    </button>
    <button type="button" className={filter==="today"?"is-selected":""} onClick={()=>{setFilter("today");setPage(1);}}>
     <span className="client-followup-stat-label">Due today</span><strong>{summary.dueToday}</strong><small>Needs attention today</small>
    </button>
    <button type="button" className={filter==="upcoming"?"is-selected":""} onClick={()=>{setFilter("upcoming");setPage(1);}}>
     <span className="client-followup-stat-label">Coming up</span><strong>{summary.upcoming}</strong><small>Future follow-ups</small>
    </button>
   </div>

   {composerOpen&&(
    <form className="client-followup-composer card border-0 shadow-sm p-3 p-lg-4 mb-3" onSubmit={saveFollowUp}>
     <div className="d-flex align-items-start justify-content-between gap-2 mb-3">
      <div><h5 className="fw-bold mb-1">Add a customer follow-up</h5><p className="small text-secondary mb-0">Choose a customer, write what needs to happen and set a reminder date.</p></div>
      <button type="button" className="btn-close" aria-label="Close follow-up form" onClick={()=>setComposerOpen(false)} />
     </div>
     <div className="row g-3">
      <div className="col-lg-4">
       <label className="form-label" htmlFor="followup-client">Customer</label>
       <select id="followup-client" className="form-select" value={selectedClientId} onChange={event=>setSelectedClientId(event.target.value)} disabled={clientsLoading} required>
        <option value="">{clientsLoading?"Loading customers…":"Choose a customer"}</option>
        {clients.map(client=><option key={client._id} value={client._id}>{client.companyName||client.name||"Unnamed customer"}</option>)}
       </select>
       {!clientsLoading&&!clients.length&&<small className="text-secondary">No active customers found.</small>}
      </div>
      <div className="col-lg-4">
       <label className="form-label" htmlFor="followup-subject">What needs to happen?</label>
       <input id="followup-subject" className="form-control" value={subject} onChange={event=>setSubject(event.target.value)} maxLength={160} placeholder="Example: Call about pending payment" required/>
      </div>
      <div className="col-lg-4">
       <label className="form-label" htmlFor="followup-due">Due date and time <span className="text-secondary fw-normal">(optional)</span></label>
       <input id="followup-due" className="form-control" type="datetime-local" value={dueAt} onChange={event=>setDueAt(event.target.value)}/>
      </div>
      <div className="col-12">
       <label className="form-label" htmlFor="followup-description">Details <span className="text-secondary fw-normal">(optional)</span></label>
       <textarea id="followup-description" className="form-control" rows={2} maxLength={4000} value={description} onChange={event=>setDescription(event.target.value)} placeholder="Add context or the next step..."/>
      </div>
     </div>
     <div className="d-flex justify-content-end gap-2 mt-3">
      <button type="button" className="btn btn-light border" onClick={()=>setComposerOpen(false)}>Cancel</button>
      <button type="submit" className="btn btn-primary" disabled={saving||clientsLoading||!clients.length}>{saving?<><span className="spinner-border spinner-border-sm me-2"/>Saving…</>:"Save follow-up"}</button>
     </div>
    </form>
   )}

   <section className="card border-0 shadow-sm client-followup-list">
    <div className="client-followup-toolbar">
     <div className="client-followup-tabs" role="group" aria-label="Filter follow-ups">
      {FILTERS.map(item=><button type="button" key={item.key} className={filter===item.key?"is-active":""} onClick={()=>{setFilter(item.key);setPage(1);}}>{item.label}{item.key==="overdue"&&summary.overdue>0?<span>{summary.overdue}</span>:null}</button>)}
     </div>
     <div className="client-followup-search">
      <i className="bi bi-search"></i>
      <input type="search" aria-label="Search follow-ups and customers" placeholder="Search customer or follow-up" value={search} onChange={event=>{setSearch(event.target.value);setPage(1);}}/>
      {search&&<button type="button" aria-label="Clear search" onClick={()=>{setSearch("");setPage(1);}}><i className="bi bi-x-lg"></i></button>}
     </div>
    </div>

    {loading?<div className="client-followup-loading"><span className="spinner-border spinner-border-sm me-2"/>Loading follow-ups…</div>
     :!items.length?<div className="client-followup-empty">
       <span><i className="bi bi-check2-circle"></i></span>
       <strong>{filter==="overdue"?"You are up to date":filter==="completed"?"No completed follow-ups yet":"No follow-ups here"}</strong>
       <p className="mb-0 small text-secondary">{filter==="overdue"?"There are no overdue customer follow-ups.":"Add a follow-up to remember the next important step with a customer."}</p>
       {filter!=="completed"&&<button type="button" className="btn btn-sm btn-outline-primary mt-3" onClick={openComposer}>Add a follow-up</button>}
      </div>
     :<div className="client-followup-items">
      {items.map(item=>{
       const state=getDateState(item);
       const client=item.client||{};
       const clientName=client.companyName||client.name||"Customer";
       return (
        <article className="client-followup-item" key={item._id}>
         <div className={"client-followup-item-icon "+state}><i className={item.type==="task"?"bi bi-check2-square":"bi bi-bell"}></i></div>
         <div className="client-followup-item-main">
          <div className="client-followup-item-heading">
           <div><strong>{item.subject}</strong><div className="small text-secondary">{clientName}{client.phone?" · "+client.phone:""}</div></div>
           <span className={"client-followup-due "+state}>{state==="overdue"?"Overdue":state==="today"?"Due today":state==="upcoming"?"Upcoming":state==="completed"?"Completed":"No due date"}</span>
          </div>
          {item.description&&<p className="client-followup-description">{item.description}</p>}
          <div className="client-followup-item-footer">
           <span><i className="bi bi-calendar2 me-1"></i>{dateLabel(item.dueAt)}</span>
           <span>Added {new Date(item.createdAt).toLocaleDateString("en-IN")}</span>
          </div>
         </div>
         <div className="client-followup-actions">
          <button type="button" className="btn btn-sm btn-light border" onClick={()=>navigate("/clients?openClient="+item.clientId)}><i className="bi bi-person-lines-fill me-1"></i>Customer</button>
          {item.status==="completed"
           ?<button type="button" className="btn btn-sm btn-outline-secondary" disabled={savingId===String(item._id)} onClick={()=>updateStatus(item,"open")}>Reopen</button>
           :<button type="button" className="btn btn-sm btn-outline-success" disabled={savingId===String(item._id)} onClick={()=>updateStatus(item,"completed")}>{savingId===String(item._id)?"Saving…":"Mark done"}</button>}
         </div>
        </article>
       );
      })}
     </div>}
    {!loading&&pagination.pages>1&&<div className="client-followup-pagination">
      <span className="small text-secondary">{showingRange}</span>
      <div className="d-flex gap-2">
       <button type="button" className="btn btn-sm btn-light border" disabled={pagination.page<=1} onClick={()=>setPage(value=>Math.max(1,value-1))}>Previous</button>
       <span className="small text-secondary align-self-center">{pagination.page} / {pagination.pages}</span>
       <button type="button" className="btn btn-sm btn-light border" disabled={pagination.page>=pagination.pages} onClick={()=>setPage(value=>Math.min(pagination.pages,value+1))}>Next</button>
      </div>
     </div>}
   </section>
  </div>
 );
}
