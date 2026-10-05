import React,{useEffect,useState} from "react";
import {evaluateArithmeticExpression} from "../utils/arithmetic";

export default function ArithmeticInput({value,onValueChange,className="form-control",placeholder,step="0.01",min,max,disabled,required,...props}){
  const [text,setText]=useState(value===null||value===undefined?"":String(value));
  const [focused,setFocused]=useState(false);
  useEffect(()=>{if(!focused)setText(value===null||value===undefined?"":String(value));},[value,focused]);
  const commit=raw=>{const trimmed=String(raw??"").trim();if(trimmed===""){onValueChange("");setText("");return;}try{const result=evaluateArithmeticExpression(trimmed);onValueChange(result);setText(String(result));}catch{onValueChange(value);}};
  return <div className="position-relative"><input {...props} type="text" inputMode="decimal" className={className} value={text} placeholder={placeholder||"Enter number or expression"} min={min} max={max} step={step} disabled={disabled} required={required}
    onFocus={()=>setFocused(true)} onChange={event=>{setText(event.target.value);try{onValueChange(evaluateArithmeticExpression(event.target.value));}catch{ /* Keep the typed expression until it becomes valid. */ }}}
    onBlur={()=>{setFocused(false);commit(text);}} onKeyDown={event=>{if(event.key==="Enter")commit(text);if(event.key==="Escape"){setText(value===null||value===undefined?"":String(value));setFocused(false);}}}/>
    <span className="arithmetic-input-hint" title="Supports +, -, *, /, %, and parentheses"><i className="bi bi-calculator"></i></span></div>;
}