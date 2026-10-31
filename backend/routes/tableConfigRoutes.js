const express=require("express");
const mongoose=require("mongoose");
const TableConfiguration=require("../models/TableConfiguration");
const TableCustomValue=require("../models/TableCustomValue");
const auth=require("../middleware/auth");

const router=express.Router();

const owner=req=>String(req.user.id);
const cleanString=(value,max)=>String(value??"").trim().slice(0,max);
const FIELD_TYPES=["text","textarea","number","currency","date","datetime","boolean","select","multiselect","reference"];
const LOOKUP_MODELS={
  clients:require("../models/Client"),
  products:require("../models/Product"),
  orders:require("../models/Order2"),
  expenses:require("../models/Expense")
};
const LOOKUP_RESOURCES=Object.keys(LOOKUP_MODELS);

const isValidCalendarDate=value=>{
  const match=String(value||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match)return false;
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const date=new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year
    &&date.getUTCMonth()+1===month
    &&date.getUTCDate()===day;
};

const normalizeCustomValue=(field,value)=>{
  const empty=value===null||value===undefined
    ||(typeof value==="string"&&!value.trim())
    ||(field.fieldType==="multiselect"&&Array.isArray(value)&&value.length===0);
  if(empty)return null;

  switch(field.fieldType){
    case "number":
    case "currency":{
      if(typeof value==="boolean"||(typeof value==="object"&&value!==null)){
        throw new Error("Value must be a valid number.");
      }
      const raw=String(value).trim();
      if(!raw) return null;
      const number=Number(raw);
      if(!Number.isFinite(number))throw new Error("Value must be a valid number.");
      return Math.round((number+Number.EPSILON)*100)/100;
    }
    case "boolean":{
      if(value===true||value===1||value==="1"||String(value).toLowerCase()==="true")return true;
      if(value===false||value===0||value==="0"||String(value).toLowerCase()==="false")return false;
      throw new Error("Choose Yes or No for this field.");
    }
    case "select":{
      if(typeof value==="object")throw new Error("Choose one valid option.");
      const selected=cleanString(value,200);
      const allowed=new Set((field.options||[]).map(option=>String(option?.value??option)));
      if(!allowed.has(selected))throw new Error("Please choose a valid option.");
      return selected;
    }
    case "multiselect":{
      if(!Array.isArray(value))throw new Error("Choose one or more valid options.");
      if(value.length>100)throw new Error("Choose no more than 100 options.");
      const allowed=new Set((field.options||[]).map(option=>String(option?.value??option)));
      const selected=[...new Set(value.map(item=>{
        if(item&&typeof item==="object")throw new Error("Choose valid options.");
        return cleanString(item,200);
      }).filter(Boolean))];
      if(selected.some(item=>!allowed.has(item)))throw new Error("Please choose valid options.");
      return selected;
    }
    case "date":{
      const date=cleanString(value,40);
      if(!isValidCalendarDate(date))throw new Error("Enter a valid date.");
      return date;
    }
    case "datetime":{
      const raw=cleanString(value,80);
      const localMatch=raw.match(/^(\d{4}-\d{2}-\d{2})[T ]([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,3}))?)?$/);
      const zonedMatch=raw.match(/^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)$/i);
      if((!localMatch&&!zonedMatch)
        ||!isValidCalendarDate((localMatch||zonedMatch)[1])
        ||Number.isNaN(new Date(raw).getTime())){
        throw new Error("Enter a valid date and time.");
      }
      return raw;
    }
    case "reference":{
      if(typeof value!=="string"&&!(value instanceof mongoose.Types.ObjectId)){
        throw new Error("Choose an existing record from your business account.");
      }
      const id=cleanString(value,100);
      if(!mongoose.isValidObjectId(id))throw new Error("Choose an existing record from your business account.");
      return id;
    }
    default:{
      if(typeof value==="object")throw new Error("Enter a text value.");
      return cleanString(value,5000);
    }
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
    if(kind==="custom"&&fieldType==="reference"&&!LOOKUP_RESOURCES.includes(cleanString(raw?.dataSource?.resource,80))){
      throw new Error("Choose whether this column links to a customer, product, invoice or expense.");
    }

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
        resource:LOOKUP_RESOURCES.includes(cleanString(raw.dataSource.resource,80))
          ?cleanString(raw.dataSource.resource,80)
          :"",
        valueField:cleanString(raw.dataSource.valueField||"_id",100),
        labelField:cleanString(raw.dataSource.labelField,100),
        searchField:cleanString(raw.dataSource.searchField||raw.dataSource.labelField,100),
        multiple:Boolean(raw.dataSource.multiple)
      }:null,
      sourceKeys:kind==="merged"?sourceKeys:[],
      separator:kind==="merged"?String(raw?.separator??" ").replace(/[\r\n\t]/g," ").slice(0,40):" ",
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
    // Resetting a view must never erase data entered into custom columns.
    // Old values remain available in the saved-value store if the layout is
    // restored later or the business needs to recover a removed column.
    await TableConfiguration.deleteOne({createdBy:owner(req),tableKey});
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
    if(field.fieldType==="reference"&&value!==null){
      const model=LOOKUP_MODELS[field.dataSource?.resource];
      const exists=model&&await model.exists({
        _id:value,
        createdBy:new mongoose.Types.ObjectId(owner(req))
      });
      if(!exists)return res.status(400).json({message:"Choose a record that belongs to your business account."});
    }
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
module.exports.sanitizeColumns=sanitizeColumns;
module.exports.normalizeCustomValue=normalizeCustomValue;
