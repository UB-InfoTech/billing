import React,{useEffect,useMemo,useState} from "react";
import axios from "axios";

const apiBase=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const authConfig=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});
const FIELD_TYPES=[
  {value:"text",label:"Text",icon:"bi-fonts",help:"Short text or names"},
  {value:"textarea",label:"Long Text",icon:"bi-text-paragraph",help:"Notes or longer descriptions"},
  {value:"number",label:"Number",icon:"bi-123",help:"Numeric values"},
  {value:"currency",label:"Currency",icon:"bi-currency-rupee",help:"Money values shown as ₹"},
  {value:"date",label:"Date",icon:"bi-calendar3",help:"Calendar date"},
  {value:"datetime",label:"Date & Time",icon:"bi-calendar2-week",help:"Date with time"},
  {value:"boolean",label:"Yes / No",icon:"bi-toggle-on",help:"Simple true/false value"},
  {value:"select",label:"Dropdown",icon:"bi-menu-button-wide",help:"Choose one option"},
];

const getValue=(row,path)=>{
  if(row==null||!path)return "";
  return String(path).split(".").reduce((value,key)=>value==null?"":value[key],row)??"";
};

const displayValue=value=>{
  if(value==null)return "";
  if(typeof value==="object"){
    if(Array.isArray(value))return value.join(", ");
    return Object.values(value).join(", ");
  }
  return String(value);
};

const cloneColumns=columns=>columns.map((column,index)=>({
  key:String(column.key),
  label:column.label||String(column.key),
  visible:column.visible!==false,
  locked:Boolean(column.locked),
  kind:["merged","custom"].includes(column.kind)?column.kind:"field",
  fieldType:FIELD_TYPES.some(type=>type.value===column.fieldType)?column.fieldType:"text",
  options:Array.isArray(column.options)?column.options.slice():[],
  defaultValue:column.defaultValue??"",
  sourceKeys:Array.isArray(column.sourceKeys)?column.sourceKeys.slice():[],
  separator:column.separator??" ",
  order:Number.isFinite(Number(column.order))?Number(column.order):index,
}));

const mergeSavedColumns=(baseColumns,savedColumns)=>{
  const base=cloneColumns(baseColumns);
  const saved=Array.isArray(savedColumns)?savedColumns:[];
  const savedByKey=new Map(saved.map(column=>[column.key,column]));

  const merged=base.map((column,index)=>{
    const savedColumn=savedByKey.get(column.key);
    if(!savedColumn)return {...column,order:index};
    return{
      ...column,
      label:savedColumn.label||column.label,
      visible:column.locked?true:savedColumn.visible!==false,
      order:Number.isFinite(Number(savedColumn.order))?Number(savedColumn.order):index,
      separator:savedColumn.separator??column.separator,
    };
  });

  saved.forEach(column=>{
    if(merged.some(item=>item.key===column.key))return;
    if(!["merged","custom"].includes(column.kind))return;

    const availableSources=new Set(base.map(item=>item.key));
    const sourceKeys=(Array.isArray(column.sourceKeys)?column.sourceKeys:[]).filter(sourceKey=>availableSources.has(sourceKey));

    if(column.kind==="merged"&&sourceKeys.length<2)return;
    if(column.kind==="custom"){
      merged.push({
        key:column.key,
        label:column.label||column.key,
        visible:column.visible!==false,
        locked:false,
        kind:"custom",
        fieldType:FIELD_TYPES.some(type=>type.value===column.fieldType)?column.fieldType:"text",
        options:Array.isArray(column.options)?column.options:[],
        defaultValue:column.defaultValue??"",
        sourceKeys:[],
        separator:" ",
        order:Number.isFinite(Number(column.order))?Number(column.order):merged.length,
      });
      return;
    }

    merged.push({
      key:column.key,
      label:column.label||column.key,
      visible:column.visible!==false,
      locked:false,
      kind:"merged",
      fieldType:"text",
      options:[],
      defaultValue:"",
      sourceKeys,
      separator:column.separator??" ",
      order:Number.isFinite(Number(column.order))?Number(column.order):merged.length,
    });
  });

  const normalized=merged
    .sort((a,b)=>(a.order??0)-(b.order??0))
    .map((column,index)=>({...column,order:index}));

  if(normalized.length&&!normalized.some(column=>column.visible!==false)){
    normalized[0]={...normalized[0],visible:true};
  }

  return normalized;
};

const fieldTypeLabel=type=>FIELD_TYPES.find(item=>item.value===type)?.label||"Text";

function ColumnRow({column,index,total,onToggle,onUp,onDown,onRemove}){
  return(
    <div className={`dynamic-column-row ${column.visible!==false?"is-visible":"is-hidden"}`}>
      <div className="dynamic-column-main">
        <span className="dynamic-column-grip"><i className="bi bi-grip-vertical"></i></span>
        <div className={`dynamic-column-icon ${column.kind==="custom"?"custom":column.kind==="merged"?"merged":"default"}`}>
          <i className={`bi ${column.kind==="custom" ? (FIELD_TYPES.find(type=>type.value===column.fieldType)?.icon||"bi-input-cursor-text") : column.kind==="merged" ? "bi-link-45deg" : "bi-layout-three-columns"}`}></i>
        </div>
        <div className="min-w-0 flex-grow-1">
          <div className="fw-semibold text-truncate">{column.label}</div>
          <div className="small text-secondary text-truncate">
            {column.kind==="custom" ? `Custom • ${fieldTypeLabel(column.fieldType)}` : column.kind==="merged" ? `Merged • ${column.sourceKeys.length} fields` : column.locked ? "Required system field" : column.key}
          </div>
        </div>
      </div>

      <div className="d-flex align-items-center gap-1">
        <button type="button" className="btn btn-light btn-sm dynamic-icon-btn" disabled={index===0} onClick={onUp} title="Move up">
          <i className="bi bi-chevron-up"></i>
        </button>
        <button type="button" className="btn btn-light btn-sm dynamic-icon-btn" disabled={index===total-1} onClick={onDown} title="Move down">
          <i className="bi bi-chevron-down"></i>
        </button>
        <button type="button" className={`btn btn-sm dynamic-icon-btn ${column.visible!==false?"btn-primary":"btn-outline-secondary"}`} disabled={column.locked} onClick={onToggle} title={column.visible!==false?"Hide column":"Show column"}>
          <i className={`bi ${column.visible!==false?"bi-eye":"bi-eye-slash"}`}></i>
        </button>
        {column.kind==="custom"&&(
          <button type="button" className="btn btn-outline-danger btn-sm dynamic-icon-btn" onClick={onRemove} title="Remove custom field">
            <i className="bi bi-trash"></i>
          </button>
        )}
        {column.locked&&<span className="badge text-bg-light border ms-1"><i className="bi bi-lock-fill me-1"></i>Required</span>}
      </div>
    </div>
  );
}

export default function DynamicTable({
  tableKey,
  rows=[],
  columns=[],
  getRowKey=(row,index)=>row?._id||index,
  className="table table-striped table-hover align-middle mb-0",
  wrapperClassName="table-responsive",
  emptyText="No records found.",
  loading=false,
  rowClassName,
  onSort,
  selectable,
  selectedIds=[],
  onToggleRow,
  onToggleAll,
  renderCell,
  actionColumn,
  footer,
}){
  const [savedConfig,setSavedConfig]=useState(null);
  const [draft,setDraft]=useState(()=>cloneColumns(columns));
  const [customValues,setCustomValues]=useState({});
  const [loadingConfig,setLoadingConfig]=useState(true);
  const [loadingValues,setLoadingValues]=useState(false);
  const [saving,setSaving]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const [activeTab,setActiveTab]=useState("columns");
  const [searchTerm,setSearchTerm]=useState("");
  const [editingCell,setEditingCell]=useState(null);
  const [editingValue,setEditingValue]=useState("");
  const [error,setError]=useState("");

  const [customForm,setCustomForm]=useState({
    label:"",
    fieldType:"text",
    defaultValue:"",
    optionsText:"",
  });

  const [mergeForm,setMergeForm]=useState({
    label:"",
    sources:[],
    separator:" - ",
  });

  const baseColumnSignature=useMemo(
    ()=>JSON.stringify(columns.map(column=>({key:column.key,label:column.label,locked:column.locked,kind:column.kind}))),
    [columns]
  );

  const customColumns=useMemo(()=>draft.filter(column=>column.kind==="custom"),[draft]);
  const mergeSources=useMemo(()=>draft.filter(column=>column.kind!=="merged"),[draft]);
  const rowKeyList=useMemo(
    ()=>rows.map((row,index)=>String(getRowKey(row,index))).filter(Boolean),
    [rows,getRowKey]
  );
  const rowKeySignature=useMemo(()=>rowKeyList.join("|"),[rowKeyList]);
  const customFieldSignature=useMemo(
    ()=>JSON.stringify(customColumns.map(column=>({key:column.key,fieldType:column.fieldType,options:column.options,defaultValue:column.defaultValue}))),
    [customColumns]
  );
  const visibleColumns=useMemo(()=>draft.filter(column=>column.visible!==false),[draft]);
  const filteredDraft=useMemo(()=>{
    const query=searchTerm.trim().toLowerCase();
    if(!query)return draft;
    return draft.filter(column=>column.label.toLowerCase().includes(query)||column.key.toLowerCase().includes(query));
  },[draft,searchTerm]);

  const resetCustomForm=()=>setCustomForm({label:"",fieldType:"text",defaultValue:"",optionsText:""});

  useEffect(()=>{
    let cancelled=false;
    const load=async()=>{
      try{
        setLoadingConfig(true);
        setError("");
        const response=await axios.get(
          `${apiBase}/api/table-config/${encodeURIComponent(tableKey)}`,
          authConfig()
        );
        if(cancelled)return;
        setSavedConfig(response.data);
        setDraft(mergeSavedColumns(columns,response.data?.columns));
      }catch(loadError){
        if(!cancelled){
          setDraft(cloneColumns(columns));
          setError(loadError.response?.data?.message||"Unable to load table settings.");
        }
      }finally{
        if(!cancelled)setLoadingConfig(false);
      }
    };
    load();
    return()=>{cancelled=true;};
  },[tableKey,baseColumnSignature]);

  useEffect(()=>{
    if(loadingConfig)return;
    const rowKeys=rowKeyList;
    if(!customColumns.length||!rowKeys.length){
      setCustomValues({});
      return;
    }

    let cancelled=false;
    const loadValues=async()=>{
      try{
        setLoadingValues(true);
        const response=await axios.get(
          `${apiBase}/api/table-config/${encodeURIComponent(tableKey)}/values`,
          {...authConfig(),params:{rowKeys:rowKeys.join(",")}}
        );
        if(cancelled)return;
        const next={};
        (response.data?.values||[]).forEach(item=>{
          next[`${item.rowKey}::${item.fieldKey}`]=item.value;
        });
        setCustomValues(next);
      }catch(loadError){
        if(!cancelled)setError(loadError.response?.data?.message||"Unable to load custom field values.");
      }finally{
        if(!cancelled)setLoadingValues(false);
      }
    };

    loadValues();
    return()=>{cancelled=true;};
  },[tableKey,loadingConfig,rowKeySignature,customFieldSignature]);

  const findColumn=key=>draft.find(column=>column.key===key);
  const findBaseColumn=key=>columns.find(column=>column.key===key);
  const customValueKey=(rowKey,fieldKey)=>`${String(rowKey)}::${fieldKey}`;

  const resolvedValue=(sourceKey,row,rowIndex)=>{
    const column=findColumn(sourceKey);
    if(column?.kind==="custom"){
      const key=customValueKey(getRowKey(row,rowIndex),sourceKey);
      return Object.prototype.hasOwnProperty.call(customValues,key)
        ? customValues[key]
        : column.defaultValue??"";
    }
    return getValue(row,sourceKey);
  };

  const formatCustomValue=(column,value)=>{
    if(value===null||value===undefined||value==="")return "—";
    if(column.fieldType==="currency")return `₹${Number(value||0).toFixed(2)}`;
    if(column.fieldType==="number")return Number(value||0).toLocaleString("en-IN",{maximumFractionDigits:2});
    if(column.fieldType==="boolean")return value===true||value==="true"?"Yes":"No";
    if(column.fieldType==="date"){
      const date=new Date(value);
      return Number.isNaN(date.getTime())?String(value):date.toLocaleDateString("en-IN");
    }
    if(column.fieldType==="datetime"){
      const date=new Date(value);
      return Number.isNaN(date.getTime())?String(value):date.toLocaleString("en-IN");
    }
    return String(value);
  };

  const saveCustomValue=async(rowKey,fieldKey,value)=>{
    const stateKey=customValueKey(rowKey,fieldKey);
    const previous=customValues[stateKey];
    setCustomValues(prev=>({...prev,[stateKey]:value}));
    setEditingCell(null);
    try{
      setError("");
      await axios.put(
        `${apiBase}/api/table-config/${encodeURIComponent(tableKey)}/values`,
        {rowKey:String(rowKey),fieldKey,value},
        authConfig()
      );
    }catch(saveError){
      setCustomValues(prev=>{
        const next={...prev};
        if(previous===undefined)delete next[stateKey];
        else next[stateKey]=previous;
        return next;
      });
      setError(saveError.response?.data?.message||"Unable to save custom field value.");
    }
  };

  const startEdit=(rowKey,column,value)=>{
    if(loadingValues)return;
    setEditingCell(customValueKey(rowKey,column.key));
    setEditingValue(value??"");
  };

  const commitEditing=(rowKey,column)=>{
    if(editingCell!==customValueKey(rowKey,column.key))return;
    saveCustomValue(rowKey,column.key,editingValue);
  };

  const renderCustomEditor=(rowKey,column)=>{
    const commit=()=>commitEditing(rowKey,column);
    const common={
      className:"form-control form-control-sm",
      autoFocus:true,
      value:editingValue,
      onChange:event=>setEditingValue(event.target.value),
      onBlur:commit,
      onKeyDown:event=>{
        if(event.key==="Enter"&&column.fieldType!=="textarea"){
          event.preventDefault();
          commit();
        }
        if(event.key==="Escape")setEditingCell(null);
      },
    };

    if(column.fieldType==="textarea")return <textarea {...common} rows={2}/>;
    if(column.fieldType==="select"){
      return(
        <select {...common} onChange={event=>saveCustomValue(rowKey,column.key,event.target.value)}>
          <option value="">Select...</option>
          {column.options.map(option=><option key={option} value={option}>{option}</option>)}
        </select>
      );
    }
    if(column.fieldType==="boolean"){
      return(
        <div className="form-check form-switch mb-0">
          <input
            className="form-check-input"
            type="checkbox"
            autoFocus
            checked={editingValue===true||editingValue==="true"}
            onChange={event=>saveCustomValue(rowKey,column.key,event.target.checked)}
          />
        </div>
      );
    }
    if(column.fieldType==="number"||column.fieldType==="currency")return <input {...common} type="number" step={column.fieldType==="currency"?"0.01":"any"}/>;
    if(column.fieldType==="date"||column.fieldType==="datetime"){
      return <input {...common} type={column.fieldType==="date"?"date":"datetime-local"}/>;
    }
    return <input {...common} type="text"/>;
  };

  const renderCustomCell=(column,row,rowIndex)=>{
    const rowKey=String(getRowKey(row,rowIndex));
    const stateKey=customValueKey(rowKey,column.key);
    const value=Object.prototype.hasOwnProperty.call(customValues,stateKey)
      ? customValues[stateKey]
      : column.defaultValue??"";

    if(editingCell===stateKey){
      return <div className="dynamic-custom-editor">{renderCustomEditor(rowKey,column)}</div>;
    }

    return(
      <button
        type="button"
        className="dynamic-custom-cell"
        onClick={()=>startEdit(rowKey,column,value)}
        title="Click to edit"
      >
        <span className={value===null||value===undefined||value===""?"text-muted":""}>
          {formatCustomValue(column,value)}
        </span>
        <i className="bi bi-pencil-square ms-2 opacity-0 dynamic-custom-edit-icon"></i>
      </button>
    );
  };

  const cellText=(column,row,rowIndex)=>{
    if(column.kind==="custom")return renderCustomCell(column,row,rowIndex);

    if(column.kind==="merged"){
      return column.sourceKeys
        .map(sourceKey=>{
          const value=displayValue(resolvedValue(sourceKey,row,rowIndex));
          const sourceColumn=findBaseColumn(sourceKey);
          if(sourceColumn?.format)return sourceColumn.format(value,row,rowIndex);
          return value;
        })
        .filter(Boolean)
        .join(column.separator??" ");
    }

    const baseColumn=findBaseColumn(column.key);
    if(renderCell)return renderCell(column,row,rowIndex);
    if(baseColumn?.render)return baseColumn.render(row,rowIndex);

    const raw=getValue(row,column.key);
    return baseColumn?.format?baseColumn.format(raw,row,rowIndex):displayValue(raw);
  };

  const moveColumn=(index,direction)=>{
    setDraft(prev=>{
      const next=prev.slice();
      const target=index+direction;
      if(target<0||target>=next.length)return prev;
      [next[index],next[target]]=[next[target],next[index]];
      return next.map((column,i)=>({...column,order:i}));
    });
  };

  const toggleColumn=(index)=>{
    setDraft(prev=>{
      const target=prev[index];
      if(!target||target.locked)return prev;
      const visibleCount=prev.filter(column=>column.visible!==false).length;
      if(target.visible!==false&&visibleCount<=1)return prev;
      return prev.map((column,i)=>i===index?{...column,visible:!column.visible}:column);
    });
  };

  const showAll=()=>setDraft(prev=>prev.map(column=>({...column,visible:true})));
  const hideOptional=()=>setDraft(prev=>{
    const next=prev.map(column=>column.locked?{...column,visible:true}:{...column,visible:false});
    const first=next.findIndex(column=>column.visible);
    if(first===-1&&next.length)next[0]={...next[0],visible:true};
    return next;
  });

  const addCustomField=()=>{
    const label=customForm.label.trim();
    const options=customForm.optionsText.split(/\r?\n|,/).map(item=>item.trim()).filter(Boolean);
    if(!label){
      setError("Enter a field name.");
      return;
    }
    if(customForm.fieldType==="select"&&options.length===0){
      setError("Add at least one dropdown option.");
      return;
    }

    const slug=label.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"").slice(0,50)||"field";
    const key=`custom_${slug}_${Date.now()}`;
    const defaultValue=customForm.fieldType==="boolean"
      ? customForm.defaultValue==="true"
      : customForm.defaultValue;

    setDraft(prev=>[...prev,{
      key,
      label,
      visible:true,
      locked:false,
      kind:"custom",
      fieldType:customForm.fieldType,
      options:customForm.fieldType==="select"?options:[],
      defaultValue,
      sourceKeys:[],
      separator:" ",
      order:prev.length
    }].map((column,index)=>({...column,order:index})));

    setError("");
    resetCustomForm();
    setActiveTab("columns");
    setSearchTerm("");
  };

  const addMergedColumn=()=>{
    const label=mergeForm.label.trim();
    const sources=[...new Set(mergeForm.sources.filter(Boolean))];
    if(!label||sources.length<2)return;

    const key=`merged_${Date.now()}`;
    setDraft(prev=>[...prev,{
      key,
      label,
      visible:true,
      locked:false,
      kind:"merged",
      fieldType:"text",
      options:[],
      defaultValue:"",
      sourceKeys:sources,
      separator:mergeForm.separator,
      order:prev.length
    }].map((column,index)=>({...column,order:index})));

    setMergeForm({label:"",sources:[],separator:" - "});
  };

  const removeColumn=index=>{
    setDraft(prev=>{
      const removed=prev[index];
      if(!removed)return prev;

      return prev
        .filter((column,i)=>i!==index)
        .map(column=>{
          if(column.kind!=="merged")return column;
          const sourceKeys=column.sourceKeys.filter(sourceKey=>sourceKey!==removed.key);
          return {...column,sourceKeys};
        })
        .filter(column=>column.kind!=="merged"||column.sourceKeys.length>=2)
        .map((column,i)=>({...column,order:i}));
    });
  };

  const saveSettings=async()=>{
    try{
      setSaving(true);
      setError("");

      const payload={columns:draft.map((column,index)=>({
        ...column,
        order:index
      }))};

      const response=await axios.put(
        `${apiBase}/api/table-config/${encodeURIComponent(tableKey)}`,
        payload,
        authConfig()
      );

      setSavedConfig(response.data);
      setDraft(mergeSavedColumns(columns,response.data?.columns));
      setShowSettings(false);
    }catch(saveError){
      setError(saveError.response?.data?.message||"Unable to save table settings.");
    }finally{
      setSaving(false);
    }
  };

  const resetSettings=async()=>{
    try{
      setSaving(true);
      await axios.delete(`${apiBase}/api/table-config/${encodeURIComponent(tableKey)}`,authConfig());
      setSavedConfig(null);
      setDraft(cloneColumns(columns));
      setCustomValues({});
      setError("");
      setShowSettings(false);
    }catch(resetError){
      setError(resetError.response?.data?.message||"Unable to reset table settings.");
    }finally{
      setSaving(false);
    }
  };

  const openSettings=()=>{
    setActiveTab("columns");
    setSearchTerm("");
    setError("");
    setShowSettings(true);
  };

  const visibleSelectedCount=rows.filter(row=>selectedIds.includes(String(getRowKey(row)))).length;
  const allSelected=rows.length>0&&visibleSelectedCount===rows.length;

  return(
    <>
      <div className="d-flex justify-content-end mb-2">
        <button
          type="button"
          className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-2"
          onClick={openSettings}
          disabled={loadingConfig}
        >
          <i className="bi bi-sliders2"></i>
          Customize Table
        </button>
      </div>

      {error&&<div className="alert alert-warning py-2">{error}</div>}

      <div className={wrapperClassName}>
        <table className={className}>
          <thead className="table-light">
            <tr>
              {selectable&&(
                <th style={{width:50}}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={onToggleAll}
                    disabled={!rows.length}
                    aria-label="Select all rows"
                  />
                </th>
              )}
              {visibleColumns.map(column=>(
                <th key={column.key} onClick={()=>onSort?.(column.key)}>
                  {column.label}
                </th>
              ))}
              {actionColumn&&<th className="text-end">{actionColumn.label||"Actions"}</th>}
            </tr>
          </thead>
          <tbody>
            {loading?(
              <tr>
                <td colSpan={(selectable?1:0)+visibleColumns.length+(actionColumn?1:0)} className="text-center py-5">
                  <span className="spinner-border spinner-border-sm me-2"/>Loading...
                </td>
              </tr>
            ):rows.length===0?(
              <tr>
                <td colSpan={(selectable?1:0)+visibleColumns.length+(actionColumn?1:0)} className="text-center py-5 text-muted">{emptyText}</td>
              </tr>
            ):(
              rows.map((row,index)=>(
                <tr key={getRowKey(row,index)} className={rowClassName?.(row,index)||""}>
                  {selectable&&(
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(String(getRowKey(row,index)))}
                        onChange={()=>onToggleRow?.(String(getRowKey(row,index)))}
                        aria-label="Select row"
                      />
                    </td>
                  )}
                  {visibleColumns.map(column=>(
                    <td key={column.key}>{cellText(column,row,index)}</td>
                  ))}
                  {actionColumn&&<td className="text-end">{actionColumn.render(row,index)}</td>}
                </tr>
              ))
            )}
          </tbody>
          {footer&&(
            <tfoot>
              {footer({
                visibleColumns,
                visibleColumnCount:visibleColumns.length+(selectable?1:0)+(actionColumn?1:0),
                hasSelection:Boolean(selectable),
                hasActions:Boolean(actionColumn)
              })}
            </tfoot>
          )}
        </table>
      </div>

      {showSettings&&(
        <div className="dynamic-settings-backdrop" role="dialog" aria-modal="true">
          <div className="dynamic-settings-modal">
            <div className="dynamic-settings-header">
              <div>
                <div className="small text-uppercase opacity-75 fw-semibold">Table settings</div>
                <h5 className="mb-1">Customize Table</h5>
                <div className="small opacity-75">{tableKey}</div>
              </div>
              <button type="button" className="btn btn-light btn-sm rounded-circle" onClick={()=>setShowSettings(false)} aria-label="Close">
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            <div className="dynamic-settings-tabs">
              <button type="button" className={`dynamic-settings-tab ${activeTab==="columns"?"active":""}`} onClick={()=>setActiveTab("columns")}>
                <i className="bi bi-layout-three-columns me-2"></i>
                Columns
                <span className="badge rounded-pill text-bg-light ms-2">{draft.length}</span>
              </button>
              <button type="button" className={`dynamic-settings-tab ${activeTab==="custom"?"active":""}`} onClick={()=>setActiveTab("custom")}>
                <i className="bi bi-plus-circle me-2"></i>
                Add Custom Field
              </button>
            </div>

            <div className="dynamic-settings-body">
              {error&&<div className="alert alert-danger py-2">{error}</div>}

              {activeTab==="columns"&&(
                <>
                  <div className="dynamic-settings-summary">
                    <div>
                      <div className="fw-semibold">Choose what appears in this table</div>
                      <div className="small text-secondary">{visibleColumns.length} visible • {customColumns.length} custom field{customColumns.length===1?"":"s"}</div>
                    </div>
                    <div className="d-flex gap-2">
                      <button type="button" className="btn btn-light btn-sm" onClick={showAll}>Show all</button>
                      <button type="button" className="btn btn-light btn-sm" onClick={hideOptional}>Hide optional</button>
                    </div>
                  </div>

                  <div className="position-relative mb-3">
                    <i className="bi bi-search position-absolute top-50 translate-middle-y ms-3 text-secondary"></i>
                    <input
                      className="form-control ps-5"
                      value={searchTerm}
                      onChange={event=>setSearchTerm(event.target.value)}
                      placeholder="Search columns..."
                    />
                  </div>

                  <div className="dynamic-column-list">
                    {filteredDraft.length===0?(
                      <div className="text-center text-secondary py-5">No columns match your search.</div>
                    ):(
                      filteredDraft.map(column=>{
                        const index=draft.findIndex(item=>item.key===column.key);
                        return(
                          <ColumnRow
                            key={column.key}
                            column={column}
                            index={index}
                            total={draft.length}
                            onToggle={()=>toggleColumn(index)}
                            onUp={()=>moveColumn(index,-1)}
                            onDown={()=>moveColumn(index,1)}
                            onRemove={()=>removeColumn(index)}
                          />
                        );
                      })
                    )}
                  </div>

                  <div className="dynamic-builder-card mt-4">
                    <div className="d-flex align-items-start gap-3">
                      <div className="dynamic-builder-icon"><i className="bi bi-link-45deg"></i></div>
                      <div className="flex-grow-1">
                        <div className="fw-semibold">Create a merged column</div>
                        <div className="small text-secondary mb-3">Combine existing fields such as Company + City + State into one column.</div>
                        <div className="row g-2">
                          <div className="col-lg-4">
                            <input className="form-control form-control-sm" value={mergeForm.label} onChange={event=>setMergeForm(prev=>({...prev,label:event.target.value}))} placeholder="New column name"/>
                          </div>
                          <div className="col-lg-3">
                            <input className="form-control form-control-sm" value={mergeForm.separator} onChange={event=>setMergeForm(prev=>({...prev,separator:event.target.value}))} placeholder="Separator"/>
                          </div>
                          <div className="col-lg-5">
                            <select
                              multiple
                              className="form-select form-select-sm"
                              value={mergeForm.sources}
                              onChange={event=>setMergeForm(prev=>({...prev,sources:Array.from(event.target.selectedOptions).map(option=>option.value)}))}
                              size={4}
                            >
                              {mergeSources.map(column=><option key={column.key} value={column.key}>{column.label}{column.kind==="custom"?" • Custom":""}</option>)}
                            </select>
                          </div>
                          <div className="col-12 d-flex justify-content-between align-items-center">
                            <span className="small text-secondary">Select 2 or more fields with Ctrl/Cmd.</span>
                            <button type="button" className="btn btn-outline-primary btn-sm" onClick={addMergedColumn} disabled={mergeForm.sources.length<2||!mergeForm.label.trim()}>
                              <i className="bi bi-plus-lg me-1"></i>Add merged column
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {activeTab==="custom"&&(
                <div className="dynamic-custom-builder">
                  <div className="dynamic-builder-intro mb-4">
                    <div className="dynamic-builder-icon"><i className="bi bi-ui-checks-grid"></i></div>
                    <div>
                      <div className="fw-semibold">Add a field for this table</div>
                      <div className="small text-secondary">This field is saved for this table and can be filled directly inside the rows.</div>
                    </div>
                  </div>

                  <div className="row g-3">
                    <div className="col-md-7">
                      <label className="form-label fw-semibold">Field name</label>
                      <input className="form-control" value={customForm.label} onChange={event=>setCustomForm(prev=>({...prev,label:event.target.value}))} placeholder="Example: Sales Person"/>
                      <div className="form-text">Use a clear name that your team will understand.</div>
                    </div>
                    <div className="col-md-5">
                      <label className="form-label fw-semibold">Field type</label>
                      <select className="form-select" value={customForm.fieldType} onChange={event=>setCustomForm(prev=>({...prev,fieldType:event.target.value,defaultValue:"",optionsText:""}))}>
                        {FIELD_TYPES.map(type=><option key={type.value} value={type.value}>{type.label}</option>)}
                      </select>
                    </div>

                    <div className="col-12">
                      <div className="dynamic-field-type-grid">
                        {FIELD_TYPES.map(type=>(
                          <button
                            key={type.value}
                            type="button"
                            className={`dynamic-field-type-card ${customForm.fieldType===type.value?"active":""}`}
                            onClick={()=>setCustomForm(prev=>({...prev,fieldType:type.value,defaultValue:"",optionsText:""}))}
                          >
                            <i className={`bi ${type.icon}`}></i>
                            <span>{type.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {customForm.fieldType==="select"?(
                      <div className="col-12">
                        <label className="form-label fw-semibold">Dropdown options</label>
                        <textarea className="form-control" rows={5} value={customForm.optionsText} onChange={event=>setCustomForm(prev=>({...prev,optionsText:event.target.value}))} placeholder={"Sales Person A\nSales Person B\nSales Person C"}/>
                        <div className="form-text">Enter one option per line. Commas are also accepted.</div>
                      </div>
                    ):(
                      <div className="col-md-6">
                        <label className="form-label fw-semibold">Default value <span className="text-secondary fw-normal">(optional)</span></label>
                        {customForm.fieldType==="boolean"?(
                          <select className="form-select" value={customForm.defaultValue} onChange={event=>setCustomForm(prev=>({...prev,defaultValue:event.target.value}))}>
                            <option value="">No default</option>
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </select>
                        ):(
                          <input
                            type={customForm.fieldType==="number"||customForm.fieldType==="currency"?"number":customForm.fieldType==="date"?"date":customForm.fieldType==="datetime"?"datetime-local":"text"}
                            className="form-control"
                            value={customForm.defaultValue}
                            onChange={event=>setCustomForm(prev=>({...prev,defaultValue:event.target.value}))}
                            placeholder="Optional default"
                            step={customForm.fieldType==="currency"?"0.01":"any"}
                          />
                        )}
                      </div>
                    )}

                    <div className="col-12">
                      <div className="alert alert-light border mb-0">
                        <div className="d-flex gap-2">
                          <i className="bi bi-info-circle text-primary"></i>
                          <div className="small">
                            After you add the field, it appears as a new column. Click any cell in that column to enter or edit its value. Values are saved separately for each row.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="dynamic-settings-footer">
              <button type="button" className="btn btn-outline-danger me-auto" onClick={resetSettings} disabled={saving}>Reset table</button>
              <button type="button" className="btn btn-light" onClick={()=>setShowSettings(false)} disabled={saving}>Cancel</button>
              {activeTab==="custom"&&(
                <button type="button" className="btn btn-primary" onClick={addCustomField} disabled={!customForm.label.trim()||saving}>
                  <i className="bi bi-plus-lg me-1"></i>Add custom field
                </button>
              )}
              <button type="button" className="btn btn-primary" onClick={saveSettings} disabled={saving||loadingConfig}>
                {saving?<><span className="spinner-border spinner-border-sm me-2"/>Saving...</>:"Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
