import React,{useCallback,useEffect,useMemo,useState} from "react";
import {useNavigate} from "react-router-dom";
import axios from "axios";
import "./ClientActivityPanel.css";

const ACTIVITY_TYPES=[
 {value:"note",label:"Note",icon:"bi-sticky"},
 {value:"call",label:"Call",icon:"bi-telephone"},
 {value:"whatsapp",label:"WhatsApp",icon:"bi-chat-dots"},
 {value:"email",label:"Email",icon:"bi-envelope"},
 {value:"meeting",label:"Meeting",icon:"bi-calendar-event"},
 {value:"follow_up",label:"Follow-up",icon:"bi-bell"},
 {value:"task",label:"Task",icon:"bi-check2-square"},
 {value:"other",label:"Other",icon:"bi-three-dots"}
];

const FILTERS=[
 {value:"all",label:"Everything"},
 {value:"interaction",label:"Conversations"},
 {value:"billing",label:"Bills & payments"},
 {value:"follow_up",label:"Reminders"},
 {value:"finance",label:"Other"}
];

const ACTIVITY_FILTERS=[
 {value:"all",label:"All activities"},
 {value:"interaction",label:"Conversations"},
 {value:"follow_up",label:"Tasks & reminders"}
];

const TYPE_LABELS={
 client_created:"Customer added",profile_update:"Details changed",calendar_event:"Calendar event",
 invoice_created:"Invoice created",invoice_updated:"Invoice updated",invoice_status:"Invoice status",
 payment_added:"Payment received",payment_edited:"Payment changed",payment_deleted:"Payment removed",
 payment_received:"Payment received",credit_note_posted:"Credit Note posted",credit_note_edited:"Credit Note updated",
 credit_note_cancelled:"Credit Note cancelled",credit_note_created:"Credit Note created",
 credit_adjustment:"Customer credit",expense_linked:"Expense",note:"Note",call:"Call",
 email:"Email",meeting:"Meeting",whatsapp:"WhatsApp",follow_up:"Follow-up",task:"Task",other:"Activity"
};

const ICONS={
 client_created:"bi-person-plus",profile_update:"bi-person-gear",calendar_event:"bi-calendar-event",
 invoice_created:"bi-receipt",invoice_updated:"bi-pencil-square",invoice_status:"bi-arrow-left-right",
 payment_added:"bi-cash-coin",payment_edited:"bi-cash",payment_deleted:"bi-cash-stack",
 payment_received:"bi-cash-coin",credit_note_posted:"bi-file-earmark-minus",
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

export default function ClientActivityPanel({clientId,apiBase,mode="timeline"}){
 const navigate=useNavigate();
 const [activities,setActivities]=useState([]);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [updatingId,setUpdatingId]=useState("");
 const [error,setError]=useState("");
 const [filter,setFilter]=useState("all");
 const [limit,setLimit]=useState(100);
 const [hasMore,setHasMore]=useState(false);
 const [showComposer,setShowComposer]=useState(false);
 const [type,setType]=useState("note");
 const [subject,setSubject]=useState("");
 const [description,setDescription]=useState("");
 const [dueAt,setDueAt]=useState("");
 const [occurredAt,setOccurredAt]=useState("");
 const [showPastDate,setShowPastDate]=useState(false);

 const loadActivities=useCallback(async()=>{
  if(!clientId)return;
  setLoading(true);
  setError("");
  try{
   const response=await axios.get(apiBase+"/api/clients/"+clientId+"/activities",{
    headers:{"x-auth-token":localStorage.getItem("token")||""},
    params:{limit}
   });
   setActivities(Array.isArray(response.data?.activities)?response.data.activities:[]);
   setHasMore(Boolean(response.data?.hasMore));
  }catch(loadError){
   setError(loadError.response?.data?.message||"Activity history could not be loaded. Please try again.");
  }finally{
   setLoading(false);
  }
 },[apiBase,clientId,limit]);

 useEffect(()=>{loadActivities();},[loadActivities]);

 const filterOptions=mode==="activities"?ACTIVITY_FILTERS:FILTERS;
 const visibleActivities=useMemo(()=>{
  const source=mode==="activities"
   ?activities.filter(item=>item.type!=="note"&&["interaction","follow_up"].includes(item.category))
   :activities;
  if(filter==="all")return source;
  return source.filter(item=>item.category===filter);
 },[activities,filter,mode]);

 const resetComposer=()=>{
  setSubject("");
  setDescription("");
  setDueAt("");
  setOccurredAt("");
  setShowPastDate(false);
  setType("note");
  setShowComposer(false);
 };

 const submitActivity=async event=>{
  event.preventDefault();
  if(!subject.trim()){
   setError("Please enter a short title.");
   return;
  }
  setSaving(true);
  setError("");
  try{
   await axios.post(apiBase+"/api/clients/"+clientId+"/activities",{
    type,
    subject:subject.trim(),
    description:description.trim(),
    ...(occurredAt?{occurredAt:new Date(occurredAt).toISOString()}:{}),
    ...(dueAt&&["task","follow_up"].includes(type)?{dueAt:new Date(dueAt).toISOString()}: {})
   },{headers:{"x-auth-token":localStorage.getItem("token")||""}});
   resetComposer();
   setFilter("all");
   await loadActivities();
  }catch(saveError){
   setError(saveError.response?.data?.message||"This activity could not be saved. Please try again.");
  }finally{
   setSaving(false);
  }
 };

 const updateFollowUp=async(activity,status)=>{
  setError("");
  setUpdatingId(String(activity.sourceId));
  try{
   await axios.patch(apiBase+"/api/clients/"+clientId+"/activities/"+activity.sourceId,{status},{
    headers:{"x-auth-token":localStorage.getItem("token")||""}
   });
   await loadActivities();
  }catch(updateError){
   setError(updateError.response?.data?.message||"The reminder could not be updated.");
  }finally{
   setUpdatingId("");
  }
 };

 const openLinkedRecord=activity=>{
  const id=encodeURIComponent(activity.sourceId||"");
  if(!id)return;
  if(activity.source==="invoice"||activity.source==="payment")navigate("/orders?openInvoice="+id);
  else if(activity.source==="credit_note")navigate("/credit-notes?openCreditNote="+id);
  else if(activity.source==="calendar")navigate("/calendar?openEvent="+id);
 };

 const needsDueDate=type==="task"||type==="follow_up";

 return (
  <section className="client-activity-panel" aria-label="Customer activity">
   <div className="client-activity-heading">
    <div>
     <h3>{mode==="activities"?"Activities":"Customer timeline"}</h3>
     <p>{mode==="activities"?"Record calls, messages, meetings, tasks and customer follow-ups.":"A chronological view of customer conversations, account changes, bills and payments."}</p>
    </div>
    <div className="client-activity-heading-actions">
     <button type="button" className="btn btn-light border" onClick={loadActivities} disabled={loading} aria-label="Refresh activity">
      <i className="bi bi-arrow-clockwise"></i><span>Refresh</span>
     </button>
     <button type="button" className="btn btn-primary" onClick={()=>{setShowComposer(value=>!value);setError("");}}>
      <i className={showComposer?"bi bi-x-lg":"bi bi-plus-lg"}></i><span>{showComposer?"Close":"Add activity"}</span>
     </button>
    </div>
   </div>

   {error&&<div className="alert alert-warning py-2 mx-3 mt-3 mb-0" role="alert">{error}</div>}

   {showComposer&&(
    <form className="client-activity-composer" onSubmit={submitActivity}>
     <div className="client-activity-composer-title">
      <div><strong>What would you like to record?</strong><span>Choose the type, add a short title and save.</span></div>
      <button type="button" className="btn-close" aria-label="Close activity form" onClick={resetComposer}/>
     </div>
     <div className="client-activity-type-options" role="group" aria-label="Activity type">
      {ACTIVITY_TYPES.map(item=>(
       <button type="button" key={item.value} className={type===item.value?"is-selected":""} onClick={()=>setType(item.value)}>
        <i className={"bi "+item.icon}></i>{item.label}
       </button>
      ))}
     </div>
     <div className="row g-3">
      <div className="col-12">
       <label className="form-label" htmlFor="client-activity-subject">Title</label>
       <input id="client-activity-subject" className="form-control" maxLength={160} value={subject} onChange={event=>setSubject(event.target.value)} placeholder={type==="task"?"Example: Send the revised quotation":type==="call"?"Example: Discussed delivery date":type==="follow_up"?"Example: Call about pending payment":"Write a short summary"} required autoFocus/>
      </div>
      <div className="col-12">
       <label className="form-label" htmlFor="client-activity-description">Details <span className="text-secondary fw-normal">(optional)</span></label>
       <textarea id="client-activity-description" className="form-control" rows={2} maxLength={4000} value={description} onChange={event=>setDescription(event.target.value)} placeholder="Add details, decisions or next steps..."/>
      </div>
      {needsDueDate&&(
       <div className="col-md-6">
        <label className="form-label" htmlFor="client-activity-due">Remind me by <span className="text-secondary fw-normal">(optional)</span></label>
        <input id="client-activity-due" className="form-control" type="datetime-local" min={localDateTimeValue(new Date())} value={dueAt} onChange={event=>setDueAt(event.target.value)}/>
       </div>
      )}
      <div className="col-12">
       <button type="button" className="client-activity-date-toggle" onClick={()=>setShowPastDate(value=>!value)}>
        <i className="bi bi-calendar3"></i>{showPastDate?"Hide activity date":"Record an earlier activity"}
       </button>
       {showPastDate&&<input aria-label="Activity date" className="form-control client-activity-past-date" type="datetime-local" value={occurredAt} onChange={event=>setOccurredAt(event.target.value)}/>}
      </div>
     </div>
     <div className="client-activity-composer-footer">
      <span className="small text-secondary">Reminders stay open until you mark them done.</span>
      <button type="submit" className="btn btn-primary" disabled={saving||loading}>
       {saving?<><span className="spinner-border spinner-border-sm me-2"></span>Saving...</>:<><i className="bi bi-check2 me-1"></i>Save activity</>}
      </button>
     </div>
    </form>
   )}

   <div className="client-activity-feed">
    <div className="client-activity-feed-toolbar">
     <div>
      <strong>Recent activity</strong>
      <span>{visibleActivities.length} entr{visibleActivities.length===1?"y":"ies"}</span>
     </div>
     <div className="client-activity-filters" role="group" aria-label="Filter activity">
      {filterOptions.map(item=>(
       <button type="button" key={item.value} className={filter===item.value?"is-active":""} onClick={()=>setFilter(item.value)}>{item.label}</button>
      ))}
     </div>
    </div>

    {loading&&<div className="client-activity-loading"><span className="spinner-border spinner-border-sm me-2"></span>Loading activity...</div>}

    {!loading&&visibleActivities.length===0&&(
     <div className="client-activity-empty">
      <span><i className="bi bi-chat-square-text"></i></span>
      <strong>{activities.length?"Nothing in this view yet":"No activity recorded yet"}</strong>
      <p>{activities.length?"Try another filter to see more of this customer's history.":"Add a note or record a conversation. Bills and payments appear here automatically."}</p>
      {!activities.length&&<button type="button" className="btn btn-outline-primary" onClick={()=>setShowComposer(true)}>Add the first activity</button>}
     </div>
    )}

    {!loading&&visibleActivities.length>0&&(
     <div className="client-activity-timeline">
      {visibleActivities.map(activity=>{
       const isOpen=activity.status==="open";
       const statusLabel=activity.status==="completed"?"Done":activity.status==="cancelled"?"Cancelled":"To do";
       const linked=["invoice","payment","credit_note","calendar"].includes(activity.source)&&Boolean(activity.sourceId);
       return (
        <article className="client-activity-entry" key={activity.id}>
         <div className="client-activity-entry-icon"><i className={"bi "+(ICONS[activity.type]||"bi-clock-history")}></i></div>
         <div className="client-activity-entry-content">
          <div className="client-activity-entry-meta">
           <span>{TYPE_LABELS[activity.type]||"Activity"}</span>
           <time dateTime={activity.occurredAt}>{dateTime(activity.occurredAt)}</time>
          </div>
          <h4>{activity.title}</h4>
          {activity.description&&<p className="client-activity-description">{activity.description}</p>}
          <div className="client-activity-entry-foot">
           {activity.reference&&<span><i className="bi bi-hash"></i>{activity.reference}</span>}
           {activity.amount!==null&&activity.amount!==undefined&&<strong>{money(activity.amount)}</strong>}
           {activity.dueAt&&<span className={isOpen?"is-due":""}><i className="bi bi-calendar2-check"></i>{isOpen?"Due ":"Due "}{dateTime(activity.dueAt)}</span>}
           {activity.status&&!activity.canUpdateStatus&&<span className="client-activity-status">{activity.status}</span>}
           {linked&&<button type="button" className="client-activity-open-record" onClick={()=>openLinkedRecord(activity)}>Open record <i className="bi bi-arrow-up-right"></i></button>}
          </div>
          {activity.canUpdateStatus&&(
           <div className="client-activity-task-actions">
            <span className={"client-activity-task-state "+(isOpen?"is-open":activity.status==="completed"?"is-complete":"is-cancelled")}>{statusLabel}</span>
            {isOpen
             ?<button type="button" className="btn btn-sm btn-outline-success" disabled={updatingId===String(activity.sourceId)} onClick={()=>updateFollowUp(activity,"completed")}>{updatingId===String(activity.sourceId)?"Saving...":"Mark done"}</button>
             :<button type="button" className="btn btn-sm btn-light border" disabled={updatingId===String(activity.sourceId)} onClick={()=>updateFollowUp(activity,"open")}>Reopen</button>}
           </div>
          )}
         </div>
        </article>
       );
      })}
     </div>
    )}

    {!loading&&hasMore&&(
     <button type="button" className="client-activity-load-more" onClick={()=>setLimit(current=>Math.min(500,current+100))} disabled={limit>=500}>
      {limit>=500?"Showing the latest 500 activities":"Load older activity"}
     </button>
    )}
   </div>
  </section>
 );
}
