import React,{useCallback,useEffect,useMemo,useState} from "react";
import axios from "axios";
import {useNavigate,useSearchParams} from "react-router-dom";
import BusinessPageHeader from "../components/BusinessPageHeader";
import "./Deals.css";

const API=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const auth=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});
const money=value=>"₹"+Number(value||0).toLocaleString("en-IN",{maximumFractionDigits:0});
const EMPTY_SUMMARY={openCount:0,pipelineValue:0,weightedValue:0,overdueCount:0,noNextActionCount:0};
const SOURCE_OPTIONS=["Referral","WhatsApp","Website","Walk-in","Existing customer","Social media","Other"];
const STATUS_FILTERS=[
 {key:"open",label:"Open opportunities"},
 {key:"won",label:"Won"},
 {key:"lost",label:"Lost"},
 {key:"all",label:"All deals"}
];

const emptyDraft=stageKey=>({
 title:"",clientId:"",contactName:"",contactPhone:"",contactEmail:"",
 value:"",stageKey:stageKey||"new-enquiry",expectedCloseDate:"",
 nextAction:"",nextActionAt:"",source:"",notes:"",lostReason:"",lostNotes:""
});
const localDateTime=value=>{
 if(!value)return "";
 const date=new Date(value);
 if(Number.isNaN(date.getTime()))return "";
 date.setMinutes(date.getMinutes()-date.getTimezoneOffset());
 return date.toISOString().slice(0,16);
};
const formatDate=value=>{
 if(!value)return "Not set";
 const date=new Date(value);
 return Number.isNaN(date.getTime())?"Not set":date.toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});
};
const attentionState=(deal,now=new Date())=>{
 if(deal.status!=="open")return "closed";
 if(!deal.nextActionAt)return "missing";
 const due=new Date(deal.nextActionAt);
 if(Number.isNaN(due.getTime()))return "missing";
 if(due<now)return "overdue";
 const endOfToday=new Date(now);
 endOfToday.setHours(23,59,59,999);
 return due<=endOfToday?"today":"upcoming";
};
const attentionRank=deal=>({overdue:0,today:1,missing:2,upcoming:3,closed:4}[attentionState(deal)]??4);
const dealCustomer=deal=>{
 const client=deal.clientId&&typeof deal.clientId==="object"?deal.clientId:null;
 return client?.companyName||client?.name||deal.contactName||"Unlinked prospect";
};

export default function Deals(){
 const navigate=useNavigate();
 const [searchParams,setSearchParams]=useSearchParams();
 const [deals,setDeals]=useState([]);
 const [pipeline,setPipeline]=useState({name:"Sales pipeline",stages:[]});
 const [summary,setSummary]=useState(EMPTY_SUMMARY);
 const [clients,setClients]=useState([]);
 const [loading,setLoading]=useState(true);
 const [clientsLoading,setClientsLoading]=useState(false);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [search,setSearch]=useState("");
 const [statusFilter,setStatusFilter]=useState("open");
 const [view,setView]=useState("board");
 const [composerOpen,setComposerOpen]=useState(false);
 const [editingId,setEditingId]=useState("");
 const [draft,setDraft]=useState(emptyDraft());
 const [stageManagerOpen,setStageManagerOpen]=useState(false);
 const [stageDraft,setStageDraft]=useState([]);
 const [draggedId,setDraggedId]=useState("");
 const [lossTarget,setLossTarget]=useState(null);
 const [lossReason,setLossReason]=useState("");
 const [lossNotes,setLossNotes]=useState("");
 const [conversionSaving,setConversionSaving]=useState(false);

 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const [dealResponse,pipelineResponse,summaryResponse]=await Promise.all([
    axios.get(API+"/api/deals",{...auth(),params:{limit:500}}),
    axios.get(API+"/api/deals/pipeline",auth()),
    axios.get(API+"/api/deals/summary",auth())
   ]);
   setDeals(Array.isArray(dealResponse.data?.deals)?dealResponse.data.deals:[]);
   setPipeline(pipelineResponse.data||{name:"Sales pipeline",stages:[]});
   setSummary(summaryResponse.data||EMPTY_SUMMARY);
  }catch(loadError){
   setError(loadError.response?.data?.message||"The sales pipeline could not be loaded. Please try again.");
  }finally{setLoading(false);}
 },[]);

 const loadClients=useCallback(async()=>{
  if(clients.length||clientsLoading)return;
  setClientsLoading(true);
  try{
   const response=await axios.get(API+"/api/clients",auth());
   setClients(Array.isArray(response.data)?response.data.filter(client=>client.accountStatus!=="Inactive"):[]);
  }catch(loadError){
   setError(loadError.response?.data?.message||"Customers could not be loaded.");
  }finally{setClientsLoading(false);}
 },[clients.length,clientsLoading]);

 useEffect(()=>{load();},[load]);

 const openNewDeal=useCallback((clientId="")=>{
  const firstStage=pipeline.stages.find(stage=>stage.outcome==="open")?.key||"new-enquiry";
  const client=clients.find(item=>String(item._id)===String(clientId));
  setEditingId("");
  setDraft({
   ...emptyDraft(firstStage),
   clientId:client?String(client._id):clientId||"",
   contactName:client?(client.name||client.companyName||""):"",
   contactPhone:client?.phone||"",
   contactEmail:client?.email||""
  });
  setComposerOpen(true);
  setError("");
  setMessage("");
  loadClients();
 },[pipeline,clients,loadClients]);

 const openEditDeal=deal=>{
  const clientId=deal.clientId&&typeof deal.clientId==="object"?deal.clientId._id:deal.clientId;
  setEditingId(String(deal._id));
  setDraft({
   title:deal.title||"",clientId:clientId?String(clientId):"",
   contactName:deal.contactName||"",contactPhone:deal.contactPhone||"",contactEmail:deal.contactEmail||"",
   value:String(deal.value??0),stageKey:deal.stageKey||"",
   expectedCloseDate:deal.expectedCloseDate?new Date(deal.expectedCloseDate).toISOString().slice(0,10):"",
   nextAction:deal.nextAction||"",nextActionAt:localDateTime(deal.nextActionAt),
   source:deal.source||"",notes:deal.notes||"",
   lostReason:deal.lostReason||"",lostNotes:deal.lostNotes||""
  });
  setComposerOpen(true);
  setError("");
  loadClients();
 };

 useEffect(()=>{
  const clientId=searchParams.get("clientId");
  const action=searchParams.get("action");
  if(!clientId&&action!=="new")return;
  const params=new URLSearchParams(searchParams);
  params.delete("clientId");params.delete("action");
  setSearchParams(params,{replace:true});
  openNewDeal(clientId||"");
 },[searchParams,setSearchParams,openNewDeal]);

 const filteredDeals=useMemo(()=>{
  const needle=search.trim().toLowerCase();
  return deals.filter(deal=>{
   if(statusFilter!=="all"&&deal.status!==statusFilter)return false;
   if(!needle)return true;
   const customer=dealCustomer(deal);
   return [deal.title,customer,deal.contactPhone,deal.contactEmail,deal.source,deal.nextAction]
    .some(value=>String(value||"").toLowerCase().includes(needle));
  }).sort((a,b)=>{
   if(statusFilter==="open"){
    const attention=attentionRank(a)-attentionRank(b);
    if(attention)return attention;
    const left=a.nextActionAt?new Date(a.nextActionAt).getTime():Number.MAX_SAFE_INTEGER;
    const right=b.nextActionAt?new Date(b.nextActionAt).getTime():Number.MAX_SAFE_INTEGER;
    if(left!==right)return left-right;
   }
   return new Date(b.updatedAt||b.createdAt||0)-new Date(a.updatedAt||a.createdAt||0);
  });
 },[deals,statusFilter,search]);

 const visibleStages=useMemo(()=>{
  if(statusFilter==="open")return pipeline.stages.filter(stage=>stage.outcome==="open");
  if(statusFilter==="won")return pipeline.stages.filter(stage=>stage.outcome==="won");
  if(statusFilter==="lost")return pipeline.stages.filter(stage=>stage.outcome==="lost");
  return pipeline.stages;
 },[pipeline.stages,statusFilter]);

 const updateDraft=(key,value)=>setDraft(previous=>({...previous,[key]:value}));
 const closeComposer=()=>{setComposerOpen(false);setEditingId("");setError("");};
 const onCustomerChange=value=>{
  const client=clients.find(item=>String(item._id)===value);
  setDraft(previous=>({
   ...previous,clientId:value,
   contactName:client?(client.name||client.companyName||""):previous.contactName,
   contactPhone:client?.phone||previous.contactPhone,
   contactEmail:client?.email||previous.contactEmail
  }));
 };

 const saveDeal=async event=>{
  event.preventDefault();
  if(!draft.title.trim()){setError("Give this opportunity a clear name.");return;}
  if(!draft.clientId&&!draft.contactName.trim()){setError("Choose a customer or enter the prospect's name.");return;}
  if(draft.stageKey==="lost"&&!draft.lostReason.trim()){setError("Add a reason before marking this opportunity as lost.");return;}
  const numericValue=Number(draft.value||0);
  if(!Number.isFinite(numericValue)||numericValue<0){setError("Enter a valid opportunity value.");return;}
  setSaving(true);setError("");setMessage("");
  const payload={
   title:draft.title.trim(),clientId:draft.clientId||null,
   contactName:draft.contactName.trim(),contactPhone:draft.contactPhone.trim(),contactEmail:draft.contactEmail.trim(),
   value:numericValue,stageKey:draft.stageKey,
   expectedCloseDate:draft.expectedCloseDate||null,
   nextAction:draft.nextAction.trim(),
   nextActionAt:draft.nextActionAt?new Date(draft.nextActionAt).toISOString():null,
   source:draft.source.trim(),notes:draft.notes.trim()
  };
  try{
   if(editingId){
    await axios.patch(API+"/api/deals/"+editingId,payload,auth());
    const existing=deals.find(item=>String(item._id)===editingId);
    const stageChanged=draft.stageKey!==existing?.stageKey;
    const needsLostReason=draft.stageKey==="lost";
    if(stageChanged||needsLostReason){
     await axios.patch(API+"/api/deals/"+editingId+"/stage",{
      stageKey:draft.stageKey,lostReason:draft.lostReason,lostNotes:draft.lostNotes
     },auth());
    }
   }else{
    await axios.post(API+"/api/deals",payload,auth());
   }
   setComposerOpen(false);setEditingId("");
   setMessage(editingId?"Opportunity updated.":"Opportunity added to the pipeline.");
   await load();
  }catch(saveError){
   setError(saveError.response?.data?.message||"The opportunity could not be saved.");
  }finally{setSaving(false);}
 };

 const moveDeal=async(deal,stageKey,reason="",notes="")=>{
  if(!deal||deal.stageKey===stageKey&&deal.status===pipeline.stages.find(stage=>stage.key===stageKey)?.outcome)return;
  setError("");setMessage("");
  try{
   await axios.patch(API+"/api/deals/"+deal._id+"/stage",{stageKey,lostReason:reason,lostNotes:notes},auth());
   setMessage("Opportunity moved to "+(pipeline.stages.find(stage=>stage.key===stageKey)?.label||"the new stage")+".");
   setDraggedId("");
   await load();
  }catch(moveError){
   setError(moveError.response?.data?.message||"The opportunity could not be moved.");
  }
 };

 const handleDrop=(event,stage)=>{
  event.preventDefault();
  const id=event.dataTransfer.getData("text/plain")||draggedId;
  const deal=deals.find(item=>String(item._id)===id);
  setDraggedId("");
  if(!deal||deal.stageKey===stage.key)return;
  if(stage.outcome==="lost"){
   setLossTarget({deal,stage});
   setLossReason("");
   setLossNotes("");
   return;
  }
  moveDeal(deal,stage.key);
 };

 const confirmLost=async event=>{
  event.preventDefault();
  if(!lossReason.trim()){setError("Choose or enter a reason for the lost opportunity.");return;}
  await moveDeal(lossTarget.deal,lossTarget.stage.key,lossReason.trim(),lossNotes.trim());
  setLossTarget(null);setLossReason("");setLossNotes("");
 };

 const openStageManager=()=>{
  setStageDraft(pipeline.stages.filter(stage=>stage.outcome==="open").map(stage=>({
   key:stage.key,label:stage.label,probability:stage.probability
  })));
  setStageManagerOpen(true);setError("");
 };
 const updateStageDraft=(index,key,value)=>{
  setStageDraft(previous=>previous.map((stage,i)=>i===index?{...stage,[key]:value}:stage));
 };
 const reorderStage=(index,direction)=>{
  setStageDraft(previous=>{
   const next=previous.slice(),target=index+direction;
   if(target<0||target>=next.length)return previous;
   [next[index],next[target]]=[next[target],next[index]];
   return next;
  });
 };
 const savePipelineStages=async()=>{
  setSaving(true);setError("");
  try{
   const response=await axios.put(API+"/api/deals/pipeline",{stages:stageDraft},auth());
   setPipeline(response.data);setStageManagerOpen(false);
   setMessage("Your sales stages have been saved.");
   await load();
  }catch(saveError){
   setError(saveError.response?.data?.message||"Sales stages could not be saved.");
  }finally{setSaving(false);}
 };

 const convertToCustomer=async deal=>{
  setConversionSaving(true);setError("");setMessage("");
  try{
   const response=await axios.post(API+"/api/deals/"+deal._id+"/convert-customer",{},auth());
   setMessage(response.data?.created?"Customer record created and linked.":"Matching customer found and linked.");
   setComposerOpen(false);
   await load();
  }catch(convertError){
   setError(convertError.response?.data?.message||"The customer record could not be created.");
  }finally{setConversionSaving(false);}
 };

 const now=new Date();
 const selectedDeal=deals.find(deal=>String(deal._id)===editingId);
 const showProspectFields=!draft.clientId;

 return (
  <div className="container-fluid py-4 deals-page">
   <BusinessPageHeader
    eyebrow="SALES WORKSPACE"
    title="Sales pipeline"
    description="Keep every enquiry moving, see what needs attention and know what could close next."
    className="mb-3"
   >
    <button type="button" className="btn btn-light border" onClick={openStageManager} disabled={loading}>
     <i className="bi bi-sliders me-2"></i>Stages
    </button>
    <button type="button" className="btn btn-primary" onClick={()=>openNewDeal()}>
     <i className="bi bi-plus-lg me-2"></i>New opportunity
    </button>
   </BusinessPageHeader>

   {message&&<div className="alert alert-success py-2" role="status">{message}</div>}
   {error&&!composerOpen&&!stageManagerOpen&&!lossTarget&&<div className="alert alert-warning py-2 d-flex align-items-center justify-content-between gap-2" role="alert"><span>{error}</span><button type="button" className="btn btn-sm btn-light border" onClick={load}>Try again</button></div>}

   <section className="deals-summary-grid" aria-label="Sales summary">
    <div className="deals-summary-card"><span>Open opportunities</span><strong>{Number(summary.openCount||0).toLocaleString("en-IN")}</strong><small>Potential sales in progress</small></div>
    <div className="deals-summary-card"><span>Pipeline value</span><strong>{money(summary.pipelineValue)}</strong><small>Total value of open opportunities</small></div>
    <div className="deals-summary-card"><span>Weighted forecast</span><strong>{money(summary.weightedValue)}</strong><small>Value adjusted by stage probability</small></div>
    <div className={"deals-summary-card "+(summary.overdueCount?"has-warning":"")}><span>Needs attention</span><strong>{Number(summary.overdueCount||0)+Number(summary.noNextActionCount||0)}</strong><small>{summary.overdueCount||0} overdue · {summary.noNextActionCount||0} without a next step</small></div>
   </section>

   <section className="deals-workspace">
    <div className="deals-toolbar">
     <div className="deals-status-filters" role="group" aria-label="Filter opportunities by outcome">
      {STATUS_FILTERS.map(item=><button type="button" key={item.key} className={statusFilter===item.key?"is-active":""} onClick={()=>setStatusFilter(item.key)}>{item.label}<span>{item.key==="all"?deals.length:deals.filter(deal=>deal.status===item.key).length}</span></button>)}
     </div>
     <div className="deals-toolbar-right">
      <label className="deals-search"><i className="bi bi-search"></i><input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search opportunities or customers" aria-label="Search opportunities or customers"/>{search&&<button type="button" aria-label="Clear search" onClick={()=>setSearch("")}><i className="bi bi-x-lg"></i></button>}</label>
      <div className="deals-view-toggle" role="group" aria-label="Choose pipeline view">
       <button type="button" className={view==="board"?"is-active":""} onClick={()=>setView("board")} aria-label="Board view"><i className="bi bi-kanban"></i></button>
       <button type="button" className={view==="list"?"is-active":""} onClick={()=>setView("list")} aria-label="List view"><i className="bi bi-list-ul"></i></button>
      </div>
     </div>
    </div>

    {loading?<div className="deals-loading"><span className="spinner-border spinner-border-sm me-2"></span>Loading your sales pipeline...</div>
     :!filteredDeals.length?<div className="deals-empty">
       <span><i className="bi bi-kanban"></i></span>
       <strong>{search?"No matching opportunities":statusFilter==="won"?"No won opportunities yet":statusFilter==="lost"?"No lost opportunities":"Your pipeline is ready"}</strong>
       <p>{search?"Try another search term.":"Add a sales enquiry to start tracking customer conversations, quotations and potential orders."}</p>
       {!search&&statusFilter!=="won"&&statusFilter!=="lost"&&<button type="button" className="btn btn-primary" onClick={()=>openNewDeal()}><i className="bi bi-plus-lg me-2"></i>Add first opportunity</button>}
      </div>
     :view==="board"?(
      <div className="deals-board-viewport" aria-label="Sales pipeline board">
       <div className="deals-board">
        {visibleStages.map(stage=>{
         const stageDeals=filteredDeals.filter(deal=>deal.stageKey===stage.key);
         const value=stageDeals.reduce((sum,deal)=>sum+Number(deal.value||0),0);
         return (
          <section className={"deals-stage-column "+(stage.outcome==="won"?"is-won":stage.outcome==="lost"?"is-lost":"")} key={stage.key}
           onDragOver={event=>event.preventDefault()} onDrop={event=>handleDrop(event,stage)}>
           <header className="deals-stage-heading">
            <div><strong>{stage.label}</strong><span>{stageDeals.length} deal{stageDeals.length===1?"":"s"}</span></div>
            <b>{money(value)}</b>
           </header>
           <div className="deals-stage-cards">
            {stageDeals.map(deal=>{
             const attention=attentionState(deal,now);
             return (
              <button type="button" className={"deal-card "+(attention==="overdue"?"is-overdue":attention==="today"?"is-due-today":"")} key={deal._id}
               draggable onDragStart={event=>{event.dataTransfer.setData("text/plain",String(deal._id));event.dataTransfer.effectAllowed="move";setDraggedId(String(deal._id));}}
               onDragEnd={()=>setDraggedId("")} onClick={()=>openEditDeal(deal)}>
               <span className="deal-card-title">{deal.title}</span>
               <span className="deal-card-customer"><i className="bi bi-person"></i>{dealCustomer(deal)}</span>
               <span className="deal-card-value">{money(deal.value)}</span>
               <span className="deal-card-footer">
                {deal.nextAction?<span className={"deal-card-next "+(attention==="overdue"?"is-overdue":attention==="today"?"is-today":attention==="missing"?"is-missing":"")}><i className="bi bi-bell"></i>{attention==="overdue"?"Overdue":attention==="today"?"Due today":attention==="missing"?"No date":formatDate(deal.nextActionAt)}</span>:<span className="deal-card-next is-missing"><i className="bi bi-exclamation-circle"></i>No next step</span>}
                <small>{deal.expectedCloseDate?"Close "+formatDate(deal.expectedCloseDate):"No close date"}</small>
               </span>
              </button>
             );
            })}
            {!stageDeals.length&&<div className="deals-stage-empty">Drop an opportunity here</div>}
           </div>
          </section>
         );
        })}
       </div>
      </div>
     ):(
      <div className="deals-list">
       <div className="deals-list-header"><span>Opportunity</span><span>Customer / prospect</span><span>Stage</span><span>Value</span><span>Next step</span><span>Expected close</span></div>
       {filteredDeals.map(deal=>{
        const stage=pipeline.stages.find(item=>item.key===deal.stageKey);
        const attention=attentionState(deal);
        return <button type="button" className="deals-list-row" key={deal._id} onClick={()=>openEditDeal(deal)}>
         <span><strong>{deal.title}</strong><small>{deal.source||"Source not recorded"}</small></span>
         <span>{dealCustomer(deal)}</span>
         <span><i className="deals-stage-dot"></i>{stage?.label||deal.stageKey}</span>
         <strong>{money(deal.value)}</strong>
         <span className={attention==="overdue"?"text-danger":attention==="today"?"text-warning":""}>{deal.nextAction||"No next step"}{deal.nextActionAt&&<small>{formatDate(deal.nextActionAt)}</small>}</span>
         <span>{formatDate(deal.expectedCloseDate)}</span>
        </button>;
       })}
      </div>
     )}
   </section>

   {composerOpen&&(
    <div className="deals-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)closeComposer();}}>
     <div className="deals-modal deals-editor" role="dialog" aria-modal="true" aria-label={editingId?"Edit opportunity":"New opportunity"}>
      <form onSubmit={saveDeal}>
       <header className="deals-modal-header">
        <div><span className="deals-modal-eyebrow">SALES OPPORTUNITY</span><h2>{editingId?"Update opportunity":"Add an opportunity"}</h2><p>Capture the sale you are working towards. You can link a customer now or later.</p></div>
        <button type="button" className="btn-close" aria-label="Close" onClick={closeComposer}/>
       </header>
       {error&&<div className="alert alert-warning py-2 mx-4 mt-3 mb-0" role="alert">{error}</div>}
       <div className="deals-modal-body">
        <div className="deals-form-section">
         <h3>Opportunity details</h3>
         <div className="deals-form-grid">
          <div className="span-2"><label className="form-label" htmlFor="deal-title">What are you trying to sell? <span>*</span></label><input id="deal-title" className="form-control" value={draft.title} onChange={event=>updateDraft("title",event.target.value)} maxLength={160} placeholder="Example: Annual uniform supply" required autoFocus/></div>
          <div><label className="form-label" htmlFor="deal-value">Estimated value (₹)</label><input id="deal-value" type="number" min="0" step="0.01" className="form-control" value={draft.value} onChange={event=>updateDraft("value",event.target.value)} placeholder="0"/></div>
          <div><label className="form-label" htmlFor="deal-stage">Current stage</label><select id="deal-stage" className="form-select" value={draft.stageKey} onChange={event=>updateDraft("stageKey",event.target.value)}>{pipeline.stages.filter(stage=>editingId||stage.outcome==="open").map(stage=><option key={stage.key} value={stage.key}>{stage.label}</option>)}</select></div>
          <div><label className="form-label" htmlFor="deal-close-date">Expected closing date</label><input id="deal-close-date" type="date" className="form-control" value={draft.expectedCloseDate} onChange={event=>updateDraft("expectedCloseDate",event.target.value)}/></div>
          <div><label className="form-label" htmlFor="deal-source">Where did this enquiry come from?</label><input id="deal-source" className="form-control" list="deal-source-options" value={draft.source} onChange={event=>updateDraft("source",event.target.value)} placeholder="Select or type a source"/><datalist id="deal-source-options">{SOURCE_OPTIONS.map(option=><option key={option} value={option}/>)}</datalist></div>
         </div>
        </div>

        <div className="deals-form-section">
         <h3>Customer or prospect</h3>
         <div className="deals-form-grid">
          <div className="span-2"><label className="form-label" htmlFor="deal-customer">Link an existing customer <span className="optional-text">(optional)</span></label><select id="deal-customer" className="form-select" value={draft.clientId} onChange={event=>onCustomerChange(event.target.value)} disabled={clientsLoading}><option value="">{clientsLoading?"Loading customers...":"Not linked yet — this is a new prospect"}</option>{clients.map(client=><option key={client._id} value={client._id}>{client.companyName||client.name||"Unnamed customer"}{client.phone?" · "+client.phone:""}</option>)}</select></div>
          {showProspectFields&&<>
           <div><label className="form-label" htmlFor="deal-contact-name">Contact / business name <span>*</span></label><input id="deal-contact-name" className="form-control" value={draft.contactName} onChange={event=>updateDraft("contactName",event.target.value)} maxLength={120} placeholder="Who are you speaking with?" required={!draft.clientId}/></div>
           <div><label className="form-label" htmlFor="deal-contact-phone">Phone number</label><input id="deal-contact-phone" className="form-control" value={draft.contactPhone} onChange={event=>updateDraft("contactPhone",event.target.value)} maxLength={30} placeholder="Contact number"/></div>
           <div className="span-2"><label className="form-label" htmlFor="deal-contact-email">Email address</label><input id="deal-contact-email" type="email" className="form-control" value={draft.contactEmail} onChange={event=>updateDraft("contactEmail",event.target.value)} maxLength={160} placeholder="name@example.com"/></div>
          </>}
          {draft.clientId&&<div className="span-2 deals-linked-customer"><i className="bi bi-link-45deg"></i>Linked to {dealCustomer({clientId:clients.find(client=>String(client._id)===draft.clientId)||null})}. Contact details will follow the customer record.</div>}
         </div>
        </div>

        <div className="deals-form-section">
         <h3>What's the next step?</h3>
         <p className="deals-form-help">A clear next action makes it easier to remember who needs a call or quotation.</p>
         <div className="deals-form-grid">
          <div><label className="form-label" htmlFor="deal-next-action">Next action</label><input id="deal-next-action" className="form-control" value={draft.nextAction} onChange={event=>updateDraft("nextAction",event.target.value)} maxLength={160} placeholder="Example: Call to confirm sample"/></div>
          <div><label className="form-label" htmlFor="deal-next-date">When should you do it?</label><input id="deal-next-date" type="datetime-local" className="form-control" value={draft.nextActionAt} onChange={event=>updateDraft("nextActionAt",event.target.value)}/></div>
          <div className="span-2"><label className="form-label" htmlFor="deal-notes">Extra notes <span className="optional-text">(optional)</span></label><textarea id="deal-notes" className="form-control" rows={3} maxLength={5000} value={draft.notes} onChange={event=>updateDraft("notes",event.target.value)} placeholder="Requirements, quantity, product details or anything important..."/></div>
         </div>
        </div>

        {draft.stageKey==="lost"&&<div className="deals-form-section deals-lost-fields">
         <h3>Why was this opportunity lost?</h3>
         <div className="deals-form-grid">
          <div><label className="form-label" htmlFor="deal-lost-reason">Reason <span>*</span></label><input id="deal-lost-reason" className="form-control" value={draft.lostReason} onChange={event=>updateDraft("lostReason",event.target.value)} maxLength={160} placeholder="Example: Price was too high" required/></div>
          <div><label className="form-label" htmlFor="deal-lost-notes">Additional details</label><input id="deal-lost-notes" className="form-control" value={draft.lostNotes} onChange={event=>updateDraft("lostNotes",event.target.value)} maxLength={2000} placeholder="Optional feedback"/></div>
         </div>
        </div>}
       </div>
       <footer className="deals-modal-footer">
        <div>{editingId&&selectedDeal?.status==="won"&&!selectedDeal?.clientId&&<button type="button" className="btn btn-outline-primary" onClick={()=>convertToCustomer(selectedDeal)} disabled={conversionSaving}>{conversionSaving?"Creating...":"Create customer record"}</button>}{editingId&&selectedDeal?.clientId&&typeof selectedDeal.clientId==="object"&&<button type="button" className="btn btn-light border" onClick={()=>navigate("/clients?openClient="+selectedDeal.clientId._id)}>Open customer</button>}</div>
        <div><button type="button" className="btn btn-light border" onClick={closeComposer}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving?"Saving...":editingId?"Save changes":"Add opportunity"}</button></div>
       </footer>
      </form>
     </div>
    </div>
   )}

   {stageManagerOpen&&(
    <div className="deals-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setStageManagerOpen(false);}}>
     <section className="deals-modal deals-stage-manager" role="dialog" aria-modal="true" aria-label="Manage sales stages">
      <header className="deals-modal-header"><div><span className="deals-modal-eyebrow">MAKE IT MATCH YOUR BUSINESS</span><h2>Sales stages</h2><p>Use a few clear steps that match the way you really sell. Won and Lost stay available automatically.</p></div><button type="button" className="btn-close" aria-label="Close" onClick={()=>setStageManagerOpen(false)}/></header>
      {error&&<div className="alert alert-warning py-2 mx-4 mt-3 mb-0" role="alert">{error}</div>}
      <div className="deals-stage-manager-body">
       {stageDraft.map((stage,index)=><div className="deals-stage-edit-row" key={stage.key}>
        <div className="deals-stage-order"><button type="button" className="btn btn-light border" aria-label={"Move "+stage.label+" up"} disabled={index===0} onClick={()=>reorderStage(index,-1)}><i className="bi bi-chevron-up"></i></button><button type="button" className="btn btn-light border" aria-label={"Move "+stage.label+" down"} disabled={index===stageDraft.length-1} onClick={()=>reorderStage(index,1)}><i className="bi bi-chevron-down"></i></button></div>
        <div className="deals-stage-name"><label className="form-label">Stage name</label><input className="form-control" maxLength={48} value={stage.label} onChange={event=>updateStageDraft(index,"label",event.target.value)}/></div>
        <div className="deals-stage-probability"><label className="form-label">Chance (%)</label><input className="form-control" type="number" min="0" max="100" value={stage.probability} onChange={event=>updateStageDraft(index,"probability",event.target.value)}/></div>
        <button type="button" className="btn btn-light border deals-stage-remove" aria-label={"Remove "+stage.label} disabled={stageDraft.length<=2} onClick={()=>setStageDraft(previous=>previous.filter((_,i)=>i!==index))}><i className="bi bi-trash"></i></button>
       </div>)}
       <button type="button" className="btn btn-outline-primary deals-stage-add" disabled={stageDraft.length>=12} onClick={()=>setStageDraft(previous=>[...previous,{key:"custom-stage-"+Date.now(),label:"",probability:50}])}><i className="bi bi-plus-lg me-2"></i>Add stage</button>
       <div className="deals-closed-stage-note"><span>Closed outcomes</span><strong>Won · 100% chance</strong><strong>Lost · 0% chance</strong><small>These are kept consistent so your sales reports stay reliable.</small></div>
      </div>
      <footer className="deals-modal-footer"><span>Up to 12 open stages</span><div><button type="button" className="btn btn-light border" onClick={()=>setStageManagerOpen(false)}>Cancel</button><button type="button" className="btn btn-primary" onClick={savePipelineStages} disabled={saving}>{saving?"Saving...":"Save stages"}</button></div></footer>
     </section>
    </div>
   )}

   {lossTarget&&(
    <div className="deals-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setLossTarget(null);}}>
     <form className="deals-modal deals-loss-dialog" role="dialog" aria-modal="true" aria-label="Record lost opportunity reason" onSubmit={confirmLost}>
      <header className="deals-modal-header"><div><span className="deals-modal-eyebrow">CLOSE OPPORTUNITY</span><h2>Why was it lost?</h2><p>{lossTarget.deal.title}</p></div><button type="button" className="btn-close" aria-label="Close" onClick={()=>setLossTarget(null)}/></header>
      {error&&<div className="alert alert-warning py-2 mx-4 mt-3 mb-0" role="alert">{error}</div>}
      <div className="deals-modal-body">
       <label className="form-label" htmlFor="loss-reason">Reason <span>*</span></label>
       <input id="loss-reason" className="form-control" value={lossReason} onChange={event=>setLossReason(event.target.value)} maxLength={160} placeholder="Example: Customer chose another supplier" autoFocus required/>
       <label className="form-label mt-3" htmlFor="loss-notes">Anything else to remember? <span className="optional-text">(optional)</span></label>
       <textarea id="loss-notes" className="form-control" rows={3} maxLength={2000} value={lossNotes} onChange={event=>setLossNotes(event.target.value)} placeholder="Add useful feedback for future opportunities..."/>
      </div>
      <footer className="deals-modal-footer"><span>This keeps your sales history useful.</span><div><button type="button" className="btn btn-light border" onClick={()=>setLossTarget(null)}>Cancel</button><button type="submit" className="btn btn-danger">Mark as lost</button></div></footer>
     </form>
    </div>
   )}
  </div>
 );
}
