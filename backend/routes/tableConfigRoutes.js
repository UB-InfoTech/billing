const express=require("express");
const mongoose=require("mongoose");
const TableConfiguration=require("../models/TableConfiguration");
const TableCustomValue=require("../models/TableCustomValue");
const auth=require("../middleware/auth");

const router=express.Router();

const owner=req=>String(req.user.id);
const cleanString=(value,max)=>String(value??"").trim().slice(0,max);
const FIELD_TYPES=["text","textarea","number","currency","date","datetime","boolean","select"];

const normalizeCustomValue=(field,value)=>{
  if(value===null||value===undefined||value==="")return null;
  switch(field.fieldType){
    case "number":
    case "currency":{
      const number=Number(value);
      if(!Number.isFinite(number))throw new Error("Value must be a valid number.");
      return Math.round(number*100)/100;
    }
    case "boolean":
      return value===true||value==="true"||value===1||value==="1";
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
      ? [...new Set(raw.options.map(x=>cleanString(x,200)).filter(Boolean))].slice(0,100)
      : [];

    if(kind==="merged"&&sourceKeys.length<2)throw new Error("Merged columns must contain at least two source fields.");
    if(kind==="custom"&&fieldType==="select"&&options.length===0)throw new Error("Select custom fields require at least one option.");

    return{
      key,
      label,
      visible:raw?.visible!==false,
      locked:Boolean(raw?.locked),
      kind,
      fieldType:kind==="custom"?fieldType:"text",
      options:kind==="custom"&&fieldType==="select"?options:[],
      defaultValue:kind==="custom"?raw?.defaultValue??"": "",
      sourceKeys:kind==="merged"?sourceKeys:[],
      separator:kind==="merged"?cleanString(raw?.separator??" ",40):" ",
      order:Number.isFinite(Number(raw?.order))?Math.max(0,Number(raw.order)):index
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

    if(field.fieldType==="select"&&req.body?.value!==null&&req.body?.value!==""&&!field.options.includes(cleanString(req.body?.value,200))){
      return res.status(400).json({message:"Please select a valid option."});
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
