import React,{useEffect,useMemo,useState} from "react";
import {evaluateArithmeticExpression} from "../utils/arithmetic";

const FIELD_TYPES=[
  {value:"text",label:"Short text",icon:"bi-fonts"},
  {value:"textarea",label:"Long text",icon:"bi-text-paragraph"},
  {value:"number",label:"Number",icon:"bi-123"},
  {value:"currency",label:"Money",icon:"bi-currency-rupee"},
  {value:"date",label:"Date",icon:"bi-calendar3"},
  {value:"datetime",label:"Date & time",icon:"bi-calendar2-week"},
  {value:"select",label:"Dropdown",icon:"bi-list-ul"},
  {value:"boolean",label:"Yes / No",icon:"bi-toggle-on"},
];

const WIDTHS=[
  {value:3,label:"25%"},
  {value:4,label:"33%"},
  {value:6,label:"50%"},
  {value:8,label:"67%"},
  {value:9,label:"75%"},
  {value:12,label:"100%"},
];

const humanize=value=>String(value||"").replace(/[_-]+/g," ").replace(/\b\w/g,char=>char.toUpperCase()).trim()||"General";

const clone=field=>({
  ...field,
  options:Array.isArray(field.options)?field.options.slice():[],
  visible:field.visible!==false,
  required:Boolean(field.required),
  locked:Boolean(field.locked),
  custom:Boolean(field.custom),
  width:Number(field.width)||6,
  section:field.section||"General",
  formula:field.formula||"",
  defaultValue:field.defaultValue??"",
});

export default function FormConfigurator({
  open,
  onClose,
  title="Customize Form",
  subtitle="",
  fields=[],
  onSave,
  onReset,
  saving=false,
}){
  const [draft,setDraft]=useState(()=>fields.map(clone));
  const [search,setSearch]=useState("");
  const [dragKey,setDragKey]=useState(null);
  const [expandedKey,setExpandedKey]=useState(null);
  const [showAddField,setShowAddField]=useState(false);
  const [error,setError]=useState("");
  const [newField,setNewField]=useState({
    label:"",
    fieldType:"text",
    section:"",
    width:6,
    required:false,
    optionsText:"",
  });

  useEffect(()=>{
    if(!open)return;
    setDraft(fields.map(clone));
    setSearch("");
    setExpandedKey(null);
    setShowAddField(false);
    setError("");
  },[open,fields]);

  const shownCount=draft.filter(field=>field.visible!==false).length;
  const sections=useMemo(
    ()=>Array.from(new Set(draft.map(field=>field.section||"General").filter(Boolean))),
    [draft]
  );
  const numericFields=useMemo(
    ()=>draft.filter(field=>["number","currency"].includes(field.fieldType)),
    [draft]
  );

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    if(!q)return draft;
    return draft.filter(field=>[
      field.label,field.key,field.section,FIELD_TYPES.find(type=>type.value===field.fieldType)?.label
    ].some(value=>String(value||"").toLowerCase().includes(q)));
  },[draft,search]);

  const update=(key,patch)=>{
    setDraft(prev=>prev.map(field=>field.key===key?{...field,...patch}:field));
  };

  const reorder=(sourceKey,targetKey)=>{
    if(!sourceKey||!targetKey||sourceKey===targetKey)return;
    setDraft(prev=>{
      const sourceIndex=prev.findIndex(field=>field.key===sourceKey);
      const targetIndex=prev.findIndex(field=>field.key===targetKey);
      if(sourceIndex<0||targetIndex<0)return prev;
      const next=prev.slice();
      const [moved]=next.splice(sourceIndex,1);
      next.splice(targetIndex,0,moved);
      return next.map((field,index)=>({...field,order:index}));
    });
  };

  const addField=()=>{
    const label=newField.label.trim();
    if(!label){
      setError("Please enter a field name.");
      return;
    }
    const duplicate=draft.some(field=>field.label.trim().toLowerCase()===label.toLowerCase());
    if(duplicate){
      setError("A field with this name already exists.");
      return;
    }
    const slug=label.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"").slice(0,42)||"field";
    const key=`custom_${slug}_${Date.now()}`;
    const options=newField.optionsText.split(/\r?\n|,/).map(value=>value.trim()).filter(Boolean);
    if(newField.fieldType==="select"&&!options.length){
      setError("Add at least one dropdown option.");
      return;
    }
    const section=newField.section.trim()||"General";
    setDraft(prev=>[...prev,{
      key,
      label,
      visible:true,
      required:Boolean(newField.required),
      locked:false,
      custom:true,
      fieldType:newField.fieldType,
      width:Number(newField.width)||6,
      order:prev.length,
      section,
      options:newField.fieldType==="select"?options:[],
      formula:"",
      defaultValue:"",
    }]);
    setNewField({
      label:"",
      fieldType:"text",
      section,
      width:6,
      required:false,
      optionsText:"",
    });
    setShowAddField(false);
    setExpandedKey(key);
    setError("");
    setSearch("");
  };

  const removeCustomField=key=>{
    const target=draft.find(field=>field.key===key);
    if(!target?.custom)return;
    setDraft(prev=>prev.filter(field=>field.key!==key).map((field,index)=>({...field,order:index})));
    setExpandedKey(null);
  };

  const save=async()=>{
    try{
      setError("");
      await onSave(draft.map((field,index)=>({...field,order:index})));
      onClose();
    }catch(saveError){
      setError(saveError?.response?.data?.message||saveError?.message||"Unable to save these changes.");
    }
  };

  const reset=async()=>{
    try{
      setError("");
      await onReset();
    }catch(resetError){
      setError(resetError?.response?.data?.message||resetError?.message||"Unable to reset the form.");
    }
  };

  const addFormulaToken=(key,token)=>{
    const field=draft.find(item=>item.key===key);
    if(!field)return;
    const current=field.formula||"";
    const joiner=current&&/[A-Za-z0-9_]$/.test(current)?" ":"";
    update(key,{formula:`${current}${joiner}${token}`});
  };

  const validateFormula=(field)=>{
    const formula=String(field.formula||"").trim();
    if(!formula)return "";
    const variables=Object.fromEntries(numericFields.map(item=>[item.key,1]));
    try{
      evaluateArithmeticExpression(formula,variables);
      return "";
    }catch(error){
      return error.message||"Check the calculation.";
    }
  };

  if(!open)return null;

  return(
    <div className="form-settings-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
      <section className="form-builder" role="dialog" aria-modal="true" aria-label={title}>
        <header className="form-builder-header">
          <div className="min-w-0">
            <div className="form-builder-kicker"><i className="bi bi-sliders2 me-1"></i>Customize</div>
            <h4 className="mb-1">{title}</h4>
            <p className="mb-0">{subtitle||"Set up the form the way your business works."}</p>
          </div>
          <button type="button" className="btn btn-light border rounded-circle form-builder-close" onClick={onClose} aria-label="Close">
            <i className="bi bi-x-lg"></i>
          </button>
        </header>

        <div className="form-builder-summary">
          <div>
            <strong>{shownCount}</strong> of {draft.length} fields are shown
          </div>
          <div className="d-flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm btn-light border" onClick={()=>setDraft(prev=>prev.map(field=>({...field,visible:true})))}><i className="bi bi-eye me-1"></i>Show all</button>
            <button type="button" className="btn btn-sm btn-light border" onClick={()=>setShowAddField(value=>!value)}><i className="bi bi-plus-lg me-1"></i>Add field</button>
          </div>
        </div>

        {error&&<div className="alert alert-danger mx-3 mt-3 mb-0 py-2">{error}</div>}

        <div className="form-builder-body">
          {showAddField&&(
            <section className="form-builder-add">
              <div className="form-builder-add-title">
                <div>
                  <h6 className="mb-1">Add your own field</h6>
                  <div className="small text-secondary">Give it a simple name. You can change the rest later.</div>
                </div>
                <button type="button" className="btn btn-sm btn-light border" onClick={()=>setShowAddField(false)}>Close</button>
              </div>
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label">What should this field be called?</label>
                  <input className="form-control" autoFocus value={newField.label} onChange={event=>setNewField(prev=>({...prev,label:event.target.value}))} placeholder="Example: Sales person"/>
                </div>
                <div className="col-md-6">
                  <label className="form-label">What kind of answer?</label>
                  <select className="form-select" value={newField.fieldType} onChange={event=>setNewField(prev=>({...prev,fieldType:event.target.value,optionsText:""}))}>
                    {FIELD_TYPES.map(type=><option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label">Where should it appear?</label>
                  <input className="form-control" list="formSectionOptions" value={newField.section} onChange={event=>setNewField(prev=>({...prev,section:event.target.value}))} placeholder="Example: Payment details"/>
                  <datalist id="formSectionOptions">{sections.map(section=><option key={section} value={humanize(section)}/>)}</datalist>
                </div>
                <div className="col-md-6">
                  <label className="form-label">How much space should it use?</label>
                  <select className="form-select" value={newField.width} onChange={event=>setNewField(prev=>({...prev,width:Number(event.target.value)}))}>
                    {WIDTHS.map(width=><option key={width.value} value={width.value}>{width.label}</option>)}
                  </select>
                </div>
                {newField.fieldType==="select"&&(
                  <div className="col-12">
                    <label className="form-label">Choices</label>
                    <textarea className="form-control" rows={2} value={newField.optionsText} onChange={event=>setNewField(prev=>({...prev,optionsText:event.target.value}))} placeholder="One choice per line, for example: Retail, Wholesale, Other"/>
                  </div>
                )}
                <div className="col-12">
                  <div className="form-check form-switch">
                    <input className="form-check-input" type="checkbox" checked={newField.required} onChange={event=>setNewField(prev=>({...prev,required:event.target.checked}))}/>
                    <label className="form-check-label">People must fill this field</label>
                  </div>
                </div>
              </div>
              <button type="button" className="btn btn-primary mt-3" onClick={addField}><i className="bi bi-plus-lg me-1"></i>Add field</button>
            </section>
          )}

          <div className="form-builder-toolbar">
            <div className="input-group">
              <span className="input-group-text bg-white"><i className="bi bi-search"></i></span>
              <input className="form-control" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Find a field"/>
            </div>
            <div className="small text-secondary">Drag the handle to move a field.</div>
          </div>

          <div className="form-builder-list">
            {filtered.map((field,index)=>(
              <article
                key={field.key}
                className={`form-builder-item ${field.visible===false?"is-hidden ":""}${expandedKey===field.key?"is-open ":""}${dragKey===field.key?"is-dragging":""}`}
                draggable={!field.locked}
                onDragStart={()=>setDragKey(field.key)}
                onDragOver={event=>event.preventDefault()}
                onDrop={()=>{reorder(dragKey,field.key);setDragKey(null);}}
                onDragEnd={()=>setDragKey(null)}
              >
                <div className="form-builder-item-head">
                  <span className="form-builder-handle" title="Drag to move"><i className="bi bi-grip-vertical"></i></span>
                  <div className="form-builder-type-icon"><i className={`bi ${FIELD_TYPES.find(type=>type.value===field.fieldType)?.icon||"bi-fonts"}`}></i></div>
                  <div className="flex-grow-1 min-w-0">
                    <div className="d-flex flex-wrap align-items-center gap-2">
                      <strong className="text-truncate">{field.label||field.key}</strong>
                      {field.required&&<span className="badge bg-light text-dark border">Required</span>}
                      {field.custom&&<span className="badge bg-primary-subtle text-primary-emphasis">Custom</span>}
                    </div>
                    <div className="small text-secondary">{humanize(field.section)} · {FIELD_TYPES.find(type=>type.value===field.fieldType)?.label||"Text"}</div>
                  </div>
                  <button
                    type="button"
                    className={`btn btn-sm form-builder-eye ${field.visible!==false?"is-on":""}`}
                    disabled={field.locked}
                    onClick={()=>update(field.key,{visible:field.visible===false})}
                    title={field.visible!==false?"Hide field":"Show field"}
                  >
                    <i className={`bi ${field.visible!==false?"bi-eye":"bi-eye-slash"}`}></i>
                  </button>
                  <button type="button" className="btn btn-sm btn-light border form-builder-more" onClick={()=>setExpandedKey(expandedKey===field.key?null:field.key)}>
                    {expandedKey===field.key?"Done":"Edit"}
                  </button>
                </div>

                {expandedKey===field.key&&(
                  <div className="form-builder-editor">
                    <div className="row g-3">
                      <div className="col-md-7">
                        <label className="form-label">Field name shown to users</label>
                        <input className="form-control" value={field.label} onChange={event=>update(field.key,{label:event.target.value})}/>
                      </div>
                      <div className="col-md-5">
                        <label className="form-label">Where should it appear?</label>
                        <input className="form-control" list="formSectionOptions" value={field.section||"General"} onChange={event=>update(field.key,{section:event.target.value})}/>
                      </div>

                      <div className="col-12">
                        <label className="form-label">Field type</label>
                        <div className="form-builder-type-grid">
                          {FIELD_TYPES.map(type=>(
                            <button
                              type="button"
                              key={type.value}
                              className={`form-builder-type-card ${field.fieldType===type.value?"active":""}`}
                              disabled={field.locked}
                              onClick={()=>update(field.key,{fieldType:type.value,options:type.value==="select"?(field.options||[]):[],formula:["number","currency"].includes(type.value)?field.formula:""})}
                            >
                              <i className={`bi ${type.icon}`}></i>
                              <span>{type.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="col-md-7">
                        <label className="form-label">Field width</label>
                        <div className="form-builder-widths">
                          {WIDTHS.map(width=><button type="button" key={width.value} className={`btn btn-sm ${Number(field.width)===width.value?"btn-primary":"btn-light border"}`} onClick={()=>update(field.key,{width:width.value})}>{width.label}</button>)}
                        </div>
                      </div>
                      <div className="col-md-5">
                        <label className="form-label">Starting value <span className="text-secondary">(optional)</span></label>
                        <input
                          className="form-control"
                          value={field.defaultValue??""}
                          onChange={event=>update(field.key,{defaultValue:event.target.value})}
                          disabled={field.locked}
                          placeholder="Leave blank for none"
                        />
                      </div>

                      {field.fieldType==="select"&&(
                        <div className="col-12">
                          <label className="form-label">Choices shown in the dropdown</label>
                          <textarea className="form-control" rows={3} value={(field.options||[]).join("\n")} onChange={event=>update(field.key,{options:event.target.value.split(/\r?\n|,/).map(value=>value.trim()).filter(Boolean)})} placeholder="One choice per line"/>
                        </div>
                      )}

                      {(field.fieldType==="number"||field.fieldType==="currency")&&(
                        <div className="col-12">
                          <div className="form-builder-calculation">
                            <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                              <div>
                                <label className="form-label mb-1">Automatic calculation</label>
                                <div className="small text-secondary">Use the buttons below instead of remembering field names.</div>
                              </div>
                              {field.formula&&validateFormula(field)&&<span className="badge bg-warning text-dark">{validateFormula(field)}</span>}
                            </div>
                            <input className="form-control mb-2" value={field.formula||""} onChange={event=>update(field.key,{formula:event.target.value})} placeholder="Example: Quantity × Rate"/>
                            <div className="form-builder-calculator-row">
                              {numericFields.filter(item=>item.key!==field.key).slice(0,12).map(item=>(
                                <button type="button" key={item.key} className="btn btn-sm btn-light border" onClick={()=>addFormulaToken(field.key,item.key)}>{item.label}</button>
                              ))}
                            </div>
                            <div className="form-builder-calculator-row mt-2">
                              {["+","-","*","/","%","(",")"].map(operator=><button type="button" key={operator} className="btn btn-sm btn-outline-secondary" onClick={()=>addFormulaToken(field.key,operator)}>{operator==="*"?"×":operator==="/"?"÷":operator}</button>)}
                            </div>
                            <div className="form-text">You can type numbers too. Example: Quantity × Rate + Tax.</div>
                          </div>
                        </div>
                      )}

                      <div className="col-12 d-flex flex-wrap gap-3 align-items-center">
                        <div className="form-check form-switch">
                          <input className="form-check-input" type="checkbox" checked={Boolean(field.required)} disabled={field.locked} onChange={event=>update(field.key,{required:event.target.checked})}/>
                          <label className="form-check-label">Required</label>
                        </div>
                        {field.custom&&(
                          <button type="button" className="btn btn-sm btn-outline-danger" onClick={()=>removeCustomField(field.key)}>
                            <i className="bi bi-trash me-1"></i>Remove field
                          </button>
                        )}
                        {field.locked&&<span className="small text-secondary"><i className="bi bi-lock me-1"></i>Built-in field</span>}
                      </div>
                    </div>
                  </div>
                )}
              </article>
            ))}
            {!filtered.length&&<div className="form-builder-empty">No fields match your search.</div>}
          </div>
        </div>

        <footer className="form-builder-footer">
          <button type="button" className="btn btn-outline-danger" disabled={saving} onClick={reset}><i className="bi bi-arrow-counterclockwise me-1"></i>Reset to default</button>
          <div className="ms-auto d-flex gap-2">
            <button type="button" className="btn btn-light border" disabled={saving} onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary px-4" disabled={saving} onClick={save}>{saving?<><span className="spinner-border spinner-border-sm me-2"></span>Saving</>:"Save changes"}</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
