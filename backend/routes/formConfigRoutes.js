const express=require("express");
const mongoose=require("mongoose");
const FormConfiguration=require("../models/FormConfiguration");
const auth=require("../middleware/auth");

const router=express.Router();

const FIELD_TYPES=["text","textarea","number","currency","date","datetime","select","boolean"];
const SOURCES=["none","clients","products","orders","expenses","suppliers","machines"];
const OPERATORS=["equals","not_equals","contains","not_contains","greater_than","less_than","empty","not_empty"];
const ACTIONS=["show","hide","require","readonly"];
const owner=req=>String(req.user.id);
const cleanString=(value,max)=>String(value??"").trim().slice(0,max);

const sanitizeFields=fields=>{
  if(!Array.isArray(fields))throw new Error("fields must be an array.");

  const seen=new Set();
  return fields.slice(0,300).map((raw,index)=>{
    const key=cleanString(raw?.key,100);
    const label=cleanString(raw?.label||key,120);
    if(!key||!label)throw new Error("Every form field requires a key and label.");
    if(seen.has(key))throw new Error("Duplicate form field key: "+key);
    seen.add(key);

    const fieldType=FIELD_TYPES.includes(raw?.fieldType)?raw.fieldType:"text";
    const section=cleanString(raw?.section||"header",50);
    const width=Math.min(12,Math.max(1,Number(raw?.width)||6));
    const options=Array.isArray(raw?.options)
      ? [...new Set(raw.options.map(item=>cleanString(item,200)).filter(Boolean))].slice(0,100)
      : [];

    return {
      key,
      label,
      visible:raw?.visible!==false,
      required:Boolean(raw?.required),
      locked:Boolean(raw?.locked),
      custom:Boolean(raw?.custom),
      fieldType,
      width,
      order:Number.isFinite(Number(raw?.order))?Math.max(0,Number(raw.order)):index,
      section,
      options:fieldType==="select"?options:[],
      formula:fieldType==="number"||fieldType==="currency"?cleanString(raw?.formula,300):"",
      defaultValue:raw?.defaultValue??"",
      editable:raw?.editable!==false,
      readOnly:Boolean(raw?.readOnly),
      dataSource:{
        type:raw?.dataSource?.type==="lookup"&&SOURCES.includes(raw?.dataSource?.resource)?"lookup":"none",
        resource:SOURCES.includes(raw?.dataSource?.resource)?raw.dataSource.resource:"",
        valueField:cleanString(raw?.dataSource?.valueField||"_id",100),
        labelField:cleanString(raw?.dataSource?.labelField,100),
        searchField:cleanString(raw?.dataSource?.searchField,100),
        autoFill:Array.isArray(raw?.dataSource?.autoFill)?raw.dataSource.autoFill.slice(0,30).map(item=>({
          targetKey:cleanString(item?.targetKey,100),
          sourceKey:cleanString(item?.sourceKey,100)
        })).filter(item=>item.targetKey&&item.sourceKey):[]
      },
      conditions:Array.isArray(raw?.conditions)?raw.conditions.slice(0,20).map(item=>({
        action:ACTIONS.includes(item?.action)?item.action:"show",
        fieldKey:cleanString(item?.fieldKey,100),
        operator:OPERATORS.includes(item?.operator)?item.operator:"equals",
        value:cleanString(item?.value,300)
      })).filter(item=>item.fieldKey):[],
      validation:{
        min:Number.isFinite(Number(raw?.validation?.min))?Number(raw.validation.min):null,
        max:Number.isFinite(Number(raw?.validation?.max))?Number(raw.validation.max):null,
        pattern:cleanString(raw?.validation?.pattern,500)
      }
    };
  });
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

    const config=await FormConfiguration.findOneAndUpdate(
      {createdBy:new mongoose.Types.ObjectId(owner(req)),formKey},
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
