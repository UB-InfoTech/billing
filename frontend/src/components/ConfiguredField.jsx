import React,{useEffect,useRef,useState} from "react";
import ArithmeticInput from "./ArithmeticInput";

export default function ConfiguredField({
  field,
  value,
  onChange,
  onRecordChange,
  lookupRecords=[],
  onLookupSearch,
  placeholder,
  icon,
  options=[],
  listId,
  listOptions=[],
  disabled=false,
  required=false,
  suffix,
  help,
  min,
  max,
  step,
  readOnly=false
}){
  const [lookupQuery,setLookupQuery]=useState("");
  const [lookupResults,setLookupResults]=useState(null);
  const [lookupSearching,setLookupSearching]=useState(false);
  const [lookupSearchError,setLookupSearchError]=useState("");
  const lookupRequestSequence=useRef(0);

  const lookupResource=field?.dataSource?.type==="lookup"
    ?String(field.dataSource.resource||"")
    :"";
  const lookupValueField=field?.dataSource?.valueField||"_id";
  const lookupLabelField=field?.dataSource?.labelField||lookupValueField;
  const lookupSearchField=field?.dataSource?.searchField||lookupLabelField;
  const selectedLookupValues=(Array.isArray(value)?value:[value])
    .filter(item=>item!==null&&item!==undefined&&item!=="")
    .map(String);
  const missingSelectedIds=selectedLookupValues.filter(selectedId=>
    !lookupRecords.some(record=>String(record?.[lookupValueField]??"")===selectedId)
  );
  const missingSelectedSignature=JSON.stringify(missingSelectedIds);

  useEffect(()=>{
    if(!lookupResource||!onLookupSearch||!missingSelectedIds.length)return;
    onLookupSearch(lookupResource,"",lookupSearchField,missingSelectedIds).catch(()=>{});
  },[lookupResource,lookupSearchField,missingSelectedSignature,onLookupSearch]);

  useEffect(()=>{
    const query=lookupQuery.trim();
    if(!lookupResource||!onLookupSearch||query.length<2){
      setLookupResults(null);
      setLookupSearching(false);
      setLookupSearchError("");
      return;
    }

    let active=true;
    const requestSequence=++lookupRequestSequence.current;
    const timer=window.setTimeout(async()=>{
      setLookupSearching(true);
      setLookupSearchError("");
      try{
        const matches=await onLookupSearch(lookupResource,query,lookupSearchField);
        if(active&&requestSequence===lookupRequestSequence.current){
          setLookupResults(Array.isArray(matches)?matches:[]);
        }
      }catch(error){
        if(active&&requestSequence===lookupRequestSequence.current){
          setLookupResults([]);
          setLookupSearchError(error.response?.data?.message||"Could not search linked records. Try again.");
        }
      }finally{
        if(active&&requestSequence===lookupRequestSequence.current)setLookupSearching(false);
      }
    },250);

    return()=>{
      active=false;
      window.clearTimeout(timer);
    };
  },[lookupQuery,lookupResource,lookupSearchField,onLookupSearch]);

  if(!field||field.visible===false)return null;

  const label=field.label||field.key;
  const effectiveReadOnly=readOnly||field.readOnly||field.editable===false;
  const effectiveRequired=field.required===true||required;
  const effectiveHelp=help??field.helpText;
  const effectiveDisabled=disabled||Boolean(field.disabled);

  const handleValue=next=>{
    onChange?.(next);
    // Auto-fill uses one selected record. Multiple selections are stored as
    // values only, since there is no single source record to copy from.
    if(!Array.isArray(next)&&onRecordChange&&Array.isArray(lookupRecords)){
      const candidates=[...lookupRecords,...(lookupResults||[])];
      const selected=candidates.find(record=>String(record?.[lookupValueField]??"")===String(next??""));
      if(selected)onRecordChange(selected,next);
    }
  };

  const common={
    className:"form-control form-entry-control",
    value:value??"",
    onChange:event=>handleValue(event.target.value),
    placeholder:placeholder||(effectiveReadOnly?"Filled automatically":field.fieldType==="date"?"Choose a date":field.fieldType==="datetime"?"Choose date and time":field.fieldType==="number"||field.fieldType==="currency"?"Enter "+label.toLowerCase():"Enter "+label.toLowerCase()),
    disabled:effectiveDisabled,
    required:effectiveRequired,
    readOnly:effectiveReadOnly,
    min:field.validation?.min??undefined,
    max:field.validation?.max??undefined,
    pattern:field.validation?.pattern||undefined
  };

  let control=null;

  if(field.dataSource?.type==="lookup"&&Array.isArray(lookupRecords)){
    const multiple=field.fieldType==="multiselect"||Boolean(field.dataSource.multiple);
    const selectedIds=new Set(selectedLookupValues);
    const currentOptions=lookupResults===null?lookupRecords:lookupResults;
    const optionMap=new Map();
    [...lookupRecords.filter(record=>selectedIds.has(String(record?.[lookupValueField]??""))),...currentOptions].forEach(record=>{
      const optionValue=record?.[lookupValueField];
      if(optionValue===undefined||optionValue===null)return;
      optionMap.set(String(optionValue),record);
    });
    const lookupOptions=[...optionMap.values()];

    control=(
      <div className="no-code-lookup-control">
        {onLookupSearch&&(
          <input
            type="search"
            className="form-control form-entry-control mb-2"
            value={lookupQuery}
            onChange={event=>setLookupQuery(event.target.value)}
            placeholder={`Search ${label.toLowerCase()} by name or details`}
            aria-label={`Search records for ${label}`}
            disabled={effectiveDisabled||effectiveReadOnly}
            autoComplete="off"
          />
        )}
        <select
          className="form-select form-entry-control"
          multiple={multiple}
          value={multiple?selectedLookupValues:String(value??"")}
          onChange={event=>{
            if(multiple){
              handleValue(Array.from(event.target.selectedOptions).map(option=>option.value));
              return;
            }
            handleValue(event.target.value);
          }}
          disabled={effectiveDisabled||effectiveReadOnly}
          required={effectiveRequired}
          style={multiple?{minHeight:100}:undefined}
        >
          {!multiple&&<option value="">Select {label}</option>}
          {lookupSearching&&<option value="" disabled>Searching records...</option>}
          {!lookupSearching&&lookupOptions.length===0&&lookupQuery.trim().length>=2&&(
            <option value="" disabled>No matching records</option>
          )}
          {lookupOptions.map(record=>{
            const optionValue=record?.[lookupValueField];
            const optionLabel=record?.[lookupLabelField]??optionValue;
            return <option key={String(optionValue)} value={String(optionValue)}>{String(optionLabel??"")}</option>;
          })}
        </select>
        {lookupSearchError&&<div className="form-text text-danger">{lookupSearchError}</div>}
        {lookupQuery.trim().length>0&&lookupQuery.trim().length<2&&(
          <div className="form-text">Type at least 2 characters to search more records.</div>
        )}
      </div>
    );
  }else if(field.fieldType==="textarea"){
    control=<textarea {...common} rows={2}/>;
  }else if(field.fieldType==="select"){
    control=<select className="form-select form-entry-control" value={value??""} onChange={event=>handleValue(event.target.value)} disabled={effectiveDisabled||effectiveReadOnly} required={effectiveRequired}>
      <option value="">Select {label}</option>
      {(options||[]).map(option=>typeof option==="string"
        ?<option key={option} value={option}>{option}</option>
        :<option key={option.value} value={option.value}>{option.label}</option>
      )}
    </select>;
  }else if(field.fieldType==="boolean"){
    control=<div className="form-check form-switch pt-2">
      <input className="form-check-input" type="checkbox" checked={Boolean(value)} onChange={event=>handleValue(event.target.checked)} disabled={effectiveDisabled||effectiveReadOnly}/>
    </div>;
  }else if(field.fieldType==="number"||field.fieldType==="currency"){
    control=<ArithmeticInput
      value={value}
      onValueChange={handleValue}
      className="form-control form-entry-control"
      min={field.validation?.min??min}
      max={field.validation?.max??max}
      step={step||"0.01"}
      disabled={effectiveDisabled}
      required={effectiveRequired}
      readOnly={effectiveReadOnly}
      placeholder={placeholder||label}
    />;
  }else{
    const htmlType=field.fieldType==="date"?"date"
      :field.fieldType==="datetime"?"datetime-local"
      :field.fieldType==="email"?"email"
      :field.fieldType==="phone"?"tel"
      :field.fieldType==="url"?"url"
      :"text";
    control=<div className="position-relative">
      <input {...common} type={htmlType} list={listId}/>
      {listId&&<datalist id={listId}>{listOptions.map(option=><option key={option} value={option}/>)}</datalist>}
    </div>;
  }

  return (
    <div className="form-config-field" style={{order:Number(field.order)||0}}>
      <label className="form-label form-entry-label">
        {icon&&<i className={icon+" me-1"}></i>}
        {label}
        {effectiveRequired?<span className="form-entry-required ms-2">Required</span>:<span className="form-entry-optional ms-2">Optional</span>}
        {effectiveReadOnly&&<span className="badge bg-light text-secondary border ms-2">Read only</span>}
      </label>
      {control}
      {effectiveHelp&&<div className="form-text">{effectiveHelp}</div>}
      {field.dataSource?.type==="lookup"&&<div className="form-text">Search and select an existing record from your business account.</div>}
      {suffix}
    </div>
  );
}
