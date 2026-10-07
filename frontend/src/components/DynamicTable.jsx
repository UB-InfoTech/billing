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
  {value:"multiselect",label:"Multiple choices",icon:"bi-check2-square",help:"Choose more than one option"},
  {value:"reference",label:"Existing record",icon:"bi-database",help:"Choose an existing record"},
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
  editable:column.editable!==false,
  dataSource:column.dataSource&&typeof column.dataSource==="object"?{...column.dataSource}:null,
  width:Math.min(12,Math.max(0,Number(column.width)||0)),
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
  const [draft,setDraft]=useState(()=>cloneColumns(columns));
  const [customValues,setCustomValues]=useState({});
  const [loadingConfig,setLoadingConfig]=useState(true);
  const [loadingValues,setLoadingValues]=useState(false);
  const [saving,setSaving]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const [draggedColumnKey,setDraggedColumnKey]=useState(null);
  const [searchTerm,setSearchTerm]=useState("");
  const [editingCell,setEditingCell]=useState(null);
  const [editingValue,setEditingValue]=useState("");
  const [error,setError]=useState("");

  const [customForm,setCustomForm]=useState({
    label:"",
    fieldType:"text",
    defaultValue:"",
    optionsText:"",
    editable:true,
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
  const rowKeySignature=useMemo(()=>JSON.stringify(rowKeyList),[rowKeyList]);
  const customFieldSignature=useMemo(
    ()=>JSON.stringify(customColumns.map(column=>({key:column.key,fieldType:column.fieldType,options:column.options,defaultValue:column.defaultValue}))),
    [customColumns]
  );
  const visibleColumns=useMemo(()=>draft.filter(column=>column.visible!==false),[draft]);
  const filteredDraft=useMemo(()=>{
    const query=searchTerm.trim().toLowerCase();
    if(!query)return draft;
    return draft.filter(column=>column.label.toLowerCase().includes(query));
  },[draft,searchTerm]);

  const resetCustomForm=()=>setCustomForm({label:"",fieldType:"text",defaultValue:"",optionsText:"",editable:true});

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
  },[tableKey,baseColumnSignature,columns]);

  useEffect(()=>{
    if(loadingConfig)return;
    const rowKeys=JSON.parse(rowKeySignature||"[]");
    const hasCustomFields=customFieldSignature!=="[]";
    if(!hasCustomFields||!rowKeys.length){
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
      if(Object.prototype.hasOwnProperty.call(customValues,key))return customValues[key];
      if(row?.customFields&&Object.prototype.hasOwnProperty.call(row.customFields,sourceKey))return row.customFields[sourceKey];
      return column.defaultValue??"";
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
    if(column.fieldType==="multiselect"&&Array.isArray(value))return value.map(item=>{
      const option=column.options.find(candidate=>String(candidate?.value??candidate)===String(item));
      return option?.label??option??item;
    }).join(", ");
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
    if(column.fieldType==="select"||column.fieldType==="multiselect"){
      const multiple=column.fieldType==="multiselect";
      return(
        <select
          {...common}
          multiple={multiple}
          value={multiple?(Array.isArray(editingValue)?editingValue:[]):editingValue??""}
          onChange={event=>{
            if(multiple){
              saveCustomValue(rowKey,column.key,Array.from(event.target.selectedOptions).map(option=>option.value));
              return;
            }
            saveCustomValue(rowKey,column.key,event.target.value);
          }}
          style={multiple?{minHeight:90}:undefined}
        >
          {!multiple&&<option value="">Select...</option>}
          {column.options.map(option=>{
            const value=typeof option==="object"?option.value:option;
            const label=typeof option==="object"?option.label:option;
            return <option key={String(value)} value={value}>{label}</option>;
          })}
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
    const value=resolvedValue(column.key,row,rowIndex);

    if(column.editable===false){
      return <span className={value===null||value===undefined||value===""?"text-muted":""}>{formatCustomValue(column,value)}</span>;
    }

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
    if(["select","multiselect"].includes(customForm.fieldType)&&options.length===0){
      setError("Add at least one choice.");
      return;
    }

    const slug=label.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"").slice(0,50)||"field";
    const key=`custom_${slug}_${Date.now()}`;
    const defaultValue=customForm.fieldType==="boolean"
      ? customForm.defaultValue==="true"
      : customForm.fieldType==="multiselect"
        ? customForm.defaultValue.split(/\r?\n|,/).map(value=>value.trim()).filter(Boolean)
        : customForm.defaultValue;

    setDraft(prev=>[...prev,{
      key,
      label,
      visible:true,
      locked:false,
      custom:true,
      kind:"custom",
      fieldType:customForm.fieldType,
      options:["select","multiselect"].includes(customForm.fieldType)?options.map(value=>({value,label:value})):[],
      defaultValue,
      editable:Boolean(customForm.editable),
      sourceKeys:[],
      separator:" ",
      order:prev.length
    }].map((column,index)=>({...column,order:index})));

    setError("");
    resetCustomForm();
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
      order:prev.length,
      width:6
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
        <div className="dynamic-settings-overlay" onMouseDown={event=>{
          if(event.target===event.currentTarget)setShowSettings(false);
        }}>
          <section className="dynamic-settings-drawer dynamic-table-builder" role="dialog" aria-modal="true" aria-label="Customize table">
            <header className="dynamic-table-builder-header">
              <div className="min-w-0">
                <div className="dynamic-table-builder-kicker"><i className="bi bi-layout-three-columns me-1"></i>Customize</div>
                <h5 className="mb-1">Customize this table</h5>
                <p className="mb-0">Show the columns you need, rename them, and drag them into the order you want.</p>
              </div>
              <button type="button" className="btn btn-light border rounded-circle" onClick={()=>setShowSettings(false)} aria-label="Close table customization">
                <i className="bi bi-x-lg"></i>
              </button>
            </header>

            <div className="dynamic-settings-drawer-body">
              {error&&<div className="alert alert-danger py-2">{error}</div>}

              <div className="dynamic-table-builder-summary">
                <strong>{visibleColumns.length}</strong> of {draft.length} columns are visible
                <div className="d-flex gap-2">
                  <button type="button" className="btn btn-sm btn-light border" onClick={showAll}><i className="bi bi-eye me-1"></i>Show all</button>
                  <button type="button" className="btn btn-sm btn-light border" onClick={hideOptional}>Hide optional</button>
                </div>
              </div>

              <div className="dynamic-settings-section">
                <div className="dynamic-settings-section-title">
                  <div>
                    <div className="fw-semibold">Columns</div>
                    <div className="small text-secondary">Drag the handle to move a column. Edit the name or size directly.</div>
                  </div>
                </div>

                <div className="d-flex gap-2 mb-3">
                  <div className="input-group">
                    <span className="input-group-text bg-white"><i className="bi bi-search"></i></span>
                    <input className="form-control" value={searchTerm} onChange={event=>setSearchTerm(event.target.value)} placeholder="Find a column"/>
                  </div>
                </div>

                <div className="dynamic-simple-column-list">
                  {filteredDraft.length===0?(
                    <div className="text-center text-secondary py-4">No columns match your search.</div>
                  ):filteredDraft.map(column=>{
                    const index=draft.findIndex(item=>item.key===column.key);
                    return(
                      <div
                        key={column.key}
                        className={`dynamic-simple-column dynamic-table-builder-row ${column.visible!==false?"is-visible":"is-hidden"} ${draggedColumnKey===column.key?"is-dragging":""}`}
                        draggable={!column.locked}
                        onDragStart={()=>setDraggedColumnKey(column.key)}
                        onDragOver={event=>event.preventDefault()}
                        onDrop={()=>{
                          if(!draggedColumnKey||draggedColumnKey===column.key)return;
                          setDraft(prev=>{
                            const sourceIndex=prev.findIndex(item=>item.key===draggedColumnKey);
                            const targetIndex=prev.findIndex(item=>item.key===column.key);
                            if(sourceIndex<0||targetIndex<0)return prev;
                            const next=prev.slice();
                            const [moved]=next.splice(sourceIndex,1);
                            next.splice(targetIndex,0,moved);
                            return next.map((item,itemIndex)=>({...item,order:itemIndex}));
                          });
                          setDraggedColumnKey(null);
                        }}
                        onDragEnd={()=>setDraggedColumnKey(null)}
                      >
                        <span
                          className="dynamic-column-drag-handle"
                          draggable={!column.locked}
                          onDragStart={event=>{event.stopPropagation();setDraggedColumnKey(column.key);}}
                          onDragEnd={()=>setDraggedColumnKey(null)}
                          title="Drag to move"
                        >
                          <i className="bi bi-grip-vertical"></i>
                        </span>

                        <div className="flex-grow-1 min-w-0">
                          <div className="d-flex align-items-center gap-2">
                            {column.kind!=="field"&&<span className="badge bg-light text-dark border">{column.kind==="custom"?"Custom":"Combined"}</span>}
                            <input
                              className="form-control form-control-sm dynamic-column-name-input"
                              value={column.label}
                              disabled={column.locked}
                              onChange={event=>setDraft(prev=>prev.map((item,itemIndex)=>itemIndex===index?{...item,label:event.target.value}:item))}
                            />
                          </div>
                          <div className="small text-secondary mt-1">
                            {column.kind==="merged"?"Combines other columns":column.kind==="custom"?fieldTypeLabel(column.fieldType):"Existing column"}
                            {column.locked?" · Always shown":""}
                          </div>
                        </div>

                        <div className="dynamic-table-builder-width">
                          <select
                            className="form-select form-select-sm"
                            value={Math.min(12,Math.max(0,Number(column.width)||0))}
                            onChange={event=>setDraft(prev=>prev.map((item,itemIndex)=>itemIndex===index?{...item,width:Number(event.target.value)}:item))}
                            aria-label={`Width for ${column.label}`}
                          >
                            <option value="0">Automatic width</option><option value="3">25% width</option>
                            <option value="4">33% width</option>
                            <option value="6">50% width</option>
                            <option value="8">67% width</option>
                            <option value="9">75% width</option>
                            <option value="12">100% width</option>
                          </select>
                        </div>

                        <button
                          type="button"
                          className={`btn btn-sm dynamic-visibility-btn ${column.visible!==false?"is-visible":"is-hidden"}`}
                          disabled={column.locked}
                          onClick={()=>toggleColumn(index)}
                          title={column.visible!==false?"Hide column":"Show column"}
                        >
                          <i className={`bi ${column.visible!==false?"bi-eye":"bi-eye-slash"}`}></i>
                          <span>{column.visible!==false?"Shown":"Hidden"}</span>
                        </button>

                        {column.kind==="custom"&&(
                          <>
                            <button
                              type="button"
                              className={`btn btn-sm ${column.editable!==false?"btn-outline-primary":"btn-outline-secondary"} dynamic-mini-btn`}
                              onClick={()=>setDraft(prev=>prev.map((item,itemIndex)=>itemIndex===index?{...item,editable:item.editable===false}:item))}
                              title={column.editable!==false?"Make this column read only":"Allow editing this column"}
                            >
                              {column.editable!==false?"Editable":"Read only"}
                            </button>
                            <button type="button" className="btn btn-sm btn-outline-danger dynamic-mini-btn" onClick={()=>removeColumn(index)} title="Remove custom column">
                              <i className="bi bi-trash"></i>
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <details className="dynamic-builder-details">
                <summary><i className="bi bi-plus-lg me-2"></i>Add a new column</summary>
                <div className="dynamic-builder-details-body">
                  <div className="small text-secondary mb-3">Use this for information that is not already in the table.</div>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label">Column name</label>
                      <input className="form-control" value={customForm.label} onChange={event=>setCustomForm(prev=>({...prev,label:event.target.value}))} placeholder="Example: Sales person"/>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">What kind of information?</label>
                      <select className="form-select" value={customForm.fieldType} onChange={event=>setCustomForm(prev=>({...prev,fieldType:event.target.value,defaultValue:"",optionsText:""}))}>
                        {FIELD_TYPES.map(type=><option key={type.value} value={type.value}>{type.label}</option>)}
                      </select>
                    </div>
                    {["select","multiselect"].includes(customForm.fieldType) ? (
                      <div className="col-12">
                        <label className="form-label">Choices</label>
                        <textarea className="form-control" rows={2} value={customForm.optionsText} onChange={event=>setCustomForm(prev=>({...prev,optionsText:event.target.value}))} placeholder="One choice per line"/>
                      </div>
                    ) : (
                      <div className="col-md-6">
                        <label className="form-label">Starting value <span className="text-secondary">(optional)</span></label>
                        <input className="form-control" value={customForm.defaultValue} onChange={event=>setCustomForm(prev=>({...prev,defaultValue:event.target.value}))} placeholder="Leave blank for none"/>
                      </div>

                    {customForm.fieldType!=="reference"&&(
                      <div className="col-12">
                        <div className="form-check form-switch">
                          <input className="form-check-input" type="checkbox" checked={customForm.editable} onChange={event=>setCustomForm(prev=>({...prev,editable:event.target.checked}))}/>
                          <label className="form-check-label">People can edit this column directly</label>
                        </div>
                      </div>
                    )}                    )}
                  </div>
                  <button type="button" className="btn btn-primary mt-3" onClick={addCustomField} disabled={!customForm.label.trim()}>Add column</button>
                </div>
              </details>

              <details className="dynamic-builder-details">
                <summary><i className="bi bi-link-45deg me-2"></i>Combine existing columns</summary>
                <div className="dynamic-builder-details-body">
                  <div className="small text-secondary mb-3">Example: Company + City can become one “Customer location” column.</div>
                  <div className="row g-3">
                    <div className="col-md-5">
                      <label className="form-label">New column name</label>
                      <input className="form-control" value={mergeForm.label} onChange={event=>setMergeForm(prev=>({...prev,label:event.target.value}))} placeholder="Customer location"/>
                    </div>
                    <div className="col-md-7">
                      <label className="form-label">Choose columns</label>
                      <div className="dynamic-merge-checklist">
                        {mergeSources.map(column=>(
                          <label key={column.key} className="dynamic-merge-option">
                            <input
                              type="checkbox"
                              checked={mergeForm.sources.includes(column.key)}
                              onChange={event=>setMergeForm(prev=>({
                                ...prev,
                                sources:event.target.checked
                                  ? [...prev.sources,column.key]
                                  : prev.sources.filter(key=>key!==column.key)
                              }))}
                            />
                            <span>{column.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="col-md-5">
                      <label className="form-label">Separator</label>
                      <input className="form-control" value={mergeForm.separator} onChange={event=>setMergeForm(prev=>({...prev,separator:event.target.value}))} placeholder="Example:  - "/>
                    </div>
                  </div>
                  <button type="button" className="btn btn-light border mt-3" onClick={addMergedColumn} disabled={mergeForm.sources.length<2||!mergeForm.label.trim()}>Combine columns</button>
                </div>
              </details>
            </div>

            <footer className="dynamic-settings-drawer-footer">
              <button type="button" className="btn btn-outline-danger" onClick={resetSettings} disabled={saving}>Reset to default</button>
              <div className="ms-auto d-flex gap-2">
                <button type="button" className="btn btn-light border" onClick={()=>setShowSettings(false)} disabled={saving}>Cancel</button>
                <button type="button" className="btn btn-primary px-4" onClick={saveSettings} disabled={saving||loadingConfig}>
                  {saving?<><span className="spinner-border spinner-border-sm me-2"></span>Saving</>:"Save changes"}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}

    </>
  );
}
