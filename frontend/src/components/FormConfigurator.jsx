import React,{useEffect,useMemo,useState} from "react";
import axios from "axios";
import {evaluateArithmeticExpression} from "../utils/arithmetic";

const FIELD_TYPES=[
  {value:"text",label:"Short text",icon:"bi-fonts"},
  {value:"textarea",label:"Long text",icon:"bi-text-paragraph"},
  {value:"number",label:"Number",icon:"bi-123"},
  {value:"currency",label:"Money",icon:"bi-currency-rupee"},
  {value:"date",label:"Date",icon:"bi-calendar3"},
  {value:"datetime",label:"Date & time",icon:"bi-calendar2-week"},
  {value:"select",label:"Dropdown",icon:"bi-list-ul"},
  {value:"multiselect",label:"Multiple choices",icon:"bi-check2-square"},
  {value:"boolean",label:"Yes / No",icon:"bi-toggle-on"},
  {value:"email",label:"Email",icon:"bi-envelope"},
  {value:"phone",label:"Phone",icon:"bi-telephone"},
  {value:"url",label:"Website",icon:"bi-link-45deg"},
  {value:"reference",label:"Existing record",icon:"bi-database"},
];

const COMMON_FIELD_TYPES=FIELD_TYPES.filter(type=>["text","number","currency","date","select","boolean","phone","reference"].includes(type.value));
const ADVANCED_FIELD_TYPES=FIELD_TYPES.filter(type=>!COMMON_FIELD_TYPES.some(item=>item.value===type.value));

const DATA_SOURCES=[
  {value:"none",label:"Enter it manually",fields:[]},
  {value:"clients",label:"Customer records",fields:[
    ["_id","Client ID"],["name","Contact person"],["companyName","Customer / business name"],["phone","Phone"],["email","Email"],["gstNumber","GST Number"],["state","State"],["city","City"],["paymentTerms","Payment Terms"],["discountRate","Discount Rate"]
  ]},
  {value:"products",label:"Product records",fields:[
    ["_id","Product ID"],["productName","Product Name"],["productCode","Product Code"],["designNo","Design No."],["rate","Rate"],["quantity","Stock"],["purchasePrice","Purchase Price"],["barcode","Barcode"]
  ]},
  {value:"orders",label:"Invoice records",fields:[
    ["_id","Invoice ID"],["orderNumber","Invoice No."],["companyName","Client"],["orderDate","Bill Date"],["totalAmount","Total"],["paidAmount","Paid"],["dueAmount","Due"],["status","Status"]
  ]},
  {value:"expenses",label:"Expense records",fields:[
    ["_id","Expense ID"],["title","Title"],["category","Category"],["amount","Amount"],["vendor","Vendor"],["date","Date"]
  ]},
  {value:"suppliers",label:"Supplier records",fields:[
    ["_id","Supplier ID"],["name","Supplier Name"],["gstin","GSTIN"],["reliability_score","Reliability Score"]
  ]},
  {value:"machines",label:"Machine records",fields:[
    ["_id","Machine ID"],["name","Machine Name"],["totalOrdersProcessed","Orders Processed"],["totalRevenueGenerated","Revenue Generated"],["downtimeHours","Downtime Hours"]
  ]},
  {value:"users",label:"Team members",fields:[
    ["_id","Team member"],["username","Name"],["email","Email"]
  ]},
];

const CONDITION_OPERATORS=[
  {value:"equals",label:"is"},
  {value:"not_equals",label:"is not"},
  {value:"contains",label:"contains"},
  {value:"not_contains",label:"does not contain"},
  {value:"greater_than",label:"is greater than"},
  {value:"less_than",label:"is less than"},
  {value:"empty",label:"is empty"},
  {value:"not_empty",label:"is not empty"}
];

const WIDTHS=[
  {value:3,label:"25%"},
  {value:4,label:"33%"},
  {value:6,label:"50%"},
  {value:8,label:"67%"},
  {value:9,label:"75%"},
  {value:12,label:"100%"},
];

const sourceFor=(resource,sources=DATA_SOURCES)=>sources.find(source=>source.value===resource)||sources[0];
const sourceFields=(sources,resource)=>sourceFor(resource,sources).fields;

const humanize=value=>String(value||"").replace(/[_-]+/g," ").replace(/\b\w/g,char=>char.toUpperCase()).trim()||"General";

const clone=field=>({
  ...field,
  options:Array.isArray(field.options)?field.options.map(option=>(
    option&&typeof option==="object"
      ?{value:String(option.value??option.label??""),label:String(option.label??option.value??"")}
      :{value:String(option??""),label:String(option??"")}
  )).filter(option=>option.value):[],
  visible:field.visible!==false,
  required:Boolean(field.required),
  locked:Boolean(field.locked),
  system:Boolean(field.system),
  custom:Boolean(field.custom),
  width:Number(field.width)||6,
  section:field.section||"General",
  formula:field.formula||"",
  helpText:String(field.helpText||""),
  defaultValue:field.defaultValue??"",
  validation:field.validation&&typeof field.validation==="object"?{min:field.validation.min??null,max:field.validation.max??null,pattern:field.validation.pattern||""}:{min:null,max:null,pattern:""},
  editable:field.editable!==false,
  readOnly:Boolean(field.readOnly||field.formula),
  disabled:Boolean(field.disabled),
  dataSource:field.dataSource&&typeof field.dataSource==="object"?{
    ...field.dataSource,
    type:field.dataSource.type==="lookup"?"lookup":"none",
    multiple:Boolean(field.dataSource.multiple),
    autoFill:Array.isArray(field.dataSource.autoFill)?field.dataSource.autoFill.map(item=>({...item})):[],
  }:{type:"none",resource:"",valueField:"_id",labelField:"",searchField:"",multiple:false,autoFill:[]},
  conditions:Array.isArray(field.conditions)?field.conditions.map(item=>({...item})):[],
});

export default function FormConfigurator({
  open,
  onClose,
  title="Customize form",
  subtitle="",
  fields=[],
  onSave,
  onReset,
  saving=false,
}){
  const [draft,setDraft]=useState(()=>fields.map(clone));
  const [search,setSearch]=useState("");
  const [dragKey,setDragKey]=useState(null);
  const [dropTargetKey,setDropTargetKey]=useState(null);
  const [expandedKey,setExpandedKey]=useState(null);
  const [showAddField,setShowAddField]=useState(false);
  const [showAdvanced,setShowAdvanced]=useState(false);
  const [showPreview,setShowPreview]=useState(false);
  const [error,setError]=useState("");
  const [newField,setNewField]=useState({
    label:"",
    fieldType:"text",
    section:"",
    width:6,
    required:false,
    helpText:"",
    optionsText:"",
  });
  const [sourceCatalog,setSourceCatalog]=useState(DATA_SOURCES);

  useEffect(()=>{
    if(!open)return;
    setDraft(fields.map(clone));
    setSearch("");
    setExpandedKey(null);
    setShowAddField(false);
    setShowAdvanced(false);
    setShowPreview(false);
    setError("");
  },[open,fields]);

  useEffect(()=>{
    if(!open)return;
    let cancelled=false;
    const loadSources=async()=>{
      try{
        const apiBase=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
        const response=await axios.get(apiBase+"/api/no-code-data/sources",{
          headers:{"x-auth-token":localStorage.getItem("token")||""}
        });
        const remoteSources=(response.data?.sources||[]).map(source=>({
          value:source.key,
          label:source.label,
          fields:(source.fields||[]).map(field=>[field.value,field.label])
        }));
        if(!cancelled&&remoteSources.length){
          setSourceCatalog([{value:"none",label:"Enter it manually",fields:[]},...remoteSources]);
        }
      }catch{
        // Keep the built-in friendly source list when the metadata endpoint is unavailable.
      }
    };
    loadSources();
    return()=>{cancelled=true;};
  },[open]);

  const normalizePreviewOptions=options=>(options||[]).map(option=>(
    option&&typeof option==="object"
      ?{value:String(option.value??option.label??""),label:String(option.label??option.value??"")}
      :{value:String(option??""),label:String(option??"")}
  )).filter(option=>option.value);

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
      field.label,field.section,FIELD_TYPES.find(type=>type.value===field.fieldType)?.label
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
    if(["select","multiselect"].includes(newField.fieldType)&&!options.length){
      setError("Add at least one choice.");
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
      helpText:newField.helpText.trim(),
      options:["select","multiselect"].includes(newField.fieldType)
        ?options.map(option=>({value:option,label:option}))
        :[],
      formula:"",
      defaultValue:"",
      validation:{min:null,max:null,pattern:""},
      editable:true,
      readOnly:false,
      disabled:false,
      dataSource:{type:"none",resource:"",valueField:"_id",labelField:"",searchField:"",multiple:newField.fieldType==="multiselect",autoFill:[]},
      conditions:[],
    }]);
    setNewField({
      label:"",
      fieldType:"text",
      section,
      width:6,
      required:false,
      helpText:"",
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

      const hiddenRequired=draft.find(field=>field.required&&field.visible===false);
      if(hiddenRequired){
        throw new Error(`“${hiddenRequired.label||"This field"}” is required but hidden. Show it or turn off Required.`);
      }

      const duplicateLabels=new Set();
      for(const field of draft){
        const normalized=String(field.label||"").trim().toLowerCase();
        if(!normalized)throw new Error("Every field needs a name.");
        if(duplicateLabels.has(normalized))throw new Error(`“${field.label}” appears more than once. Rename one of the fields.`);
        duplicateLabels.add(normalized);
      }

      for(const field of draft){
        const formulaError=validateFormula(field);
        if(formulaError)throw new Error(`Check the calculation for “${field.label}”: ${formulaError}`);
        for(const condition of field.conditions||[]){
          if(condition.fieldKey&&!draft.some(candidate=>candidate.key===condition.fieldKey)){
            throw new Error(`The rule on “${field.label}” uses a field that no longer exists.`);
          }
        }
      }

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

  const formulaDisplayTokens=field=>{
    const formula=String(field?.formula||"").trim();
    if(!formula)return [];
    const tokens=formula.match(/[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|[()+\-*/]/g)||[];
    return tokens.map(token=>{
      if(/^[A-Za-z_]/.test(token)){
        const found=draft.find(item=>item.key===token);
        return found?.label||"Field";
      }
      return {"*":"×","/":"÷","-":"−","+":"+"}[token]||token;
    });
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
            <p className="mb-0">{subtitle||"Start with the basics. Drag fields, rename them and choose how people use them. More options stay hidden until you need them."}</p>
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
                {["select","multiselect"].includes(newField.fieldType)&&(
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

          {showPreview&&(
            <div className="card border-0 shadow-sm bg-white mb-3">
              <div className="card-header bg-white d-flex align-items-center justify-content-between">
                <div>
                  <div className="fw-semibold">Live preview</div>
                  <div className="small text-secondary">This is how the form will look when people use it.</div>
                </div>
                <span className="badge bg-light text-dark border">{shownCount} visible</span>
              </div>
              <div className="card-body">
                <div className="row g-3">
                  {draft.filter(field=>field.visible!==false).map(field=>{
                    return (
                      <div key={field.key} className={`col-12 col-md-${field.width||6}`}>
                        <label className="form-label fw-semibold">{field.label}{field.required&&<span className="text-danger ms-1">*</span>}</label>
                        {["select","reference"].includes(field.fieldType)||field.dataSource?.resource ? (
                          <select className="form-select" disabled>
                            <option>{field.dataSource?.resource?"Select "+field.label:"Choose an option"}</option>
                            {normalizePreviewOptions(field.options).map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        ) : field.fieldType==="textarea" ? (
                          <textarea className="form-control" rows={2} placeholder={field.formula?"Automatic calculation":""} readOnly />
                        ) : field.fieldType==="boolean" ? (
                          <div className="form-check form-switch pt-2"><input className="form-check-input" type="checkbox" disabled /></div>
                        ) : (
                          <input className="form-control" type={field.fieldType==="date"?"date":field.fieldType==="datetime"?"datetime-local":field.fieldType==="email"?"email":field.fieldType==="url"?"url":field.fieldType==="number"||field.fieldType==="currency"?"number":"text"} placeholder={field.formula?"Automatic calculation":""} readOnly={Boolean(field.formula)} />
                        )}
                        {field.helpText&&<div className="form-text">{field.helpText}</div>}
                        {field.formula&&<div className="form-text">Calculated automatically</div>}
                        {field.readOnly&&!field.formula&&<div className="form-text">Read only</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
  
            )}

          <div className="form-builder-guide">
            <div className="form-builder-guide-step is-active"><span>1</span><div><strong>Choose fields</strong><small>Keep only what your team needs.</small></div></div>
            <div className="form-builder-guide-line"></div>
            <div className="form-builder-guide-step"><span>2</span><div><strong>Adjust when needed</strong><small>Advanced connections and rules stay hidden until you ask for them.</small></div></div>
            <button type="button" className="form-builder-preview-toggle" onClick={()=>setShowPreview(value=>!value)}>
              <i className="bi bi-eye me-2"></i>{showPreview?"Hide preview":"Preview form"}
            </button>
          </div>

          <div className="form-builder-toolbar">
            <div className="input-group">
              <span className="input-group-text bg-white"><i className="bi bi-search"></i></span>
              <input className="form-control" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Find a field"/>
            </div>
            <div className="small text-secondary">Drag the handle to move a field.</div>
          </div>

          <div className="form-builder-list">
            {filtered.map(field=>(
              <article
                key={field.key}
                className={`form-builder-item ${field.visible===false?"is-hidden ":""}${expandedKey===field.key?"is-open ":""}${dragKey===field.key?"is-dragging ":""}${dropTargetKey===field.key&&dragKey!==field.key?"is-drop-target":""}`}
                onDragOver={event=>{if(dragKey&&dragKey!==field.key){event.preventDefault();setDropTargetKey(field.key);}}}
                onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget))setDropTargetKey(current=>current===field.key?null:current);}}
                onDrop={event=>{event.preventDefault();reorder(dragKey,field.key);setDragKey(null);setDropTargetKey(null);}}
                onDragEnd={()=>{setDragKey(null);setDropTargetKey(null);}}
              >
                <div className="form-builder-item-head">
                  <span className={`form-builder-handle ${field.locked?"is-locked":""}`} title={field.locked?"This field cannot be moved":"Drag this handle to move the field"} draggable={!field.locked} onDragStart={event=>{if(field.locked){event.preventDefault();return;}event.dataTransfer?.setData("text/plain",field.key);if(event.dataTransfer)event.dataTransfer.effectAllowed="move";setDragKey(field.key);setDropTargetKey(null);}} onDragEnd={()=>{setDragKey(null);setDropTargetKey(null);}} aria-label={`Move ${field.label}`}><i className="bi bi-grip-vertical"></i></span>
                  <div className="form-builder-type-icon"><i className={`bi ${FIELD_TYPES.find(type=>type.value===field.fieldType)?.icon||"bi-fonts"}`}></i></div>
                  <div className="flex-grow-1 min-w-0">
                    <div className="d-flex flex-wrap align-items-center gap-2">
                      <strong className="text-truncate">{field.label||field.key}</strong>
                      {field.required&&<span className="badge bg-light text-dark border">Required</span>}
                      {field.custom&&<span className="badge bg-primary-subtle text-primary-emphasis">Custom</span>}
                      {field.system&&<span className="badge bg-light text-dark border">Built-in</span>}
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
                  <button type="button" className="btn btn-sm btn-light border form-builder-more" onClick={()=>{
                    setShowAdvanced(false);
                    setExpandedKey(expandedKey===field.key?null:field.key);
                  }}>
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
                      <details className="form-builder-secondary-details">
                        <summary><i className="bi bi-layout-text-sidebar-reverse me-2"></i>Display, layout & starting value</summary>
                        <div className="form-builder-secondary-details-body">
                      <div className="col-md-5">
                        <label className="form-label">Where should it appear?</label>
                        <input className="form-control" list="formSectionOptions" value={field.section||"General"} onChange={event=>update(field.key,{section:event.target.value})}/>
                      </div>

                      <div className="col-12">
                        <label className="form-label">Field type</label>
                        <div className="form-builder-type-grid">
                          {COMMON_FIELD_TYPES.map(type=>(
                            <button
                              type="button"
                              key={type.value}
                              className={`form-builder-type-card ${field.fieldType===type.value?"active":""}`}
                              disabled={field.locked||field.system}
                              onClick={()=>update(field.key,{
                                fieldType:type.value,
                                options:["select","multiselect"].includes(type.value)?(field.options||[]):[],
                                formula:["number","currency"].includes(type.value)?field.formula:"",
                                readOnly:["number","currency"].includes(type.value)&&field.formula?true:field.readOnly,
                                dataSource:["reference","select","multiselect"].includes(type.value)
                                  ?field.dataSource
                                  :{type:"none",resource:"",valueField:"_id",labelField:"",searchField:"",multiple:false,autoFill:[]}
                              })}
                            >
                              <i className={`bi ${type.icon}`}></i><span>{type.label}</span>
                            </button>
                          ))}
                        </div>
                        <details className="form-builder-advanced-details mt-2">
                          <summary><i className="bi bi-three-dots me-2"></i>More field types</summary>
                          <div className="form-builder-type-grid mt-2">
                            {ADVANCED_FIELD_TYPES.map(type=>(
                              <button
                                type="button"
                                key={type.value}
                                className={`form-builder-type-card ${field.fieldType===type.value?"active":""}`}
                                disabled={field.locked||field.system}
                                onClick={()=>update(field.key,{
                                  fieldType:type.value,
                                  options:["select","multiselect"].includes(type.value)?(field.options||[]):[],
                                  formula:["number","currency"].includes(type.value)?field.formula:"",
                                  readOnly:["number","currency"].includes(type.value)&&field.formula?true:field.readOnly,
                                  dataSource:["reference","select","multiselect"].includes(type.value)
                                    ?field.dataSource
                                    :{type:"none",resource:"",valueField:"_id",labelField:"",searchField:"",multiple:false,autoFill:[]}
                                })}
                              >
                                <i className={`bi ${type.icon}`}></i><span>{type.label}</span>
                              </button>
                            ))}
                          </div>
                        </details>
                      </div>

                      <div className="col-md-7">
                        <label className="form-label">Field width</label>
                        <div className="form-builder-widths">
                          {WIDTHS.map(width=><button type="button" key={width.value} className={`btn btn-sm ${Number(field.width)===width.value?"btn-primary":"btn-light border"}`} onClick={()=>update(field.key,{width:width.value})}>{width.label}</button>)}
                        </div>
                      </div>

                      <div className="col-md-5">
                        <label className="form-label">Starting value</label>
                        <input className="form-control" value={field.defaultValue??""} onChange={event=>update(field.key,{defaultValue:event.target.value})} disabled={field.locked} placeholder="Leave blank for none"/>
                      </div>
                      <div className="col-12">
                        <label className="form-label">Helpful note for users <span className="text-secondary">(optional)</span></label>
                        <input className="form-control" value={field.helpText||""} onChange={event=>update(field.key,{helpText:event.target.value})} disabled={field.locked} placeholder="Example: Enter the customer WhatsApp number"/>
                      </div>

                        </div>
                      </details>

                      <div className="col-12">
                        <div className="form-builder-panel">
                          <div className="fw-semibold mb-2">How people can use this field</div>
                          <div className="form-builder-choice-row">
                            {[
                              ["edit","Editable",field.editable!==false&&!field.readOnly],
                              ["readonly","Read only",field.readOnly||field.editable===false],
                              ["hidden","Hidden",field.visible===false]
                            ].map(([mode,label,active])=>(
                              <button type="button" key={mode} className={`form-builder-choice ${active?"active":""}`} onClick={()=>{
                                if(mode==="edit")update(field.key,{editable:true,readOnly:false,visible:true});
                                if(mode==="readonly")update(field.key,{editable:false,readOnly:true,visible:true});
                                if(mode==="hidden")update(field.key,{visible:false});
                              }}>
                                <strong>{label}</strong>
                                <span>{mode==="edit"?"Users can change the value":mode==="readonly"?"Value is visible but cannot be changed":"Field will not appear"}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {["select","multiselect"].includes(field.fieldType)&&(
                        <div className="col-12">
                          <label className="form-label">{field.fieldType==="multiselect"?"Choices people can select":"Choices shown in the dropdown"}</label>
                          <textarea
                            className="form-control"
                            rows={3}
                            value={(field.options||[]).map(option=>typeof option==="object"?option.label:option).join("\n")}
                            onChange={event=>update(field.key,{
                              options:event.target.value.split(/\r?\n|,/).map(value=>value.trim()).filter(Boolean).map(value=>({value,label:value}))
                            })}
                            placeholder="One choice per line"
                          />
                        </div>
                      )}

                      <div className="col-12">
                        <button type="button" className="form-builder-advanced-toggle" onClick={()=>setShowAdvanced(value=>!value)}>
                          <span><i className={`bi ${showAdvanced?"bi-chevron-up":"bi-sliders2"} me-2`}></i>More options for this field</span>
                          <small>{showAdvanced?"Hide advanced settings":"Connections, automatic filling, calculations, rules and validation"}</small>
                        </button>
                      </div>

                      <div className="col-12" style={{display:showAdvanced?"":"none"}} data-advanced-option>
                        <div className="form-builder-panel">
                          <div className="d-flex justify-content-between gap-3 mb-2">
                            <div>
                              <div className="fw-semibold">Where should the choices come from?</div>
                              <div className="small text-secondary">Choose an existing record so you do not have to maintain a second list.</div>
                            </div>
                          </div>
                          <div className="row g-2">
                            <div className="col-md-4">
                              <label className="form-label">Choose from</label>
                              <select className="form-select" value={field.dataSource?.resource||"none"} disabled={field.system} onChange={event=>{
                                const resource=event.target.value;
                                const fields=sourceFields(sourceCatalog,resource);
                                const idField=fields.find(item=>item[0]==="_id")||fields[0]||["_id","Record"];
                                const displayField=fields.find(item=>item[0]!=="_id")||idField;
                                update(field.key,{
                                  fieldType:resource==="none"
                                    ?field.fieldType
                                    :(["reference","select","multiselect"].includes(field.fieldType)?field.fieldType:"reference"),
                                  dataSource:{
                                    type:resource==="none"?"none":"lookup",
                                    resource,
                                    valueField:idField[0]||"_id",
                                    labelField:displayField[0]||idField[0],
                                    searchField:displayField[0]||idField[0],
                                    multiple:resource!=="none"&&field.fieldType==="multiselect",
                                    autoFill:[]
                                  }
                                });
                              }}>
                                {sourceCatalog.map(source=><option key={source.value} value={source.value}>{source.label}</option>)}
                              </select>
                            </div>
                            {field.dataSource?.resource&&field.dataSource.resource!=="none"&&(
                              <>
                                <div className="col-md-4">
                                  <label className="form-label">What should be shown?</label>
                                  <select className="form-select" value={field.dataSource?.labelField||""} onChange={event=>update(field.key,{dataSource:{...(field.dataSource||{}),type:"lookup",labelField:event.target.value}})}>
                                    {sourceFields(sourceCatalog,field.dataSource.resource).map(([value,label])=><option key={value} value={value}>{label}</option>)}
                                  </select>
                                </div>
                                <div className="col-md-4">
                                  <label className="form-label">What should be saved?</label>
                                  <select className="form-select" value={field.dataSource?.valueField||"_id"} onChange={event=>update(field.key,{dataSource:{...(field.dataSource||{}),type:"lookup",valueField:event.target.value}})}>
                                    {sourceFields(sourceCatalog,field.dataSource.resource).map(([value,label])=><option key={value} value={value}>{label}</option>)}
                                  </select>
                                </div>
                              </>
                            )}
                            {field.dataSource?.resource&&field.dataSource.resource!=="none"&&field.fieldType==="multiselect"&&(
                              <div className="col-12">
                                <div className="form-check form-switch">
                                  <input className="form-check-input" type="checkbox" checked={Boolean(field.dataSource?.multiple)} onChange={event=>update(field.key,{dataSource:{...(field.dataSource||{}),multiple:event.target.checked}})}/>
                                  <label className="form-check-label">Allow selecting more than one record</label>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {field.dataSource?.resource&&field.dataSource.resource!=="none"&&(
                        <div className="col-12" style={{display:showAdvanced?"":"none"}} data-advanced-option>
                          <div className="form-builder-panel">
                            <div className="fw-semibold mb-2">When someone chooses a record, fill these fields too</div>
                            {(field.dataSource?.autoFill||[]).map((mapping,mappingIndex)=>(
                              <div className="row g-2 align-items-end mb-2" key={mappingIndex}>
                                <div className="col-md-6">
                                  <label className="form-label">Fill this field</label>
                                  <select className="form-select" value={mapping.targetKey} onChange={event=>{
                                    const autoFill=[...(field.dataSource?.autoFill||[])];autoFill[mappingIndex]={...mapping,targetKey:event.target.value};
                                    update(field.key,{dataSource:{...(field.dataSource||{}),autoFill}});
                                  }}>
                                    <option value="">Choose field</option>
                                    {draft.filter(item=>item.key!==field.key).map(item=><option key={item.key} value={item.key}>{item.label}</option>)}
                                  </select>
                                </div>
                                <div className="col-md-5">
                                  <label className="form-label">Use value from selected record</label>
                                  <select className="form-select" value={mapping.sourceKey} onChange={event=>{
                                    const autoFill=[...(field.dataSource?.autoFill||[])];autoFill[mappingIndex]={...mapping,sourceKey:event.target.value};
                                    update(field.key,{dataSource:{...(field.dataSource||{}),autoFill}});
                                  }}>
                                    <option value="">Choose value</option>
                                    {sourceFields(sourceCatalog,field.dataSource.resource).map(([value,label])=><option key={value} value={value}>{label}</option>)}
                                  </select>
                                </div>
                                <div className="col-md-1">
                                  <button type="button" className="btn btn-outline-danger w-100" title="Remove mapping" onClick={()=>{
                                    const autoFill=(field.dataSource?.autoFill||[]).filter((_,index)=>index!==mappingIndex);
                                    update(field.key,{dataSource:{...(field.dataSource||{}),autoFill}});
                                  }}><i className="bi bi-trash"></i></button>
                                </div>
                              </div>
                            ))}
                            <button type="button" className="btn btn-sm btn-light border" onClick={()=>{
                              const autoFill=[...(field.dataSource?.autoFill||[]),{targetKey:"",sourceKey:""}];
                              update(field.key,{dataSource:{...(field.dataSource||{}),autoFill}});
                            }}><i className="bi bi-plus-lg me-1"></i>Add auto-fill</button>
                          </div>
                        </div>
                      )}

                      {(field.fieldType==="number"||field.fieldType==="currency")&&(
                        <div className="col-12" style={{display:showAdvanced?"":"none"}} data-advanced-option>
                          <div className="form-builder-calculation">
                            <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                              <div>
                                <label className="form-label mb-1">Calculate automatically</label>
                                <div className="small text-secondary">Build the calculation by clicking fields and operators. You never need to type a formula.</div>
                              </div>
                              <button type="button" className="btn btn-sm btn-light border" onClick={()=>update(field.key,{formula:"",readOnly:false,editable:true})} disabled={!field.formula}>Clear</button>
                            </div>

                            <div className="border rounded bg-light p-2 mb-3 min-vh-5">
                              {field.formula
                                ?<div className="d-flex flex-wrap gap-2 align-items-center">{formulaDisplayTokens(field).map((token,index)=><span className="badge bg-white text-dark border" key={index}>{token}</span>)}</div>
                                :<span className="text-secondary small">Nothing added yet. Start with a field.</span>}
                            </div>

                            <div className="small fw-semibold mb-2">Use a number from the form</div>
                            <div className="form-builder-calculator-row">
                              {numericFields.filter(item=>item.key!==field.key).map(item=>(
                                <button type="button" key={item.key} className="btn btn-sm btn-light border" onClick={()=>addFormulaToken(field.key,item.key)}>{item.label}</button>
                              ))}
                            </div>

                            <div className="small fw-semibold mt-3 mb-2">Operators</div>
                            <div className="form-builder-calculator-row">
                              {[["","+"] ,["-","−"],["*","×"],["/","÷"],["(","("],[")",")"]].map(([value,label])=>(
                                <button type="button" key={value+label} className="btn btn-sm btn-outline-secondary" onClick={()=>addFormulaToken(field.key,value)}>{label}</button>
                              ))}
                            </div>

                            <div className="small fw-semibold mt-3 mb-2">Add a fixed number</div>
                            <div className="input-group input-group-sm" style={{maxWidth:260}}>
                              <input className="form-control" type="number" placeholder="Example: 100" id={`calc-constant-${field.key}`}/>
                              <button type="button" className="btn btn-outline-secondary" onClick={()=>{
                                const input=document.getElementById(`calc-constant-${field.key}`);
                                if(input?.value&&Number.isFinite(Number(input.value)))addFormulaToken(field.key,input.value);
                                if(input)input.value="";
                              }}>Add</button>
                            </div>

                            {field.formula&&validateFormula(field)&&<div className="alert alert-warning py-2 mt-3 mb-0">{validateFormula(field)}</div>}
                            <div className="form-text">Automatic calculations are always read only.</div>
                          </div>
                        </div>
                      )}

                      <div className="col-12" style={{display:showAdvanced?"":"none"}} data-advanced-option>
                        <details className="form-builder-panel">
                          <summary className="fw-semibold">Validation</summary>
                          <div className="row g-3 mt-1">
                            {(field.fieldType==="number"||field.fieldType==="currency")&&(
                              <>
                                <div className="col-md-3"><label className="form-label">Minimum</label><input className="form-control" type="number" value={field.validation?.min??""} onChange={event=>update(field.key,{validation:{...(field.validation||{}),min:event.target.value===""?null:Number(event.target.value)}})} placeholder="No minimum"/></div>
                                <div className="col-md-3"><label className="form-label">Maximum</label><input className="form-control" type="number" value={field.validation?.max??""} onChange={event=>update(field.key,{validation:{...(field.validation||{}),max:event.target.value===""?null:Number(event.target.value)}})} placeholder="No maximum"/></div>
                              </>
                            )}
                            {["text","textarea","email","phone","url"].includes(field.fieldType)&&(
                              <div className="col-12"><label className="form-label">Pattern <span className="text-secondary">(advanced)</span></label><input className="form-control" value={field.validation?.pattern||""} onChange={event=>update(field.key,{validation:{...(field.validation||{}),pattern:event.target.value}})} placeholder="Optional regular-expression pattern"/></div>
                            )}
                            {!["number","currency","text","textarea","email","phone","url"].includes(field.fieldType)&&<div className="small text-secondary">No extra validation is needed for this field type.</div>}
                          </div>
                        </details>
                      </div>

                      <div className="col-12" style={{display:showAdvanced?"":"none"}} data-advanced-option>
                        <div className="form-builder-panel">
                          <div className="fw-semibold mb-2">Rules</div>
                          <div className="small text-secondary mb-2">Make a field appear, become required, or become read only based on another answer.</div>
                          {(field.conditions||[]).map((condition,conditionIndex)=>(
                            <div className="row g-2 align-items-end mb-2" key={conditionIndex}>
                              <div className="col-md-3">
                                <label className="form-label">Action</label>
                                <select className="form-select" value={condition.action} onChange={event=>{
                                  const conditions=[...(field.conditions||[])];conditions[conditionIndex]={...condition,action:event.target.value};update(field.key,{conditions});
                                }}>
                                  <option value="show">Show</option><option value="hide">Hide</option><option value="require">Require</option><option value="readonly">Read only</option><option value="enable">Enable</option><option value="disable">Disable</option>
                                </select>
                              </div>
                              <div className="col-md-3">
                                <label className="form-label">When field</label>
                                <select className="form-select" value={condition.fieldKey} onChange={event=>{
                                  const conditions=[...(field.conditions||[])];conditions[conditionIndex]={...condition,fieldKey:event.target.value};update(field.key,{conditions});
                                }}>
                                  <option value="">Choose field</option>
                                  {draft.filter(item=>item.key!==field.key).map(item=><option key={item.key} value={item.key}>{item.label}</option>)}
                                </select>
                              </div>
                              <div className="col-md-3">
                                <label className="form-label">Condition</label>
                                <select className="form-select" value={condition.operator} onChange={event=>{
                                  const conditions=[...(field.conditions||[])];conditions[conditionIndex]={...condition,operator:event.target.value};update(field.key,{conditions});
                                }}>
                                  {CONDITION_OPERATORS.map(operator=><option key={operator.value} value={operator.value}>{operator.label}</option>)}
                                </select>
                              </div>
                              <div className="col-md-2">
                                <label className="form-label">Value</label>
                                <input className="form-control" value={condition.value||""} onChange={event=>{
                                  const conditions=[...(field.conditions||[])];conditions[conditionIndex]={...condition,value:event.target.value};update(field.key,{conditions});
                                }} disabled={["empty","not_empty"].includes(condition.operator)}/>
                              </div>
                              <div className="col-md-1">
                                <button type="button" className="btn btn-outline-danger w-100" title="Remove rule" onClick={()=>{
                                  const conditions=(field.conditions||[]).filter((_,index)=>index!==conditionIndex);update(field.key,{conditions});
                                }}><i className="bi bi-trash"></i></button>
                              </div>
                            </div>
                          ))}
                          <button type="button" className="btn btn-sm btn-light border" onClick={()=>{
                            const conditions=[...(field.conditions||[]),{action:"show",fieldKey:"",operator:"equals",value:""}];update(field.key,{conditions});
                          }}><i className="bi bi-plus-lg me-1"></i>Add rule</button>
                        </div>
                      </div>

                      <div className="col-12 d-flex flex-wrap gap-3 align-items-center">
                        <div className="form-check form-switch">
                          <input className="form-check-input" type="checkbox" checked={Boolean(field.required)} disabled={field.locked} onChange={event=>update(field.key,{required:event.target.checked})}/>
                          <label className="form-check-label">Required</label>
                        </div>
                        {field.custom&&<button type="button" className="btn btn-sm btn-outline-danger" onClick={()=>removeCustomField(field.key)}><i className="bi bi-trash me-1"></i>Remove field</button>}
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
