const express=require("express");
const mongoose=require("mongoose");
const FormConfiguration=require("../models/FormConfiguration");
const auth=require("../middleware/auth");

const router=express.Router();

const FIELD_TYPES=["text","textarea","number","currency","date","datetime","select","multiselect","boolean","email","phone","url","reference"];
const SOURCES=["none","clients","products","orders","expenses","suppliers","machines","users"];
const OPERATORS=["equals","not_equals","contains","not_contains","greater_than","less_than","empty","not_empty"];
const ACTIONS=["show","hide","require","readonly","enable","disable"];
const owner=req=>String(req.user.id);
const cleanString=(value,max)=>String(value??"").trim().slice(0,max);

const normalizeOptions=options=>{
  if(!Array.isArray(options))return [];
  const seen=new Set();
  return options.slice(0,100).map(raw=>{
    if(raw&&typeof raw==="object"){
      const value=cleanString(raw.value??raw.label,200);
      const label=cleanString(raw.label??raw.value,200);
      return {value,label};
    }
    const value=cleanString(raw,200);
    return {value,label:value};
  }).filter(option=>{
    if(!option.value||seen.has(option.value))return false;
    seen.add(option.value);
    return true;
  });
};

const formulaReferences=formula=>[...new Set(String(formula||"").match(/[A-Za-z_][A-Za-z0-9_]*/g)||[])];

const validateFormulaGraph=fields=>{
  const byKey=new Map(fields.map(field=>[field.key,field]));
  const graph=new Map();

  fields.forEach(field=>{
    if(!field.formula)return;
    const refs=formulaReferences(field.formula);
    refs.forEach(ref=>{
      if(!byKey.has(ref)){
        throw new Error("The calculation for \""+field.label+"\" refers to a field that is no longer available.");
      }
    });
    graph.set(field.key,refs.filter(ref=>byKey.get(ref)?.formula));
  });

  const visiting=new Set();
  const visited=new Set();
  const walk=key=>{
    if(visiting.has(key)){
      const field=byKey.get(key);
      throw new Error("The calculation for \""+(field?.label||"this field")+"\" creates a circular calculation. Choose a different field.");
    }
    if(visited.has(key))return;
    visiting.add(key);
    (graph.get(key)||[]).forEach(walk);
    visiting.delete(key);
    visited.add(key);
  };

  graph.forEach((_,key)=>walk(key));
};

const sanitizeFields=fields=>{
  if(!Array.isArray(fields))throw new Error("Please provide a valid field list.");

  const seenKeys=new Set();
  const seenLabels=new Set();
  const result=fields.slice(0,300).map((raw,index)=>{
    const key=cleanString(raw?.key,100);
    const label=cleanString(raw?.label||key,120);
    const labelKey=label.toLowerCase();
    if(!key||!label)throw new Error("Every field needs a name.");
    if(seenKeys.has(key))throw new Error("A field with this name already exists.");
    if(seenLabels.has(labelKey))throw new Error("A field with this name already exists.");
    seenKeys.add(key);
    seenLabels.add(labelKey);

    const fieldType=FIELD_TYPES.includes(raw?.fieldType)?raw.fieldType:"text";
    const custom=Boolean(raw?.custom);
    const system=Boolean(raw?.system);
    const visible=raw?.visible!==false;
    const required=Boolean(raw?.required);
    if(required&&!visible)throw new Error("\""+label+"\" cannot be required while it is hidden.");

    const section=cleanString(raw?.section||"General",50);
    const width=Math.min(12,Math.max(1,Number(raw?.width)||6));
    const options=normalizeOptions(raw?.options);

    let formula="";
    if(["number","currency"].includes(fieldType))formula=cleanString(raw?.formula,500);
    const formulaReadOnly=Boolean(formula);

    const resource=SOURCES.includes(raw?.dataSource?.resource)?raw.dataSource.resource:"";
    const dataSourceType=raw?.dataSource?.type==="lookup"&&resource?"lookup":"none";

    const conditions=Array.isArray(raw?.conditions)
      ?raw.conditions.slice(0,30).map(item=>({
        action:ACTIONS.includes(item?.action)?item.action:"show",
        fieldKey:cleanString(item?.fieldKey,100),
        operator:OPERATORS.includes(item?.operator)?item.operator:"equals",
        value:cleanString(item?.value,300)
      })).filter(item=>item.fieldKey)
      :[];

    return {
      key,
      label,
      visible,
      required,
      locked:Boolean(raw?.locked),
      system,
      custom,
      fieldType,
      width,
      order:Number.isFinite(Number(raw?.order))?Math.max(0,Number(raw.order)):index,
      section,
      options:["select","multiselect"].includes(fieldType)?options:[],
      formula,
      defaultValue:raw?.defaultValue??"",
      editable:formulaReadOnly?false:raw?.editable!==false,
      readOnly:formulaReadOnly||Boolean(raw?.readOnly),
      disabled:Boolean(raw?.disabled),
      dataSource:{
        type:dataSourceType,
        resource,
        valueField:cleanString(raw?.dataSource?.valueField||"_id",100),
        labelField:cleanString(raw?.dataSource?.labelField,100),
        searchField:cleanString(raw?.dataSource?.searchField,100),
        multiple:Boolean(raw?.dataSource?.multiple),
        autoFill:Array.isArray(raw?.dataSource?.autoFill)
          ?raw.dataSource.autoFill.slice(0,30).map(item=>({
            targetKey:cleanString(item?.targetKey,100),
            sourceKey:cleanString(item?.sourceKey,100)
          })).filter(item=>item.targetKey&&item.sourceKey)
          :[]
      },
      conditions,
      validation:{
        min:Number.isFinite(Number(raw?.validation?.min))?Number(raw.validation.min):null,
        max:Number.isFinite(Number(raw?.validation?.max))?Number(raw.validation.max):null,
        pattern:cleanString(raw?.validation?.pattern,500)
      }
    };
  });

  const byKey=new Map(result.map(field=>[field.key,field]));
  result.forEach(field=>{
    field.conditions=field.conditions.filter(condition=>byKey.has(condition.fieldKey));
    field.dataSource.autoFill=field.dataSource.autoFill.filter(mapping=>byKey.has(mapping.targetKey));
  });

  validateFormulaGraph(result);
  return result;
};

router.get("/:formKey",auth,async(req,res)=>{
  try{
    const formKey=cleanString(req.params.formKey,120);
    if(!formKey)return res.status(400).json({message:"Form key is required."});
    const config=await FormConfiguration.findOne({createdBy:owner(req),formKey}).lean();
    return res.json(config||{formKey,fields:[]});
  }catch(error){
    return res.status(500).json({message:error.message});
  }
});

router.put("/:formKey",auth,async(req,res)=>{
  try{
    const formKey=cleanString(req.params.formKey,120);
    if(!formKey)return res.status(400).json({message:"Form key is required."});
    const fields=sanitizeFields(req.body?.fields);

    const ownerId=new mongoose.Types.ObjectId(owner(req));
    const existing=await FormConfiguration.findOne({createdBy:ownerId,formKey}).lean();

    if(existing){
      const nextKeys=new Set(fields.map(field=>field.key));
      const removed=(existing.fields||[]).filter(field=>!nextKeys.has(field.key));

      for(const removedField of removed){
        const dependent=fields.find(field=>{
          const formulaRefs=formulaReferences(field.formula);
          const conditionRefs=(field.conditions||[]).map(condition=>condition.fieldKey);
          const autoFillTargets=(field.dataSource?.autoFill||[]).map(mapping=>mapping.targetKey);
          return formulaRefs.includes(removedField.key)
            ||conditionRefs.includes(removedField.key)
            ||autoFillTargets.includes(removedField.key);
        });
        if(dependent){
          throw new Error("\""+removedField.label+"\" is still used by \""+dependent.label+"\". Remove that rule or calculation first.");
        }
      }
    }

    const config=await FormConfiguration.findOneAndUpdate(
      {createdBy:ownerId,formKey},
      {$set:{fields}},
      {new:true,upsert:true,runValidators:true,setDefaultsOnInsert:true}
    ).lean();

    return res.json(config);
  }catch(error){
    return res.status(400).json({message:error.message});
  }
});

router.delete("/:formKey",auth,async(req,res)=>{
  try{
    const formKey=cleanString(req.params.formKey,120);
    await FormConfiguration.deleteOne({createdBy:owner(req),formKey});
    return res.json({message:"Form configuration reset successfully."});
  }catch(error){
    return res.status(500).json({message:error.message});
  }
});

module.exports=router;
