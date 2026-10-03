import React,{useEffect,useMemo,useState} from "react";
import axios from "axios";

const apiBase=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");

const authConfig=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});

const getValue=(row,path)=>{
  if(row==null||!path)return "";
  return String(path).split(".").reduce((value,key)=>value==null?"":value[key],row) ?? "";
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
  kind:column.kind==="merged"?"merged":"field",
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
    if(!merged.some(item=>item.key===column.key)&&column.kind==="merged"){
      const availableSources=new Set(base.map(item=>item.key));
      const sourceKeys=(Array.isArray(column.sourceKeys)?column.sourceKeys:[]).filter(sourceKey=>availableSources.has(sourceKey));
      if(sourceKeys.length<2)return;
      merged.push({
        key:column.key,
        label:column.label||column.key,
        visible:column.visible!==false,
        locked:false,
        kind:"merged",
        sourceKeys,
        separator:column.separator??" ",
        order:Number.isFinite(Number(column.order))?Number(column.order):merged.length,
      });
    }
  });

  const normalized=merged.sort((a,b)=>(a.order??0)-(b.order??0)).map((column,index)=>({...column,order:index}));
  if(normalized.length&&!normalized.some(column=>column.visible!==false)){
    normalized[0]={...normalized[0],visible:true};
  }
  return normalized;
};

const ColumnIcon=({column,onUp,onDown,onToggle,onRemove,isFirst,isLast})=>(
  <div className="d-flex align-items-center gap-2 border rounded-3 p-2 bg-white">
    <div className="flex-grow-1">
      <div className="fw-semibold">{column.label}</div>
      <div className="small text-muted">
        {column.kind==="merged"?"Merged: "+column.sourceKeys.join(" + "):column.key}
      </div>
    </div>
    <div className="form-check form-switch mb-0">
      <input
        className="form-check-input"
        type="checkbox"
        checked={column.visible!==false}
        disabled={column.locked}
        onChange={onToggle}
        title={column.locked?"Required column":"Show / hide column"}
      />
    </div>
    <button type="button" className="btn btn-outline-secondary btn-sm" disabled={isFirst} onClick={onUp} title="Move left">
      <i className="bi bi-chevron-up"></i>
    </button>
    <button type="button" className="btn btn-outline-secondary btn-sm" disabled={isLast} onClick={onDown} title="Move right">
      <i className="bi bi-chevron-down"></i>
    </button>
    {column.kind==="merged"&&!column.locked&&(
      <button type="button" className="btn btn-outline-danger btn-sm" onClick={onRemove} title="Remove merged column">
        <i className="bi bi-trash"></i>
      </button>
    )}
  </div>
);

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
}) {
  const [savedConfig,setSavedConfig]=useState(null);
  const [draft,setDraft]=useState(()=>cloneColumns(columns));
  const [loadingConfig,setLoadingConfig]=useState(true);
  const [saving,setSaving]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const [mergedLabel,setMergedLabel]=useState("");
  const [mergedSources,setMergedSources]=useState([]);
  const [separator,setSeparator]=useState(" - ");
  const [error,setError]=useState("");
  const baseColumnSignature=useMemo(()=>JSON.stringify(columns.map(column=>({key:column.key,label:column.label,locked:column.locked,kind:column.kind}))),[columns]);

  useEffect(()=>{
    let cancelled=false;
    const load=async()=>{
      try{
        setLoadingConfig(true);
        const response=await axios.get(`${apiBase}/api/table-config/${encodeURIComponent(tableKey)}`,authConfig());
        if(cancelled)return;
        setError("");
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
    if(!loadingConfig&&savedConfig==null)setDraft(cloneColumns(columns));
  },[columns,loadingConfig,savedConfig]);

  const visibleColumns=useMemo(()=>draft.filter(column=>column.visible!==false),[draft]);

  const findBaseColumn=key=>columns.find(column=>column.key===key);

  const cellText=(column,row,rowIndex)=>{
    if(column.kind==="merged"){
      return column.sourceKeys
        .map(sourceKey=>{
          let value=displayValue(getValue(row,sourceKey));
          const sourceColumn=findBaseColumn(sourceKey);
          if(sourceColumn?.format)value=sourceColumn.format(value,row,rowIndex);
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

  const addMergedColumn=()=>{
    const label=mergedLabel.trim();
    const sources=[...new Set(mergedSources.filter(Boolean))];
    if(!label||sources.length<2)return;
    const key=`custom_${Date.now()}`;
    setDraft(prev=>[...prev,{
      key,
      label,
      visible:true,
      locked:false,
      kind:"merged",
      sourceKeys:sources,
      separator,
      order:prev.length
    }].map((column,index)=>({...column,order:index})));
    setMergedLabel("");
    setMergedSources([]);
  };

  const removeColumn=index=>{
    setDraft(prev=>prev.filter((column,i)=>i!==index).map((column,i)=>({...column,order:i})));
  };

  const saveSettings=async()=>{
    try{
      setSaving(true);
      setError("");
      const payload={columns:draft.map((column,index)=>({
        ...column,
        order:index
      }))};
      const response=await axios.put(`${apiBase}/api/table-config/${encodeURIComponent(tableKey)}`,payload,authConfig());
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
      setError("");
      setShowSettings(false);
    }catch(resetError){
      setError(resetError.response?.data?.message||"Unable to reset table settings.");
    }finally{
      setSaving(false);
    }
  };

  const visibleSelectedCount=rows.filter(row=>selectedIds.includes(String(getRowKey(row))).length);
  const allSelected=rows.length>0&&visibleSelectedCount===rows.length;

  return(
    <>
      <div className="d-flex justify-content-end mb-2">
        <button
          type="button"
          className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-2"
          onClick={()=>setShowSettings(true)}
          disabled={loadingConfig}
          title={loadingConfig?"Loading table settings...":"Customize table"}
        >
          <i className="bi bi-layout-three-columns"></i>
          Customize Columns
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
                  <span className={onSort?"text-decoration-none":""}>{column.label}</span>
                </th>
              ))}
              {actionColumn&&<th className="text-end">{actionColumn.label||"Actions"}</th>}
            </tr>
          </thead>
          <tbody>
            {loading?(
              <tr><td colSpan={(selectable?1:0)+visibleColumns.length+(actionColumn?1:0)} className="text-center py-5">
                <span className="spinner-border spinner-border-sm me-2"/>Loading...
              </td></tr>
            ):rows.length===0?(
              <tr><td colSpan={(selectable?1:0)+visibleColumns.length+(actionColumn?1:0)} className="text-center py-5 text-muted">{emptyText}</td></tr>
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
        <div className="modal show d-block" tabIndex="-1" role="dialog" style={{background:"rgba(15,23,42,.55)"}}>
          <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-primary text-white">
                <div>
                  <h5 className="modal-title mb-1">Customize Table</h5>
                  <div className="small opacity-75">{tableKey}</div>
                </div>
                <button type="button" className="btn-close btn-close-white" onClick={()=>setShowSettings(false)}></button>
              </div>
              <div className="modal-body">
                <div className="alert alert-light border">
                  Choose visible columns, change their order, or combine multiple fields into one new saved column.
                </div>

                <div className="d-flex flex-column gap-2">
                  {draft.map((column,index)=>(
                    <ColumnIcon
                      key={column.key}
                      column={column}
                      isFirst={index===0}
                      isLast={index===draft.length-1}
                      onUp={()=>moveColumn(index,-1)}
                      onDown={()=>moveColumn(index,1)}
                      onToggle={()=>toggleColumn(index)}
                      onRemove={()=>removeColumn(index)}
                    />
                  ))}
                </div>

                <hr className="my-4"/>

                <div className="card border-0 bg-light">
                  <div className="card-body">
                    <div className="fw-bold mb-1"><i className="bi bi-link-45deg me-2"></i>Create New Merged Column</div>
                    <div className="small text-muted mb-3">Example: Company + City + State → Customer Location</div>

                    <div className="row g-3">
                      <div className="col-md-5">
                        <label className="form-label">New column name</label>
                        <input className="form-control" value={mergedLabel} onChange={e=>setMergedLabel(e.target.value)} placeholder="Customer / Location"/>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Separator</label>
                        <input className="form-control" value={separator} onChange={e=>setSeparator(e.target.value)} placeholder=" - "/>
                      </div>
                      <div className="col-md-3 d-flex align-items-end">
                        <button type="button" className="btn btn-primary w-100" onClick={addMergedColumn} disabled={mergedSources.length<2||!mergedLabel.trim()}>
                          <i className="bi bi-plus-circle me-1"></i>Add Column
                        </button>
                      </div>
                      <div className="col-12">
                        <label className="form-label">Fields to merge</label>
                        <select
                          multiple
                          className="form-select"
                          style={{minHeight:150}}
                          value={mergedSources}
                          onChange={e=>setMergedSources(Array.from(e.target.selectedOptions).map(option=>option.value))}
                        >
                          {columns.map(column=>(
                            <option key={column.key} value={column.key}>{column.label} ({column.key})</option>
                          ))}
                        </select>
                        <div className="small text-muted mt-1">Hold Ctrl/Cmd to select multiple fields.</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline-danger me-auto" onClick={resetSettings} disabled={saving}>Reset to Default</button>
                <button type="button" className="btn btn-outline-secondary" onClick={()=>setShowSettings(false)} disabled={saving}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={saveSettings} disabled={saving}>
                  {saving?<><span className="spinner-border spinner-border-sm me-2"/>Saving...</>:"Save Table Layout"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
