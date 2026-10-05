import React,{useEffect,useMemo,useState} from "react";

const FIELD_TYPES=[
 {value:"text",label:"Text"},
 {value:"textarea",label:"Long Text"},
 {value:"number",label:"Number"},
 {value:"currency",label:"Currency"},
 {value:"date",label:"Date"},
 {value:"datetime",label:"Date & Time"},
 {value:"select",label:"Dropdown"},
 {value:"boolean",label:"Yes / No"},
];

export default function FormConfigurator({open,onClose,title="Customize Form",subtitle="",fields,onSave,onReset,saving=false}){
 const [draft,setDraft]=useState(fields||[]);
 const [dragKey,setDragKey]=useState(null);
 const [search,setSearch]=useState("");
 useEffect(()=>{if(open)setDraft((fields||[]).map(field=>({...field})));},[open,fields]);
 const visibleCount=draft.filter(field=>field.visible!==false).length;
 const filtered=useMemo(()=>{const q=search.trim().toLowerCase();if(!q)return draft;return draft.filter(field=>field.label.toLowerCase().includes(q)||field.key.toLowerCase().includes(q));},[draft,search]);
 const update=(key,patch)=>setDraft(prev=>prev.map(field=>field.key===key?{...field,...patch}:field));
 const moveByDrop=(sourceKey,targetKey)=>{
   if(!sourceKey||!targetKey||sourceKey===targetKey)return;
   setDraft(prev=>{const sourceIndex=prev.findIndex(field=>field.key===sourceKey);const targetIndex=prev.findIndex(field=>field.key===targetKey);if(sourceIndex<0||targetIndex<0)return prev;const next=prev.slice();const [item]=next.splice(sourceIndex,1);next.splice(targetIndex,0,item);return next.map((field,index)=>({...field,order:index}));});
 };
 const save=async()=>{await onSave(draft);onClose();};
 if(!open)return null;
 return <div className="form-settings-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
  <section className="form-settings-drawer" role="dialog" aria-modal="true" aria-label={title}>
   <div className="form-settings-header">
    <div><div className="small text-uppercase text-secondary fw-semibold">Form settings</div><h5 className="mb-1">{title}</h5><div className="small text-secondary">{subtitle||"Drag fields to change their order and use the controls to customize them."}</div></div>
    <button type="button" className="btn btn-light border rounded-circle" onClick={onClose} aria-label="Close"><i className="bi bi-x-lg"></i></button>
   </div>
   <div className="form-settings-body">
    <div className="form-settings-help"><i className="bi bi-arrows-move"></i><div><div className="fw-semibold">Drag & drop fields</div><div className="small text-secondary">Drag a row and drop it above another row. The order is saved for this form.</div></div></div>
    <div className="d-flex gap-2 mb-3"><div className="input-group input-group-sm flex-grow-1"><span className="input-group-text bg-white"><i className="bi bi-search"></i></span><input className="form-control" placeholder="Search fields" value={search} onChange={event=>setSearch(event.target.value)}/></div><span className="badge rounded-pill text-bg-light border d-flex align-items-center px-3">{visibleCount} shown</span></div>
    <div className="form-settings-list">
      {filtered.map(field=><div key={field.key} className={`form-settings-item ${dragKey===field.key?"is-dragging":""}`} draggable={!field.locked} onDragStart={()=>setDragKey(field.key)} onDragOver={event=>event.preventDefault()} onDrop={()=>{moveByDrop(dragKey,field.key);setDragKey(null);}} onDragEnd={()=>setDragKey(null)}>
        <div className="form-settings-item-top">
          <div className="d-flex align-items-center gap-2 min-w-0"><span className="form-settings-drag"><i className="bi bi-grip-vertical"></i></span><div className="form-settings-number">{(draft.findIndex(item=>item.key===field.key)+1)}</div><div className="min-w-0"><div className="fw-semibold text-truncate">{field.label}</div><div className="small text-secondary text-truncate">{field.key}</div></div></div>
          <div className="d-flex align-items-center gap-1"><button type="button" className={`btn btn-sm form-settings-visibility ${field.visible!==false?"on":"off"}`} disabled={field.locked} onClick={()=>update(field.key,{visible:field.visible===false})}><i className={`bi ${field.visible!==false?"bi-eye":"bi-eye-slash"}`}></i>{field.visible!==false?"Shown":"Hidden"}</button>{field.locked&&<i className="bi bi-lock-fill text-secondary ms-1"></i>}</div>
        </div>
        <div className="row g-2 mt-1">
          <div className="col-md-5"><label className="form-label">Label</label><input className="form-control form-control-sm" value={field.label} onChange={event=>update(field.key,{label:event.target.value})}/></div>
          <div className="col-md-4"><label className="form-label">Field type</label><select className="form-select form-select-sm" value={field.fieldType} disabled={field.locked} onChange={event=>update(field.key,{fieldType:event.target.value})}>{FIELD_TYPES.map(type=><option key={type.value} value={type.value}>{type.label}</option>)}</select></div>
          {field.fieldType==="select"&&<div className="col-12"><label className="form-label">Dropdown options</label><input className="form-control form-control-sm" value={(field.options||[]).join(", ")} onChange={event=>update(field.key,{options:event.target.value.split(",").map(item=>item.trim()).filter(Boolean)})} placeholder="Option 1, Option 2, Option 3"/><div className="form-text">Separate options with commas.</div></div>}
          <div className="col-md-3"><label className="form-label">Width</label><select className="form-select form-select-sm" value={field.width} onChange={event=>update(field.key,{width:Number(event.target.value)})}><option value="3">25%</option><option value="4">33%</option><option value="6">50%</option><option value="8">67%</option><option value="9">75%</option><option value="12">100%</option></select></div>
          {(field.fieldType==="number"||field.fieldType==="currency")&&<div className="col-12"><label className="form-label">Automatic formula <span className="text-secondary fw-normal">(optional)</span></label><input className="form-control form-control-sm font-monospace" value={field.formula||""} onChange={event=>update(field.key,{formula:event.target.value})} placeholder="Example: quantity * cut"/><div className="form-text">Use field keys with +, -, *, /, %, and parentheses.</div></div>}
          <div className="col-12 d-flex align-items-center gap-2"><div className="form-check form-switch"><input className="form-check-input" type="checkbox" checked={Boolean(field.required)} disabled={field.locked} onChange={event=>update(field.key,{required:event.target.checked})}/><label className="form-check-label small">Required</label></div><span className="small text-secondary">Section: {field.section}</span></div>
        </div>
      </div>)}
      {!filtered.length&&<div className="text-center text-secondary py-5">No fields found.</div>}
    </div>
   </div>
   <div className="form-settings-footer"><button type="button" className="btn btn-outline-danger" disabled={saving} onClick={onReset}>Reset</button><div className="ms-auto d-flex gap-2"><button type="button" className="btn btn-light border" disabled={saving} onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary px-4" disabled={saving} onClick={save}>{saving?<><span className="spinner-border spinner-border-sm me-2"></span>Saving...</>:"Save changes"}</button></div></div>
  </section>
 </div>;
}