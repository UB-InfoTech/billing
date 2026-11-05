import React,{useCallback,useEffect,useMemo,useState} from "react";
import axios from "axios";
import "./ClientActivityPanel.css";

const ACTIVITY_TYPES=[
 {value:"note",label:"Note",icon:"bi-sticky"},
 {value:"call",label:"Call",icon:"bi-telephone"},
 {value:"email",label:"Email",icon:"bi-envelope"},
 {value:"meeting",label:"Meeting",icon:"bi-calendar-event"},
 {value:"whatsapp",label:"WhatsApp",icon:"bi-chat-dots"},
 {value:"follow_up",label:"Follow-up",icon:"bi-bell"},
 {value:"task",label:"Task",icon:"bi-check2-square"},
 {value:"other",label:"Other",icon:"bi-three-dots"}
];
const FILTERS=[
 {value:"all",label:"All"},
 {value:"interaction",label:"Conversations"},
 {value:"billing",label:"Invoices & payments"},
 {value:"follow_up",label:"Follow-ups"},
 {value:"finance",label:"Other finance"}
];
const TYPE_LABELS={
 client_created:"Customer",profile_update:"Profile update",calendar_event:"Calendar event",invoice_created:"Invoice",invoice_updated:"Invoice",
 invoice_status:"Invoice status",payment_added:"Payment",payment_edited:"Payment",
 payment_deleted:"Payment",payment_received:"Payment",credit_note_posted:"Credit Note",
 credit_note_edited:"Credit Note",credit_note_cancelled:"Credit Note",credit_note_created:"Credit Note",
 credit_adjustment:"Customer credit",expense_linked:"Expense",note:"Note",call:"Call",
 email:"Email",meeting:"Meeting",whatsapp:"WhatsApp",follow_up:"Follow-up",task:"Task",other:"Activity"
};
const ICONS={
 client_created:"bi-person-plus",profile_update:"bi-person-gear",calendar_event:"bi-calendar-event",invoice_created:"bi-receipt",invoice_updated:"bi-pencil-square",
 invoice_status:"bi-arrow-left-right",payment_added:"bi-cash-coin",payment_edited:"bi-cash",
 payment_deleted:"bi-cash-stack",payment_received:"bi-cash-coin",credit_note_posted:"bi-file-earmark-minus",
 credit_note_edited:"bi-file-earmark-text",credit_note_cancelled:"bi-file-earmark-x",
 credit_note_created:"bi-file-earmark-minus",credit_adjustment:"bi-wallet2",expense_linked:"bi-wallet",
 note:"bi-sticky",call:"bi-telephone",email:"bi-envelope",meeting:"bi-calendar-event",
 whatsapp:"bi-chat-dots",follow_up:"bi-bell",task:"bi-check2-square",other:"bi-clock-history"
};
const money=value=>"₹"+Number(value||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
const dateTime=value=>{
 const date=value?new Date(value):null;
 return date&&!Number.isNaN(date.getTime())?date.toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"}):"Date not available";
};
const localDateTimeValue=value=>{
 if(!value)return "";
 const date=new Date(value);
 if(Number.isNaN(date.getTime()))return "";
 const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);
 return local.toISOString().slice(0,16);
};

export default function ClientActivityPanel({clientId,apiBase}){
 const [activities,setActivities]=useState([]);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const [filter,setFilter]=useState("all");
 const [limit,setLimit]=useState(150);
 const [hasMore,setHasMore]=useState(false);
 const [type,setType]=useState("note");
 const [subject,setSubject]=useState("");
 const [description,setDescription]=useState("");
 const [occurredAt,setOccurredAt]=useState("");
 const [dueAt,setDueAt]=useState("");

 const loadActivities=useCallback(async()=>{
  if(!clientId)return;
  setLoading(true);
  setError("");
  try{
   const response=await axios.get(`${apiBase}/api/clients/${clientId}/activities`,{
    headers:{"x-auth-token":localStorage.getItem("token")||""},
    params:{limit}
   });
   setActivities(response.data?.activities||[]);
   setHasMore(Boolean(response.data?.hasMore));
  }catch(loadError){
   setError(loadError.response?.data?.message||"Customer activity could not be loaded. Please try again.");
  }finally{setLoading(false);}
 },[apiBase,clientId,limit]);

 useEffect(()=>{loadActivities();},[loadActivities]);

 const visibleActivities=useMemo(()=>{
  if(filter==="all")return activities;
  return activities.filter(item=>item.category===filter);
 },[activities,filter]);

 const submitActivity=async event=>{
  event.preventDefault();
  if(!subject.trim()){
   setError("Add a short title before saving.");
   return;
  }
  setSaving(true);
  setError("");
  try{
   await axios.post(`${apiBase}/api/clients/${clientId}/activities`,{
    type,subject:subject.trim(),description:description.trim(),
    ...(occurredAt?{occurredAt:new Date(occurredAt).toISOString()}:{}),
    ...(dueAt&&["task","follow_up"].includes(type)?{dueAt:new Date(dueAt).toISOString()}:{} )
   },{headers:{"x-auth-token":localStorage.getItem("token")||""}});
   setSubject("");
   setDescription("");
   setOccurredAt("");
   setDueAt("");
   await loadActivities();
  }catch(saveError){
   setError(saveError.response?.data?.message||"This activity could not be saved.");
  }finally{setSaving(false);}
 };

 const updateFollowUp=async(activity,status)=>{
  setError("");
  try{
   await axios.patch(`${apiBase}/api/clients/${clientId}/activities/${activity.sourceId}`,{status},{
    headers:{"x-auth-token":localStorage.getItem("token")||""}
   });
   await loadActivities();
  }catch(updateError){
   setError(updateError.response?.data?.message||"The follow-up could not be updated.");
  }
 };

 const needsDueDate=["task","follow_up"].includes(type);

 return (
  <section className="client-activity-panel" aria-label="Customer activity timeline">
   <div className="client-activity-heading">
    <div>
     <div className="client-activity-eyebrow">CUSTOMER CRM</div>
     <h6 className="mb-1">Activity & follow-ups</h6>
     <p className="mb-0 text-secondary small">One history of conversations, invoices, payments, credit notes and expenses.</p>
    </div>
    <button type="button" className="btn btn-sm btn-light border" onClick={loadActivities} disabled={loading}>
     <i className="bi bi-arrow-clockwise me-1"></i>Refresh
    </button>
   </div>

   <div className="client-activity-layout">
    <form className="client-activity-composer" onSubmit={submitActivity}>
     <div className="d-flex align-items-center gap-2 mb-3">
      <span className="client-activity-compose-icon"><i className="bi bi-plus-lg"></i></span>
      <div><strong>Log an activity</strong><div className="small text-secondary">Keep the customer conversation up to date.</div></div>
     </div>
     <label className="form-label" htmlFor="client-activity-type">Activity type</label>
     <select id="client-activity-type" className="form-select mb-3" value={type} onChange={event=>setType(event.target.value)}>
      {ACTIVITY_TYPES.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
     </select>
     <label className="form-label" htmlFor="client-activity-subject">Title</label>
     <input id="client-activity-subject" className="form-control mb-3" maxLength={160} value={subject} onChange={event=>setSubject(event.target.value)} placeholder={type==="task"?"Example: Send revised quotation":type==="call"?"Example: Discussed order requirements":"What happened?"} required/>
     <label className="form-label" htmlFor="client-activity-description">Details <span className="text-secondary fw-normal">(optional)</span></label>
     <textarea id="client-activity-description" className="form-control mb-3" rows={3} maxLength={4000} value={description} onChange={event=>setDescription(event.target.value)} placeholder="Add the important points, outcome or next steps..."/>
     <label className="form-label" htmlFor="client-activity-date">Activity date <span className="text-secondary fw-normal">(optional)</span></label>
     <input id="client-activity-date" className="form-control mb-3" type="datetime-local" value={occurredAt} onChange={event=>setOccurredAt(event.target.value)}/>
     {needsDueDate&&(
      <>
       <label className="form-label" htmlFor="client-activity-due">Follow-up due <span className="text-secondary fw-normal">(optional)</span></label>
       <input id="client-activity-due" className="form-control mb-3" type="datetime-local" min={localDateTimeValue(new Date())} value={dueAt} onChange={event=>setDueAt(event.target.value)}/>
       <div className="small text-secondary mb-3">This will stay open until you mark it complete.</div>
      </>
     )}
     <button type="submit" className="btn btn-primary w-100" disabled={saving||loading}>
      {saving?<><span className="spinner-border spinner-border-sm me-2"></span>Saving...</>:<><i className="bi bi-plus-lg me-1"></i>Save activity</>}
     </button>
    </form>

    <div className="client-activity-feed">
     <div className="client-activity-feed-toolbar">
      <div><strong>Customer history</strong><div className="small text-secondary">{activities.length} recent entr{activities.length===1?"y":"ies"}</div></div>
      <div className="client-activity-filters" role="group" aria-label="Filter customer history">
       {FILTERS.map(item=><button type="button" key={item.value} className={filter===item.value?"is-active":""} onClick={()=>setFilter(item.value)}>{item.label}</button>)}
      </div>
     </div>

     {error&&<div className="alert alert-warning py-2 small" role="alert">{error}</div>}
     {loading&&<div className="client-activity-loading"><span className="spinner-border spinner-border-sm me-2"></span>Loading customer history...</div>}
     {!loading&&!visibleActivities.length&&(
      <div className="client-activity-empty">
       <span><i className="bi bi-clock-history"></i></span>
       <strong>{activities.length?"No entries in this filter yet":"No activity recorded yet"}</strong>
       <p className="mb-0 small text-secondary">{activities.length?"Choose another filter to see more of this customer's history.":"Log the first note or conversation. Invoices and payments will appear here automatically."}</p>
      </div>
     )}
     {!loading&&visibleActivities.length>0&&(
      <div className="client-activity-timeline">
       {visibleActivities.map(activity=>{
        const typeInfo=ACTIVITY_TYPES.find(item=>item.value===activity.type);
        const isOpen=["open"].includes(activity.status);
        return (
         <article className="client-activity-entry" key={activity.id}>
          <div className="client-activity-entry-icon"><i className={`bi ${ICONS[activity.type]||typeInfo?.icon||"bi-clock-history"}`}></i></div>
          <div className="client-activity-entry-content">
           <div className="client-activity-entry-meta">
            <span>{TYPE_LABELS[activity.type]||"Activity"}</span>
            <time dateTime={activity.occurredAt}>{dateTime(activity.occurredAt)}</time>
           </div>
           <h6>{activity.title}</h6>
           {activity.description&&<p className="client-activity-description">{activity.description}</p>}
           <div className="client-activity-entry-foot">
            {activity.reference&&<span><i className="bi bi-link-45deg me-1"></i>{activity.reference}</span>}
            {activity.amount!==null&&activity.amount!==undefined&&<strong>{money(activity.amount)}</strong>}
            {activity.dueAt&&<span className={isOpen?"text-primary":""}><i className="bi bi-calendar2-check me-1"></i>Due {dateTime(activity.dueAt)}</span>}
            {activity.status&&!activity.canUpdateStatus&&<span className="client-activity-status">{activity.status}</span>}
           </div>
           {activity.canUpdateStatus&&(
            <div className="client-activity-task-actions">
             <span className={`client-activity-task-state ${isOpen?"is-open":activity.status==="completed"?"is-complete":"is-cancelled"}`}>{activity.status==="completed"?"Completed":activity.status==="cancelled"?"Cancelled":"Open"}</span>
             {isOpen
              ?<button type="button" className="btn btn-sm btn-outline-success" onClick={()=>updateFollowUp(activity,"completed")}>Mark complete</button>
              :<button type="button" className="btn btn-sm btn-light border" onClick={()=>updateFollowUp(activity,"open")}>Reopen</button>}
            </div>
           )}
          </div>
         </article>
        );
       })}
      </div>
     )}
     {!loading&&hasMore&&(
      <button type="button" className="btn btn-sm btn-light border client-activity-load-more" onClick={()=>setLimit(current=>Math.min(500,current+150))} disabled={limit>=500}>
       {limit>=500?"Showing up to 500 entries":"Load older activity"}
      </button>
     )}
    </div>
   </div>
  </section>
 );
}
