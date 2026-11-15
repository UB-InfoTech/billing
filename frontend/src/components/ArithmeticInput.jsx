import React,{useEffect,useRef,useState} from "react";
import {evaluateArithmeticExpression} from "../utils/arithmetic";

const rangeErrorFor=(number,min,max)=>{
  const hasMin=min!==undefined&&min!==null&&min!=="";
  const hasMax=max!==undefined&&max!==null&&max!=="";
  const lower=hasMin?Number(min):null;
  const upper=hasMax?Number(max):null;
  if(hasMin&&Number.isFinite(lower)&&number<lower)return `Enter a value of ${lower} or more.`;
  if(hasMax&&Number.isFinite(upper)&&number>upper)return `Enter a value of ${upper} or less.`;
  return "";
};

export default function ArithmeticInput({value,onValueChange,className="form-control",placeholder,step="0.01",min,max,disabled,required,...props}){
  const [text,setText]=useState(value===null||value===undefined?"":String(value));
  const [focused,setFocused]=useState(false);
  const [inputError,setInputError]=useState("");
  const inputRef=useRef(null);
  const errorId=props.id?`${props.id}-error`:undefined;
  const describedBy=[props["aria-describedby"],inputError&&errorId].filter(Boolean).join(" ")||undefined;

  const updateError=message=>{
    inputRef.current?.setCustomValidity(message);
    setInputError(message);
  };

  useEffect(()=>{
    if(!focused&&!inputError)setText(value===null||value===undefined?"":String(value));
  },[value,focused,inputError]);

  const commit=raw=>{
    const trimmed=String(raw??"").trim();
    if(trimmed===""){
      updateError("");
      onValueChange("");
      setText("");
      return;
    }
    try{
      const result=evaluateArithmeticExpression(trimmed);
      const rangeError=rangeErrorFor(result,min,max);
      if(rangeError){
        updateError(rangeError);
        return;
      }
      updateError("");
      onValueChange(result);
      setText(String(result));
    }catch{
      updateError("Enter a valid number or calculation.");
    }
  };

  return(
    <div className="position-relative arithmetic-input-control">
      <input
        {...props}
        ref={inputRef}
        type="text"
        inputMode="decimal"
        className={className}
        value={text}
        placeholder={placeholder||"Enter number or expression"}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        required={required}
        aria-describedby={describedBy}
        aria-invalid={inputError?"true":undefined}
        onFocus={()=>setFocused(true)}
        onChange={event=>{
          const nextText=event.target.value;
          setText(nextText);
          try{
            const result=evaluateArithmeticExpression(nextText);
            const rangeError=rangeErrorFor(result,min,max);
            updateError(rangeError);
            if(!rangeError)onValueChange(result);
          }catch{
            // Incomplete expressions are allowed while the user is typing.
            updateError("");
          }
        }}
        onBlur={()=>{
          setFocused(false);
          commit(text);
        }}
        onKeyDown={event=>{
          if(event.key==="Enter")commit(text);
          if(event.key==="Escape"){
            updateError("");
            setText(value===null||value===undefined?"":String(value));
            setFocused(false);
          }
        }}
      />
      <span className="arithmetic-input-hint" title="Supports +, -, *, /, %, and parentheses"><i className="bi bi-calculator"></i></span>
      {inputError&&(
        <div id={errorId} className="form-text text-danger arithmetic-input-error" role="alert">
          {inputError}
        </div>
      )}
    </div>
  );
}
