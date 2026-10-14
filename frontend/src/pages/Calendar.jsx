import React,{useEffect,useMemo,useRef,useState} from "react";
import {useNavigate,useSearchParams} from "react-router-dom";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import axios from "axios";
import DynamicTable from "../components/DynamicTable";
import FormConfigurator from "../components/FormConfigurator";
import ConfiguredField from "../components/ConfiguredField";
import {CALENDAR_EVENT_FIELDS} from "../config/noCodeCatalog";
import {
  applyAutoFill,
  applyFormulas,
  buildConfiguredDefaults,
  getFieldState,
  hydrateConfiguredValues,
  syncConfiguredCustomFields,
  useFormConfiguration
} from "../hooks/useFormConfiguration";
import {useNoCodeDataSources} from "../hooks/useNoCodeDataSources";
import "bootstrap/dist/css/bootstrap.min.css";
import "./CalendarPage.css";

const API=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const auth=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});
const DEFAULT_COLOR="#3788d8";

const localInput=date=>{
  const value=date instanceof Date?date:new Date(date);
  if(Number.isNaN(value.getTime()))return "";
  const offset=value.getTimezoneOffset();
  const local=new Date(value.getTime()-offset*60000);
  return local.toISOString().slice(0,16);
};

const isoFromInput=value=>{
  const date=new Date(value);
  return Number.isNaN(date.getTime())?"":date.toISOString();
};

const emptyEvent=fields=>{
  const start=new Date();
  start.setMinutes(0,0,0);
  const end=new Date(start);
  end.setHours(end.getHours()+1);
  return buildConfiguredDefaults({
    title:"",
    start:localInput(start),
    end:localInput(end),
    color:DEFAULT_COLOR,
    customFields:{}
  },fields);
};

export default function Calendar(){
  const navigate=useNavigate();
  const [searchParams]=useSearchParams();
  const {fields,loading:formLoading,save:saveForm,reset:resetForm,saving:formSaving}=useFormConfiguration("calendar.event",CALENDAR_EVENT_FIELDS);
  const [events,setEvents]=useState([]);
  const [modal,setModal]=useState({open:false,id:null,values:{}});
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const savingEventRef=useRef(false);
  const [error,setError]=useState("");

  const isFormBuilderOpen=searchParams.get("customize")==="form";
  const eventFields=useMemo(()=>fields||CALENDAR_EVENT_FIELDS,[fields]);
  const linkedEventSources=useMemo(
    ()=>Array.from(new Set(eventFields.map(field=>field.dataSource?.resource).filter(Boolean))),
    [eventFields]
  );
  const {records:linkedRecords,searchRecords:searchLinkedRecords}=useNoCodeDataSources(linkedEventSources);

  // If a user opens a blank event while their saved form settings are loading,
  // apply newly-loaded defaults only to empty fields and preserve their typing.
  useEffect(()=>{
    if(!modal.open||modal.id)return;
    setModal(previous=>{
      if(!previous.open||previous.id)return previous;
      return {...previous,values:buildConfiguredDefaults(previous.values,eventFields)};
    });
  },[eventFields,modal.open,modal.id]);

  const load=async()=>{
    try{
      setLoading(true);
      const response=await axios.get(API+"/api/events",auth());
      setEvents((response.data||[]).map(event=>({...event,id:event._id})));
      setError("");
    }catch(loadError){
      setError(loadError.response?.data?.message||"Unable to load calendar events.");
    }finally{setLoading(false);}
  };

  useEffect(()=>{load();},[]);

  const close=()=>{if(!savingEventRef.current)setModal({open:false,id:null,values:{}});};

  const openCreate=(dateInput="")=>{
    const values=emptyEvent(eventFields);
    if(dateInput){
      const start=new Date(dateInput.length===10?dateInput+"T09:00:00":dateInput);
      if(!Number.isNaN(start.getTime())){
        const end=new Date(start);end.setHours(end.getHours()+1);
        values.start=localInput(start);values.end=localInput(end);
      }
    }
    setModal({open:true,id:null,values});
  };

  const openEdit=event=>{
    setModal({
      open:true,
      id:event._id||event.id,
      values:hydrateConfiguredValues({
        ...event,
        start:event.start?localInput(event.start):"",
        end:event.end?localInput(event.end):"",
        customFields:event.customFields&&typeof event.customFields==="object"?event.customFields:{}
      },eventFields)
    });
  };

  const updateValue=(field,value,record=null)=>{
    setError("");
    setModal(previous=>{
      let next={
        ...previous.values,
        [field.key]:value,
        customFields:{...(previous.values.customFields||{})}
      };
      if(field.custom)next.customFields[field.key]=value;
      if(field?.dataSource?.autoFill?.length)next=applyAutoFill(field,record,next);
      next=applyFormulas(eventFields,next);
      next=syncConfiguredCustomFields(next,eventFields);
      return {...previous,values:next};
    });
  };

  const save=async()=>{
    if(savingEventRef.current)return;
    const values=syncConfiguredCustomFields(applyFormulas(eventFields,modal.values),eventFields);
    const validationValues={...values,...(values.customFields||{})};

    // Validate every configured required field, including fields made required
    // by a conditional rule. Calendar validation previously checked only title
    // and start time, so other required custom fields could be silently skipped.
    const missing=eventFields.filter(field=>!field.formula).find(field=>{
      const state=getFieldState(field,validationValues);
      if(!state.visible||!state.required||state.disabled)return false;
      const value=field.custom
        ? values.customFields?.[field.key]??values[field.key]
        : values[field.key];
      return String(value??"").trim()==="";
    });
    if(missing){
      setError("Please complete “"+missing.label+"” before saving.");
      return;
    }

    const start=isoFromInput(values.start);
    const end=isoFromInput(values.end||values.start);
    if(!start||!end){
      setError("Enter valid event dates.");return;
    }
    if(new Date(end)<new Date(start)){
      setError("Event end cannot be before start.");return;
    }

    const payload={
      title:String(values.title||"").trim(),
      start,
      end,
      color:String(values.color||DEFAULT_COLOR),
      customFields:values.customFields||{}
    };

    savingEventRef.current=true;
    setSaving(true);
    setError("");
    try{
      if(modal.id){
        const response=await axios.put(API+"/api/events/"+modal.id,payload,auth());
        setEvents(previous=>previous.map(event=>event.id===modal.id?{...response.data,id:response.data._id}:event));
      }else{
        const response=await axios.post(API+"/api/events",payload,auth());
        setEvents(previous=>[...previous,{...response.data,id:response.data._id}]);
      }
      setError("");
      setModal({open:false,id:null,values:{}});
    }catch(saveError){
      setError(saveError.response?.data?.message||"Unable to save event.");
    }finally{
      savingEventRef.current=false;
      setSaving(false);
    }
  };

  const remove=async eventId=>{
    if(savingEventRef.current||!eventId||!window.confirm("Delete this event?"))return;
    try{
      await axios.delete(API+"/api/events/"+eventId,auth());
      setEvents(previous=>previous.filter(event=>event.id!==eventId));
      if(modal.id===eventId)close();
      setError("");
    }catch(removeError){
      setError(removeError.response?.data?.message||"Unable to delete event.");
    }
  };

  const move=async info=>{
    try{
      const payload={
        start:info.event.start?.toISOString(),
        end:(info.event.end||info.event.start)?.toISOString()
      };
      const response=await axios.put(API+"/api/events/"+info.event.id,payload,auth());
      setEvents(previous=>previous.map(event=>event.id===info.event.id?{...response.data,id:response.data._id}:event));
    }catch(moveError){
      info.revert();
      setError(moveError.response?.data?.message||"Unable to move event.");
    }
  };

  const baseColumns=[
    {key:"start",label:"Start",render:event=>event.start?new Date(event.start).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"}):""},
    {key:"end",label:"End",render:event=>event.end?new Date(event.end).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}):""},
    {key:"title",label:"Event"},
    {key:"color",label:"Color",render:event=><span className="d-inline-flex align-items-center gap-2"><span className="event-color-dot" style={{backgroundColor:event.color||DEFAULT_COLOR}}></span>{event.color||DEFAULT_COLOR}</span>}
  ];

  return (
    <div className="container-fluid py-3">
      <div className="d-flex justify-content-between align-items-center mb-3 gap-2">
        <div>
          <h2 className="mb-1">Event Calendar</h2>
          <div className="text-muted small">Schedule and manage business activities.</div>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-light border" onClick={()=>navigate("/calendar?customize=form")}>
            <i className="bi bi-sliders me-1"></i>Customize event form
          </button>
          <button className="btn btn-primary" onClick={()=>openCreate(new Date())}>
            <i className="bi bi-plus-lg me-1"></i>Event
          </button>
        </div>
      </div>

      {error&&<div className="alert alert-danger">{error}<button className="btn-close float-end" onClick={()=>setError("")}></button></div>}

      <div className="card shadow-sm border-0">
        <div className="card-body">
          {loading
            ? <div className="text-center py-5"><span className="spinner-border"></span></div>
            : <FullCalendar
                plugins={[dayGridPlugin,timeGridPlugin,interactionPlugin]}
                initialView="dayGridMonth"
                events={events}
                dateClick={info=>openCreate(info.dateStr)}
                eventClick={info=>openEdit(events.find(event=>event.id===info.event.id)||{_id:info.event.id,title:info.event.title,start:info.event.startStr,end:info.event.endStr,color:info.event.backgroundColor})}
                editable
                eventDrop={move}
                eventResize={move}
                eventColor={DEFAULT_COLOR}
                eventDisplay="block"
                dayMaxEvents={4}
                height="auto"
                headerToolbar={{left:"prev,next today",center:"title",right:"dayGridMonth,timeGridWeek,timeGridDay"}}
              />}
        </div>
      </div>

      <div className="card border-0 shadow-sm mt-3">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h5 className="mb-0">Events</h5>
            <div className="d-flex align-items-center gap-2">
              <span className="text-muted small">{events.length} event(s)</span>
              <button className="btn btn-sm btn-light border" onClick={()=>navigate("/calendar?customize=table")}>Customize list</button>
            </div>
          </div>
          <DynamicTable
            tableKey="calendar.events"
            rows={events}
            getRowKey={event=>event._id||event.id}
            autoOpenSettings={searchParams.get("customize")==="table"}
            columns={baseColumns}
            actionColumn={{
              label:"Actions",
              render:event=>(
                <div className="btn-group btn-group-sm">
                  <button type="button" className="btn btn-outline-primary" onClick={()=>openEdit(event)}>Edit</button>
                  <button type="button" className="btn btn-outline-danger" onClick={()=>remove(event._id||event.id)}>Delete</button>
                </div>
              )
            }}
            emptyText="No events yet. Click a date or use Event."
          />
        </div>
      </div>

      {modal.open&&(
        <div
          className="modal fade show d-block calendar-event-modal"
          tabIndex="-1"
          role="dialog"
          aria-modal="true"
          aria-label={modal.id?"Edit event":"Create event"}
          onMouseDown={event=>{if(event.target===event.currentTarget)close();}}
        >
          <div className="modal-dialog modal-dialog-scrollable calendar-event-dialog"><div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">{modal.id?"Edit Event":"Create Event"}</h5>
              <button className="btn-close" onClick={close}></button>
            </div>
            <div className="modal-body">
              {formLoading
                ? <div className="text-center py-4"><span className="spinner-border spinner-border-sm me-2"></span>Loading event form...</div>
                : <div className="row g-3">
                    {eventFields.map(field=>{
                      const state=getFieldState(field,modal.values);
                      if(!state.visible)return null;
                      const width=Math.min(12,Math.max(1,Number(field.width)||6));
                      return (
                        <div className={`col-md-${width}`} key={field.key}>
                          <ConfiguredField
                            field={field}
                            value={modal.values[field.key]}
                            onChange={value=>updateValue(field,value)}
                            onRecordChange={record=>updateValue(
                              field,
                              record?.[field.dataSource?.valueField||"_id"]??"",
                              record
                            )}
                            lookupRecords={field.dataSource?.resource?linkedRecords[field.dataSource.resource]||[]:[]}
                            onLookupSearch={searchLinkedRecords}
                            options={field.options||[]}
                            required={state.required}
                            readOnly={state.readOnly}
                            disabled={state.disabled}
                          />
                        </div>
                      );
                    })}
                  </div>}
            </div>
            <div className="modal-footer">
              {modal.id&&<button type="button" className="btn btn-outline-danger me-auto" onClick={()=>remove(modal.id)} disabled={saving}>Delete</button>}
              <button type="button" className="btn btn-secondary" onClick={close} disabled={saving}>Close</button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={formLoading||saving}>{saving?"Saving...":formLoading?"Loading...":"Save"}</button>
            </div>
          </div></div>
          
        </div>
      )}

      <FormConfigurator
        open={isFormBuilderOpen}
        onClose={()=>navigate("/calendar")}
        title="Customize calendar events"
        subtitle="Arrange fields, add your own event information, set visibility and rules, then save."
        fields={eventFields}
        onSave={saveForm}
        onReset={resetForm}
        saving={formSaving}
      />

    </div>
  );
}
