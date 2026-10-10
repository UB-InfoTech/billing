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

const LEGACY_DEFAULT_LABELS={
  "orders.form":{
    orderDate:["Bill Date"],
    lrNo:["LR No."],
    paymentTerms:["Payment Terms"],
    challanNumber:["Challan No."]
  },
  "clients.form":{
    name:["Client Name","Customer Name"],
    companyName:["Customer / Company Name","Company Name"],
    paymentTerms:["Payment Terms"],
    discountRate:["Discount Rate"],
    accountStatus:["Account Status"]
  },
  "products.form":{
    rate:["Rate","Selling Rate"]
  },
  "expenses.form":{
    title:["Title"],
    description:["Description"],
    category:["Category"],
    paymentMethod:["Payment Method"]
  }
};

const resolveSavedLabel=(formKey,field,savedField)=>{
  const previousDefaults=LEGACY_DEFAULT_LABELS[formKey]?.[field.key]||[];
  if(previousDefaults.includes(savedField.label))return field.label;
  return savedField.label||field.label;
};

export const mergeFormFields=(baseFields,savedFields,formKey="")=>{
  const normalize=(field,index)=>({
    key:field.key,
    label:field.label||field.key,
    helpText:String(field.helpText||""),
    visible:field.visible!==false,
    required:Boolean(field.required),
    locked:Boolean(field.locked),
    system:Boolean(field.system),
    custom:Boolean(field.custom),
    fieldType:field.fieldType||"text",
    width:Math.min(12,Math.max(1,Number(field.width)||6)),
    order:Number.isFinite(Number(field.order))?Number(field.order):index,
    section:field.section||"General",
    options:Array.isArray(field.options)?field.options.slice():[],
    formula:["number","currency"].includes(field.fieldType)?String(field.formula||""):"",
    defaultValue:field.defaultValue??"",
    editable:field.editable!==false,
    readOnly:Boolean(field.readOnly||field.formula),
    disabled:Boolean(field.disabled),
    dataSource:field.dataSource&&typeof field.dataSource==="object"?{
      type:field.dataSource.type==="lookup"?"lookup":"none",
      resource:field.dataSource.resource||"",
      multiple:Boolean(field.dataSource.multiple),
      valueField:field.dataSource.valueField||"_id",
      labelField:field.dataSource.labelField||"",
      searchField:field.dataSource.searchField||"",
      autoFill:Array.isArray(field.dataSource.autoFill)?field.dataSource.autoFill.slice():[]
    }:{type:"none",resource:"",valueField:"_id",labelField:"",searchField:"",autoFill:[]},
    conditions:Array.isArray(field.conditions)?field.conditions.slice():[],
    validation:field.validation&&typeof field.validation==="object"?{min:field.validation.min??null,max:field.validation.max??null,pattern:field.validation.pattern||""}:{min:null,max:null,pattern:""}
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
      label:resolveSavedLabel(formKey,field,savedField),
      helpText:String(savedField.helpText??field.helpText??""),
      visible:field.locked?true:savedField.visible!==false,
      required:Object.prototype.hasOwnProperty.call(savedField,"required")?Boolean(savedField.required):field.required,
      fieldType:savedField.fieldType||field.fieldType,
      width:Math.min(12,Math.max(1,Number(savedField.width)||field.width)),
      order:Number.isFinite(Number(savedField.order))?Number(savedField.order):index,
      section:savedField.section||field.section,
      options:Array.isArray(savedField.options)?savedField.options.slice():field.options,
      formula:["number","currency"].includes(savedField.fieldType||field.fieldType)?String(savedField.formula||""):"",
      defaultValue:savedField.defaultValue??field.defaultValue,
      editable:savedField.editable!==false,
      readOnly:Boolean(savedField.readOnly||savedField.formula),
      disabled:Boolean(savedField.disabled),
      dataSource:savedField.dataSource&&typeof savedField.dataSource==="object"?{...field.dataSource,...savedField.dataSource,multiple:Boolean(savedField.dataSource.multiple)}:field.dataSource,
      conditions:Array.isArray(savedField.conditions)?savedField.conditions:field.conditions,
      validation:savedField.validation||field.validation,
      custom:false,
      system:Boolean(field.system)
    };
  });

  saved.forEach(savedField=>{
    if(!savedField?.key||baseKeys.has(savedField.key)||!savedField.custom)return;
    merged.push(normalize({...savedField,custom:true},merged.length));
  });

  return merged.sort((a,b)=>(a.order??0)-(b.order??0)).map((field,index)=>({...field,order:index}));
};


export const getFieldPath=(record,path)=>{
  if(record==null||!path)return "";
  return String(path).split(".").reduce((value,key)=>value==null?undefined:value[key],record);
};

export const fieldConditionMatches=(condition,values)=>{
  const current=values?.[condition?.fieldKey];
  const expected=condition?.value??"";
  const text=String(current??"").toLowerCase();
  const target=String(expected).toLowerCase();
  switch(condition?.operator){
    case "not_equals":return text!==target;
    case "contains":return text.includes(target);
    case "not_contains":return !text.includes(target);
    case "greater_than":return Number(current)>Number(expected);
    case "less_than":return Number(current)<Number(expected);
    case "empty":return text.trim()==="";
    case "not_empty":return text.trim()!=="";
    default:return text===target;
  }
};

export const getFieldState=(field,values)=>{
  const conditions=Array.isArray(field?.conditions)?field.conditions:[];
  let visible=field?.visible!==false;
  let required=Boolean(field?.required);
  let readOnly=Boolean(field?.readOnly||field?.editable===false);
  let disabled=Boolean(field?.disabled);

  const showRules=conditions.filter(condition=>condition.action==="show");
  const hideRules=conditions.filter(condition=>condition.action==="hide");

  if(showRules.length)visible=showRules.every(condition=>fieldConditionMatches(condition,values));
  if(hideRules.some(condition=>fieldConditionMatches(condition,values)))visible=false;

  conditions.forEach(condition=>{
    const matches=fieldConditionMatches(condition,values);
    if(!matches)return;
    if(condition.action==="require")required=true;
    if(condition.action==="readonly")readOnly=true;
    if(condition.action==="enable")disabled=false;
    if(condition.action==="disable")disabled=true;
  });

  return {visible,required,readOnly,disabled};
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
      setFields(mergeFormFields(baseFields,response.data?.fields,formKey));
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
      const merged=mergeFormFields(baseFields,response.data?.fields,formKey);
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
}export const hydrateConfiguredValues=(record,fields=[])=>{
  const source=record||{};
  const customFields=source.customFields&&typeof source.customFields==="object"
    ?{...source.customFields}
    :{};
  const next={...source,customFields};

  (fields||[]).filter(field=>field.custom).forEach(field=>{
    if(!Object.prototype.hasOwnProperty.call(next,field.key)){
      next[field.key]=customFields[field.key]??field.defaultValue??"";
    }
  });

  return next;
};

export const applyAutoFill=(field,record,values)=>{
  const mappings=Array.isArray(field?.dataSource?.autoFill)?field.dataSource.autoFill:[];
  if(!mappings.length)return values||{};
  const next={...(values||{}),customFields:{...((values||{}).customFields||{})}};

  const readPath=(source,path)=>String(path||"").split(".").reduce((value,key)=>value==null?undefined:value[key],source);

  field.dataSource.autoFill.forEach(mapping=>{
    const targetKey=String(mapping?.targetKey||"").trim();
    if(!targetKey)return;
    const value=record?readPath(record,mapping?.sourceKey):"";
    next[targetKey]=value??"";
    if(targetKey.startsWith("custom_")||Object.prototype.hasOwnProperty.call(next.customFields,targetKey)){
      next.customFields[targetKey]=value??"";
    }
  });

  return next;
};

export const buildConfiguredDefaults=(baseValues={},fields=[])=>{
  const next={...(baseValues||{}),customFields:{...((baseValues||{}).customFields||{})}};
  (fields||[]).forEach(field=>{
    const hasExisting=Object.prototype.hasOwnProperty.call(next,field.key)
      && next[field.key]!==null
      && next[field.key]!==undefined
      && next[field.key]!=="";
    if(hasExisting)return;
    const defaultValue=field.defaultValue;
    if(defaultValue!==undefined&&defaultValue!==null&&defaultValue!==""){
      next[field.key]=Array.isArray(defaultValue)?defaultValue.slice():defaultValue;
      if(field.custom)next.customFields[field.key]=next[field.key];
    }
  });
  return next;
};

export const syncConfiguredCustomFields=(values,fields=[])=>{
  const next={...(values||{}),customFields:{...((values||{}).customFields||{})}};
  (fields||[]).filter(field=>field.custom).forEach(field=>{
    if(Object.prototype.hasOwnProperty.call(next,field.key)){
      next.customFields[field.key]=next[field.key];
    }
  });
  return next;
};

;