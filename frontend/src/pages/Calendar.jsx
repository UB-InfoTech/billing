import React,{useEffect,useState} from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import axios from "axios";
import "bootstrap/dist/css/bootstrap.min.css";
import "./CalendarPage.css";

const API=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const auth=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});

export default function Calendar(){
  const [events,setEvents]=useState([]);
  const [modal,setModal]=useState({open:false,id:null,title:"",start:"",end:"",color:"#3788d8"});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  const load=async()=>{
    try{setLoading(true);const r=await axios.get(API+"/api/events",auth());setEvents((r.data||[]).map(e=>({...e,id:e._id})));setError("");}
    catch(e){setError(e.response?.data?.message||"Unable to load calendar events.");}
    finally{setLoading(false);}
  };
  useEffect(()=>{load();},[]);

  const close=()=>setModal({open:false,id:null,title:"",start:"",end:"",color:"#3788d8"});
  const openCreate=(start="")=>setModal({open:true,id:null,title:"",start,end:start||start,color:"#3788d8"});
  const openEdit=(event)=>setModal({open:true,id:event._id,title:event.title||"",start:event.start?new Date(event.start).toISOString().slice(0,16):"",end:event.end?new Date(event.end).toISOString().slice(0,16):"",color:event.color||"#3788d8"});

  const save=async()=>{
    if(!modal.title.trim())return setError("Event title is required.");
    if(!modal.start)return setError("Start date/time is required.");
    const payload={title:modal.title.trim(),start:modal.start,end:modal.end||modal.start,color:modal.color};
    try{
      if(modal.id){
        const r=await axios.put(API+"/api/events/"+modal.id,payload,auth());
        setEvents(v=>v.map(e=>e.id===modal.id?{...r.data,id:r.data._id}:e));
      }else{
        const r=await axios.post(API+"/api/events",payload,auth());
        setEvents(v=>[...v,{...r.data,id:r.data._id}]);
      }
      setError("");close();
    }catch(e){setError(e.response?.data?.message||"Unable to save event.");}
  };

  const remove=async()=>{
    if(!modal.id)return;
    if(!window.confirm("Delete this event?"))return;
    try{await axios.delete(API+"/api/events/"+modal.id,auth());setEvents(v=>v.filter(e=>e.id!==modal.id));close();}
    catch(e){setError(e.response?.data?.message||"Unable to delete event.");}
  };

  const move=async(info)=>{
    try{
      await axios.put(API+"/api/events/"+info.event.id,{start:info.event.startStr,end:info.event.endStr||info.event.startStr},auth());
      setEvents(v=>v.map(e=>e.id===info.event.id?{...e,start:info.event.startStr,end:info.event.endStr||info.event.startStr}:e));
    }catch(e){info.revert();setError(e.response?.data?.message||"Unable to move event.");}
  };

  return <div className="container-fluid py-3">
    <div className="d-flex justify-content-between align-items-center mb-3">
      <div><h2 className="mb-1">Event Calendar</h2><div className="text-muted small">Schedule and manage business activities.</div></div>
      <button className="btn btn-primary" onClick={()=>openCreate(new Date().toISOString().slice(0,16))}>+ Event</button>
    </div>
    {error&&<div className="alert alert-danger">{error}<button className="btn-close float-end" onClick={()=>setError("")}/></div>}
    <div className="card shadow-sm border-0"><div className="card-body">{loading?<div className="text-center py-5"><span className="spinner-border"/></div>:<FullCalendar
      plugins={[dayGridPlugin,timeGridPlugin,interactionPlugin]}
      initialView="dayGridMonth"
      events={events}
      dateClick={info=>openCreate(info.dateStr.length===10?info.dateStr+"T09:00":info.dateStr)}
      eventClick={info=>openEdit(events.find(e=>e.id===info.event.id)||{_id:info.event.id,title:info.event.title,start:info.event.startStr,end:info.event.endStr,color:info.event.backgroundColor})}
      editable
      eventDrop={move}
      eventResize={move}
      headerToolbar={{left:"prev,next today",center:"title",right:"dayGridMonth,timeGridWeek,timeGridDay"}}
    />}</div></div>

    {modal.open&&<div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true">
      <div className="modal-dialog"><div className="modal-content">
        <div className="modal-header"><h5 className="modal-title">{modal.id?"Edit Event":"Create Event"}</h5><button className="btn-close" onClick={close}/></div>
        <div className="modal-body">
          <label className="form-label">Event Title</label><input className="form-control mb-3" value={modal.title} onChange={e=>setModal(v=>({...v,title:e.target.value}))}/>
          <div className="row g-3">
            <div className="col-md-6"><label className="form-label">Start</label><input type="datetime-local" className="form-control" value={modal.start} onChange={e=>setModal(v=>({...v,start:e.target.value}))}/></div>
            <div className="col-md-6"><label className="form-label">End</label><input type="datetime-local" className="form-control" value={modal.end} onChange={e=>setModal(v=>({...v,end:e.target.value}))}/></div>
            <div className="col-md-6"><label className="form-label">Color</label><input type="color" className="form-control form-control-color" value={modal.color} onChange={e=>setModal(v=>({...v,color:e.target.value}))}/></div>
          </div>
        </div>
        <div className="modal-footer">{modal.id&&<button className="btn btn-outline-danger me-auto" onClick={remove}>Delete</button>}<button className="btn btn-secondary" onClick={close}>Close</button><button className="btn btn-primary" onClick={save}>Save</button></div>
      </div></div>
      <div className="modal-backdrop fade show" onClick={close}/>
    </div>}
  </div>;
}
