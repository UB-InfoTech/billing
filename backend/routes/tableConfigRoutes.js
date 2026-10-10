const express=require("express");
const mongoose=require("mongoose");
const TableConfiguration=require("../models/TableConfiguration");
const TableCustomValue=require("../models/TableCustomValue");
const auth=require("../middleware/auth");

const router=express.Router();

const owner=req=>String(req.user.id);
const cleanString=(value,max)=>String(value??"").trim().slice(0,max);
const FIELD_TYPES=["text","textarea","number","currency","date","datetime","boolean","select","multiselect","reference"];

const normalizeCustomValue=(field,value)=>{
  if(value===null||value===undefined||value===""||(Array.isArray(value)&&value.length===0))return null;
  switch(field.fieldType){
    case "number":
    case "currency":{
      const number=Number(value);
      if(!Number.isFinite(number))throw new Error("Value must be a valid number.");
      return Math.round(number*100)/100;
    }
    case "boolean":
      return value===true||value==="true"||value===1||value==="1";
    case "multiselect":{
      if(!Array.isArray(value))throw new Error("Choose one or more valid options.");
      const allowed=new Set((field.options||[]).map(option=>String(option?.value??option)));
      const selected=[...new Set(value.map(item=>cleanString(item,200)).filter(Boolean))];
      if(selected.some(item=>!allowed.has(item)))throw new Error("Please choose valid options.");
      return selected;
    }
    default:
      return cleanString(value,5000);
  }
};

const sanitizeColumns=(columns)=>{
  if(!Array.isArray(columns))throw new Error("columns must be an array.");
  const seen=new Set();
  return columns.slice(0,200).map((raw,index)=>{
    const key=cleanString(raw?.key,100);
    const label=cleanString(raw?.label||key,120);
    if(!key||!label)throw new Error("Every table column requires a key and label.");
    if(seen.has(key))throw new Error("Duplicate table column key: "+key);
    seen.add(key);

    const kind=["merged","custom"].includes(raw?.kind)?raw.kind:"field";
    const fieldType=FIELD_TYPES.includes(raw?.fieldType)?raw.fieldType:"text";
    const sourceKeys=Array.isArray(raw?.sourceKeys)
      ? [...new Set(raw.sourceKeys.map(x=>cleanString(x,100)).filter(Boolean))].slice(0,30)
      : [];
    const options=Array.isArray(raw?.options)
      ? raw.options.slice(0,100).map(option=>{
          if(option&&typeof option==="object"){
            const value=cleanString(option.value??option.label,200);
            const label=cleanString(option.label??option.value,200);
            return {value,label};
          }
          const value=cleanString(option,200);
          return {value,label:value};
        }).filter(option=>option.value)
      : [];

    if(kind==="merged"&&sourceKeys.length<2)throw new Error("Merged columns must contain at least two source fields.");
    if(kind==="custom"&&["select","multiselect"].includes(fieldType)&&options.length===0)throw new Error("Add at least one choice for this custom column.");

    return{
      key,
      label,
      visible:raw?.visible!==false,
      locked:Boolean(raw?.locked),
      kind,
      fieldType:kind==="custom"?fieldType:"text",
      options:kind==="custom"&&["select","multiselect"].includes(fieldType)?options:[],
      defaultValue:kind==="custom"?raw?.defaultValue??"": "",
      editable:raw?.editable!==false,
      dataSource:kind==="custom"&&raw?.dataSource&&typeof raw.dataSource==="object"?{
        type:raw.dataSource.type==="lookup"?"lookup":"none",
        resource:cleanString(raw.dataSource.resource,80),
        valueField:cleanString(raw.dataSource.valueField||"_id",100),
        labelField:cleanString(raw.dataSource.labelField,100),
        multiple:Boolean(raw.dataSource.multiple)
      }:null,
      sourceKeys:kind==="merged"?sourceKeys:[],
      separator:kind==="merged"?cleanString(raw?.separator??" ",40):" ",
      order:Number.isFinite(Number(raw?.order))?Math.max(0,Number(raw.order)):index,
      width:Math.min(12,Math.max(0,Number(raw?.width)||0))
    };
  });
};

router.get("/:tableKey",auth,async(req,res)=>{
  try{
    const tableKey=cleanString(req.params.tableKey,120);
    if(!tableKey)return res.status(400).json({message:"Table key is required."});
    const config=await TableConfiguration.findOne({createdBy:owner(req),tableKey}).lean();
    return res.json(config||{tableKey,columns:[]});
  }catch(error){
    return res.status(500).json({message:error.message});
  }
});

router.put("/:tableKey",auth,async(req,res)=>{
  try{
    const tableKey=cleanString(req.params.tableKey,120);
    if(!tableKey)return res.status(400).json({message:"Table key is required."});
    const columns=sanitizeColumns(req.body?.columns);
    const config=await TableConfiguration.findOneAndUpdate(
      {createdBy:new mongoose.Types.ObjectId(owner(req)),tableKey},
      {$set:{columns}},
      {new:true,upsert:true,runValidators:true,setDefaultsOnInsert:true}
    ).lean();
    return res.json(config);
  }catch(error){
    return res.status(400).json({message:error.message});
  }
});

router.delete("/:tableKey",auth,async(req,res)=>{
  try{
    const tableKey=cleanString(req.params.tableKey,120);
    if(!tableKey)return res.status(400).json({message:"Table key is required."});
    await Promise.all([
      TableConfiguration.deleteOne({createdBy:owner(req),tableKey}),
      TableCustomValue.deleteMany({createdBy:owner(req),tableKey})
    ]);
    return res.json({message:"Table configuration reset successfully."});
  }catch(error){
    return res.status(500).json({message:error.message});
  }
});

router.get("/:tableKey/values",auth,async(req,res)=>{
  try{
    const tableKey=cleanString(req.params.tableKey,120);
    const rawRowKeys=String(req.query.rowKeys||"");
    const rowKeys=rawRowKeys.split(",").map(x=>cleanString(x,200)).filter(Boolean).slice(0,500);
    if(!rowKeys.length)return res.json({values:[]});
    const values=await TableCustomValue.find({createdBy:owner(req),tableKey,rowKey:{$in:rowKeys}}).lean();
    return res.json({values});
  }catch(error){
    return res.status(400).json({message:error.message});
  }
});

router.put("/:tableKey/values",auth,async(req,res)=>{
  try{
    const tableKey=cleanString(req.params.tableKey,120);
    const rowKey=cleanString(req.body?.rowKey,200);
    const fieldKey=cleanString(req.body?.fieldKey,100);
    if(!rowKey||!fieldKey)return res.status(400).json({message:"rowKey and fieldKey are required."});

    const config=await TableConfiguration.findOne({createdBy:owner(req),tableKey}).lean();
    const field=config?.columns?.find(column=>column.key===fieldKey&&column.kind==="custom");
    if(!field)return res.status(404).json({message:"Custom field was not found."});

    if(field.editable===false)return res.status(400).json({message:"This column is read only."});
    if(["select","multiselect"].includes(field.fieldType)){
      const incoming=Array.isArray(req.body?.value)?req.body.value:[req.body?.value];
      const valid=incoming.filter(value=>value!==null&&value!=="").every(value=>field.options.some(option=>String(option?.value??option)===cleanString(value,200)));
      if(!valid)return res.status(400).json({message:"Please choose a valid option."});
    }

    const value=normalizeCustomValue(field,req.body?.value);
    if(value===null){
      await TableCustomValue.deleteOne({createdBy:owner(req),tableKey,rowKey,fieldKey});
      return res.json({message:"Value cleared.",value:null});
    }

    const saved=await TableCustomValue.findOneAndUpdate(
      {createdBy:owner(req),tableKey,rowKey,fieldKey},
      {$set:{value}},
      {upsert:true,new:true,setDefaultsOnInsert:true,runValidators:true}
    ).lean();
    return res.json(saved);
  }catch(error){
    return res.status(400).json({message:error.message});
  }
});

module.exports=router;
