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
  const effectiveHelp=help??field.helpText;
  const effectiveDisabled=disabled||Boolean(field.disabled);

  const handleValue=next=>{
    onChange?.(next);
    if(onRecordChange&&Array.isArray(lookupRecords)){
      const valueField=field.dataSource?.valueField||"_id";
      const selected=lookupRecords.find(record=>String(record?.[valueField]??"")===String(next??""));
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
    const valueField=field.dataSource.valueField||"_id";
    const labelField=field.dataSource.labelField||valueField;
    const multiple=field.fieldType==="multiselect"||Boolean(field.dataSource.multiple);
    control=(
      <select
        className="form-select form-entry-control"
        multiple={multiple}
        value={multiple?(Array.isArray(value)?value:[]):(value??"")}
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
        {lookupRecords.map(record=>{
          const optionValue=record?.[valueField];
          const optionLabel=record?.[labelField]??optionValue;
          if(optionValue===undefined||optionValue===null)return null;
          return <option key={String(optionValue)} value={optionValue}>{String(optionLabel??"")}</option>;
        })}
      </select>
    );
  }else if(field.fieldType==="textarea"){
    control=<textarea {...common} rows={2}/>;
  }else if(field.fieldType==="select"){
    control=<select className="form-select shadow-sm bg-white" value={value??""} onChange={event=>handleValue(event.target.value)} disabled={effectiveDisabled||effectiveReadOnly} required={effectiveRequired}>
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
      {field.dataSource?.type==="lookup"&&<div className="form-text">Choices come from existing records.</div>}
      {suffix}
    </div>
  );
}
