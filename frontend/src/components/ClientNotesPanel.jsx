import React,{useCallback,useEffect,useState} from "react";
import axios from "axios";
import "./ClientNotesPanel.css";

const auth=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});
const formatDate=value=>{
 const date=value?new Date(value):null;
 return date&&!Number.isNaN(date.getTime())?date.toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"}):"Date not available";
};

export default function ClientNotesPanel({clientId,apiBase}){
 const [notes,setNotes]=useState([]);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const [composerOpen,setComposerOpen]=useState(false);
 const [editingNote,setEditingNote]=useState(null);
 const [title,setTitle]=useState("");
 const [content,setContent]=useState("");

 const loadNotes=useCallback(async()=>{
  if(!clientId)return;
  setLoading(true);setError("");
  try{
   const response=await axios.get(apiBase+"/api/clients/"+clientId+"/activities",{...auth(),params:{limit:500}});
   const entries=Array.isArray(response.data?.activities)?response.data.activities:[];
   setNotes(entries.filter(item=>item.type==="note"&&item.source==="manual"));
  }catch(loadError){
   setError(loadError.response?.data?.message||"Customer notes could not be loaded. Please try again.");
  }finally{setLoading(false);}
 },[apiBase,clientId]);

 useEffect(()=>{loadNotes();},[loadNotes]);

 const resetComposer=()=>{setComposerOpen(false);setEditingNote(null);setTitle("");setContent("");};
 const startEdit=note=>{
  setEditingNote(note);setTitle(note.title||"");setContent(note.description||"");setComposerOpen(true);setError("");
 };
 const saveNote=async event=>{
  event.preventDefault();
  if(!title.trim()){setError("Give this note a short title.");return;}
  setSaving(true);setError("");
  const payload={subject:title.trim(),description:content.trim()};
  try{
   if(editingNote?.sourceId){
    await axios.patch(apiBase+"/api/clients/"+clientId+"/activities/"+editingNote.sourceId,payload,auth());
   }else{
    await axios.post(apiBase+"/api/clients/"+clientId+"/activities",{type:"note",...payload},auth());
   }
   resetComposer();
   await loadNotes();
  }catch(saveError){
   setError(saveError.response?.data?.message||"This note could not be saved. Please try again.");
  }finally{setSaving(false);}
 };
 const deleteNote=async note=>{
  if(!note.sourceId||!window.confirm("Delete this customer note? This cannot be undone."))return;
  setError("");
  try{
   await axios.delete(apiBase+"/api/clients/"+clientId+"/activities/"+note.sourceId,auth());
   await loadNotes();
  }catch(deleteError){
   setError(deleteError.response?.data?.message||"This note could not be deleted.");
  }
 };

 return (
  <section className="client-notes-panel" aria-label="Customer notes">
   <header className="client-notes-heading">
    <div><h3>Notes</h3><p>Keep important preferences, discussions and customer-specific instructions together.</p></div>
    <button type="button" className="btn btn-primary" onClick={()=>{resetComposer();setComposerOpen(true);setError("");}}>
     <i className="bi bi-plus-lg"></i><span>Add note</span>
    </button>
   </header>
   {error&&<div className="alert alert-warning py-2 mx-3 mt-3 mb-0" role="alert">{error}</div>}
   {composerOpen&&(
    <form className="client-notes-composer" onSubmit={saveNote}>
     <div className="client-notes-composer-heading">
      <div><strong>{editingNote?"Edit note":"New customer note"}</strong><span>Notes are only visible inside this customer's profile.</span></div>
      <button type="button" className="btn-close" aria-label="Close note editor" onClick={resetComposer}/>
     </div>
     <label className="form-label" htmlFor="client-note-title">Title</label>
     <input id="client-note-title" className="form-control" value={title} onChange={event=>setTitle(event.target.value)} maxLength={160} placeholder="Example: Prefers WhatsApp updates" required autoFocus/>
     <label className="form-label mt-3" htmlFor="client-note-content">Note</label>
     <textarea id="client-note-content" className="form-control" rows={4} maxLength={4000} value={content} onChange={event=>setContent(event.target.value)} placeholder="Write the details you want your team to remember..."/>
     <div className="client-notes-composer-footer">
      <span>{content.length}/4000 characters</span>
      <div><button type="button" className="btn btn-light border" onClick={resetComposer}>Cancel</button>
       <button type="submit" className="btn btn-primary" disabled={saving}>{saving?"Saving...":editingNote?"Save changes":"Save note"}</button></div>
     </div>
    </form>
   )}
   <div className="client-notes-list">
    {loading?<div className="client-notes-state"><span className="spinner-border spinner-border-sm me-2"></span>Loading notes...</div>
     :!notes.length?<div className="client-notes-empty">
       <span><i className="bi bi-sticky"></i></span><strong>No notes yet</strong>
       <p>Save details that help you serve this customer better, such as preferences, size requirements or promised actions.</p>
       <button type="button" className="btn btn-outline-primary" onClick={()=>setComposerOpen(true)}>Add the first note</button>
      </div>
     :notes.map(note=>(
      <article className="client-note-card" key={note.id}>
       <div className="client-note-card-icon"><i className="bi bi-sticky"></i></div>
       <div className="client-note-card-copy">
        <div className="client-note-card-meta"><strong>{note.title}</strong><time dateTime={note.occurredAt}>{formatDate(note.occurredAt)}</time></div>
        {note.description&&<p>{note.description}</p>}
        <div className="client-note-card-actions">
         <button type="button" onClick={()=>startEdit(note)}><i className="bi bi-pencil"></i>Edit</button>
         <button type="button" className="is-danger" onClick={()=>deleteNote(note)}><i className="bi bi-trash"></i>Delete</button>
        </div>
       </div>
      </article>
     ))}
   </div>
  </section>
 );
}
