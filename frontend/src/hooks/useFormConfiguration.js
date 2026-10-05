import {evaluateArithmeticExpression} from "../utils/arithmetic";
import {useCallback,useEffect,useMemo,useState} from "react";
import axios from "axios";

const apiBase=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const authConfig=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});

export const applyFormulas=(fields,values)=>{
  let next={...(values||{})};
  const formulaFields=(fields||[]).filter(field=>field.formula&&["number","currency"].includes(field.fieldType));
  for(let pass=0;pass<Math.max(1,formulaFields.length);pass+=1){
    let changed=false;
    formulaFields.forEach(field=>{
      try{
        const result=evaluateArithmeticExpression(field.formula,next);
        if(next[field.key]!==result){next[field.key]=result;changed=true;}
      }catch{
        // Keep the last valid value while the user is editing.
      }
    });
    if(!changed)break;
  }
  return next;
};

export const mergeFormFields=(baseFields,savedFields)=>{
  const normalize=(field,index)=>({
    key:field.key,
    label:field.label||field.key,
    visible:field.visible!==false,
    required:Boolean(field.required),
    locked:Boolean(field.locked),
    custom:Boolean(field.custom),
    fieldType:field.fieldType||"text",
    width:Math.min(12,Math.max(1,Number(field.width)||6)),
    order:Number.isFinite(Number(field.order))?Number(field.order):index,
    section:field.section||"General",
    options:Array.isArray(field.options)?field.options.slice():[],
    formula:["number","currency"].includes(field.fieldType)?String(field.formula||""):"",
    defaultValue:field.defaultValue??""
  });

  const base=(baseFields||[]).map(normalize);
  const saved=Array.isArray(savedFields)?savedFields:[];
  const baseKeys=new Set(base.map(field=>field.key));
  const byKey=new Map(saved.map(field=>[field.key,field]));

  const merged=base.map((field,index)=>{
    const savedField=byKey.get(field.key);
    if(!savedField)return {...field,order:index};
    return {
      ...field,
      label:savedField.label||field.label,
      visible:field.locked?true:savedField.visible!==false,
      required:Object.prototype.hasOwnProperty.call(savedField,"required")?Boolean(savedField.required):field.required,
      fieldType:savedField.fieldType||field.fieldType,
      width:Math.min(12,Math.max(1,Number(savedField.width)||field.width)),
      order:Number.isFinite(Number(savedField.order))?Number(savedField.order):index,
      section:savedField.section||field.section,
      options:Array.isArray(savedField.options)?savedField.options.slice():field.options,
      formula:["number","currency"].includes(savedField.fieldType||field.fieldType)?String(savedField.formula||""):"",
      defaultValue:savedField.defaultValue??field.defaultValue,
      custom:false
    };
  });

  saved.forEach(savedField=>{
    if(!savedField?.key||baseKeys.has(savedField.key)||!savedField.custom)return;
    merged.push(normalize({...savedField,custom:true},merged.length));
  });

  return merged.sort((a,b)=>(a.order??0)-(b.order??0)).map((field,index)=>({...field,order:index}));
};

export function useFormConfiguration(formKey,baseFields){
  const baseSignature=useMemo(()=>JSON.stringify(baseFields.map(field=>({key:field.key,label:field.label,fieldType:field.fieldType,section:field.section}))),[baseFields]);
  const [fields,setFields]=useState(()=>mergeFormFields(baseFields,[]));
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const load=useCallback(async()=>{
    try{
      setLoading(true);setError("");
      const response=await axios.get(`${apiBase}/api/form-config/${encodeURIComponent(formKey)}`,authConfig());
      setFields(mergeFormFields(baseFields,response.data?.fields));
    }catch(loadError){
      setFields(mergeFormFields(baseFields,[]));
      setError(loadError.response?.data?.message||"Unable to load form settings.");
    }finally{setLoading(false);}
  },[formKey,baseSignature,baseFields]);
  useEffect(()=>{load();},[load]);
  const save=useCallback(async(nextFields)=>{
    try{
      setSaving(true);setError("");
      const response=await axios.put(`${apiBase}/api/form-config/${encodeURIComponent(formKey)}`,{fields:nextFields.map((field,index)=>({...field,order:index}))},authConfig());
      const merged=mergeFormFields(baseFields,response.data?.fields);
      setFields(merged);return merged;
    }catch(saveError){setError(saveError.response?.data?.message||"Unable to save form settings.");throw saveError;}
    finally{setSaving(false);}
  },[formKey,baseSignature,baseFields]);
  const reset=useCallback(async()=>{
    try{
      setSaving(true);setError("");
      await axios.delete(`${apiBase}/api/form-config/${encodeURIComponent(formKey)}`,authConfig());
      const defaults=mergeFormFields(baseFields,[]);setFields(defaults);return defaults;
    }catch(resetError){setError(resetError.response?.data?.message||"Unable to reset form settings.");throw resetError;}
    finally{setSaving(false);}
  },[formKey,baseSignature,baseFields]);
  return {fields,setFields,loading,saving,error,setError,save,reset,reload:load};
};