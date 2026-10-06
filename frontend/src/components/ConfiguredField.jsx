import React from "react";
import ArithmeticInput from "./ArithmeticInput";

export default function ConfiguredField({
  field,
  value,
  onChange,
  onRecordChange,
  lookupRecords=[],
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
  if(!field||field.visible===false)return null;

  const label=field.label||field.key;
  const effectiveReadOnly=readOnly||field.readOnly||field.editable===false;
  const effectiveRequired=field.required===true||required;

  const handleValue=next=>{
    onChange?.(next);
    if(onRecordChange&&Array.isArray(lookupRecords)){
      const valueField=field.dataSource?.valueField||"_id";
      const selected=lookupRecords.find(record=>String(record?.[valueField]??"")===String(next??""));
      if(selected)onRecordChange(selected,next);
    }
  };

  const common={
    className:"form-control shadow-sm bg-white",
    value:value??"",
    onChange:event=>handleValue(event.target.value),
    placeholder:placeholder||label,
    disabled,
    required:effectiveRequired,
    readOnly:effectiveReadOnly
  };

  let control=null;

  if(field.dataSource?.type==="lookup"&&Array.isArray(lookupRecords)){
    const valueField=field.dataSource.valueField||"_id";
    const labelField=field.dataSource.labelField||valueField;
    control=(
      <select
        className="form-select shadow-sm bg-white"
        value={value??""}
        onChange={event=>handleValue(event.target.value)}
        disabled={disabled||effectiveReadOnly}
        required={effectiveRequired}
      >
        <option value="">Select {label}</option>
        {lookupRecords.map(record=>{
          const optionValue=record?.[valueField];
          const optionLabel=record?.[labelField]??optionValue;
          return <option key={String(optionValue)} value={optionValue}>{String(optionLabel??"")}</option>;
        })}
      </select>
    );
  }else if(field.fieldType==="textarea"){
    control=<textarea {...common} rows={2}/>;
  }else if(field.fieldType==="select"){
    control=<select className="form-select shadow-sm bg-white" value={value??""} onChange={event=>handleValue(event.target.value)} disabled={disabled||effectiveReadOnly} required={effectiveRequired}>
      <option value="">Select {label}</option>
      {(options||[]).map(option=>typeof option==="string"
        ?<option key={option} value={option}>{option}</option>
        :<option key={option.value} value={option.value}>{option.label}</option>
      )}
    </select>;
  }else if(field.fieldType==="boolean"){
    control=<div className="form-check form-switch pt-2">
      <input className="form-check-input" type="checkbox" checked={Boolean(value)} onChange={event=>handleValue(event.target.checked)} disabled={disabled||effectiveReadOnly}/>
    </div>;
  }else if(field.fieldType==="number"||field.fieldType==="currency"){
    control=<ArithmeticInput
      value={value}
      onValueChange={handleValue}
      className="form-control shadow-sm bg-white"
      min={field.validation?.min??min}
      max={field.validation?.max??max}
      step={step||"0.01"}
      disabled={disabled}
      required={effectiveRequired}
      readOnly={effectiveReadOnly}
      placeholder={placeholder||label}
    />;
  }else{
    const htmlType=field.fieldType==="date"?"date":field.fieldType==="datetime"?"datetime-local":"text";
    control=<div className="position-relative">
      <input {...common} type={htmlType} list={listId}/>
      {listId&&<datalist id={listId}>{listOptions.map(option=><option key={option} value={option}/>)}</datalist>}
    </div>;
  }

  return (
    <div className="form-config-field" style={{order:Number(field.order)||0}}>
      <label className="form-label fw-semibold text-muted">
        {icon&&<i className={icon+" me-1"}></i>}
        {label}
        {effectiveRequired&&<span className="text-danger ms-1">*</span>}
        {effectiveReadOnly&&<span className="badge bg-light text-secondary border ms-2">Read only</span>}
      </label>
      {control}
      {help&&<div className="form-text">{help}</div>}
      {field.dataSource?.type==="lookup"&&<div className="form-text">Linked to {field.dataSource.resource}.</div>}
      {suffix}
    </div>
  );
}
