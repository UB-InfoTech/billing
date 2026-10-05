import React from "react";
import ArithmeticInput from "./ArithmeticInput";

export default function ConfiguredField({field,value,onChange,placeholder,icon,options=[],listId,listOptions=[],disabled=false,required=false,suffix,help,min,max,step,readOnly=false}){
  if(!field||field.visible===false)return null;
  const label=field.label||field.key;
  const resolvedValue=value===undefined||value===null||value==="" ? (field.defaultValue??"") : value;
  const resolvedOptions=options.length ? options : (field.options||[]);
  const isRequired=field.required===true||required;
  const common={
    className:"form-control shadow-sm bg-white",
    value:resolvedValue,
    onChange:event=>onChange(event.target.value),
    placeholder:placeholder||label,
    disabled,required:isRequired,readOnly
  };
  let control=null;
  if(field.fieldType==="textarea"){
    control=<textarea {...common} rows={2}/>;
  }else if(field.fieldType==="select"){
    control=<select className="form-select shadow-sm bg-white" value={value??""} onChange={event=>onChange(event.target.value)} disabled={disabled} required={isRequired}>
      <option value="">Select {label}</option>
      {resolvedOptions.map(option=>typeof option==="string"?<option key={option} value={option}>{option}</option>:<option key={option.value} value={option.value}>{option.label}</option>)}
    </select>;
  }else if(field.fieldType==="boolean"){
    control=<div className="form-check form-switch pt-2"><input className="form-check-input" type="checkbox" checked={Boolean(value)} onChange={event=>onChange(event.target.checked)} disabled={disabled}/></div>;
  }else if(field.fieldType==="number"||field.fieldType==="currency"){
    control=<ArithmeticInput value={value} onValueChange={onChange} className="form-control shadow-sm bg-white" min={min} max={max} step={step||"0.01"} disabled={disabled} required={isRequired} placeholder={placeholder||label}/>;
  }else{
    const htmlType=field.fieldType==="date"?"date":field.fieldType==="datetime"?"datetime-local":"text";
    control=<div className="position-relative"><input {...common} type={htmlType} list={listId}/>{listId&&<datalist id={listId}>{listOptions.map(option=><option key={option} value={option}/>)}</datalist>}</div>;
  }
  return <div className="form-config-field" style={{order:Number(field.order)||0}}>
    <label className="form-label fw-semibold text-muted">{icon&&<i className={icon+" me-1"}></i>}{label}{isRequired&&<span className="text-danger ms-1">*</span>}</label>
    {control}
    {help&&<div className="form-text">{help}</div>}
    {suffix}
  </div>;
}