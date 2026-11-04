const mongoose=require("mongoose");
const Client=require("../models/Client");
const Product=require("../models/Product");
const Order=require("../models/Order2");
const Expense=require("../models/Expense");
const Calendar=require("../models/Calendar");
const CreditNote=require("../models/CreditNote");

const FIELD_KEY_PATTERN=/^[A-Za-z][A-Za-z0-9_-]{0,99}$/;
const TABLE_CUSTOM_FIELD_TARGETS=Object.freeze({
  "clients.list":{kind:"record",model:Client},
  "products.list":{kind:"record",model:Product},
  "expenses.list":{kind:"record",model:Expense},
  "calendar.events":{kind:"record",model:Calendar},
  "orders.list":{kind:"record",model:Order},
  "credit-notes.list":{kind:"record",model:CreditNote},
  "orders.payments":{kind:"subdocument",model:Order,arrayPath:"payments"},
  "credit-notes.items":{kind:"subdocument",model:Order,arrayPath:"subOrders"},
  "bulk-payments.selection":{kind:"record",model:Order},
  "bulk-payments.allocation-preview":{kind:"record",model:Order},
  "sales-analytics.orders":{kind:"record",model:Order},
  "sales-analytics.period-orders":{kind:"record",model:Order},
  "sales-analytics.state-cities":{kind:"virtual"}
});

const getTableCustomFieldTarget=key=>TABLE_CUSTOM_FIELD_TARGETS[String(key||"").trim()]||null;
const validOwnerId=value=>mongoose.isValidObjectId(String(value||""))?new mongoose.Types.ObjectId(String(value)):null;
const validRowId=value=>mongoose.isValidObjectId(String(value||""))?new mongoose.Types.ObjectId(String(value)):null;

function toPlainMap(value){
  if(value instanceof Map||value?.$isMongooseMap===true
    ||(typeof value?.entries==="function"&&typeof value?.get==="function"))return Object.fromEntries(value.entries());
  return value&&typeof value==="object"&&!Array.isArray(value)?{...value}:{};
}

function addSelectedValues(result,rowKey,customFields,fieldKeys){
  const plain=toPlainMap(customFields),selected={};
  for(const key of fieldKeys)if(Object.prototype.hasOwnProperty.call(plain,key))selected[key]=plain[key];
  if(Object.keys(selected).length)result.set(String(rowKey),selected);
}

async function tableCustomFieldRowExists({tableKey,rowKey,ownerId}){
  const target=getTableCustomFieldTarget(tableKey);
  const ownerObjectId=validOwnerId(ownerId);
  const rowObjectId=validRowId(rowKey);
  if(!target||target.kind==="virtual"||!ownerObjectId||!rowObjectId)return false;
  if(target.kind==="record")return Boolean(await target.model.exists({_id:rowObjectId,createdBy:ownerObjectId}));
  return Boolean(await target.model.exists({createdBy:ownerObjectId,[target.arrayPath]:{$elemMatch:{_id:rowObjectId}}}));
}

async function readTableRecordValues({tableKey,rowKeys,ownerId,fieldKeys=[]}){
  const target=getTableCustomFieldTarget(tableKey),result=new Map(),ownerObjectId=validOwnerId(ownerId);
  const keys=[...new Set(fieldKeys||[])].filter(key=>FIELD_KEY_PATTERN.test(String(key||"")));
  if(!target||target.kind==="virtual"||!ownerObjectId||!keys.length)return result;
  const ids=[...new Set((rowKeys||[]).map(String).filter(validRowId))];
  if(!ids.length)return result;
  const objectIds=ids.map(id=>new mongoose.Types.ObjectId(id)),idSet=new Set(ids);

  if(target.kind==="record"){
    const records=await target.model.find({createdBy:ownerObjectId,_id:{$in:objectIds}}).select("_id customFields").lean();
    for(const record of records)addSelectedValues(result,record._id,record.customFields,keys);
    return result;
  }

  const path=target.arrayPath;
  const records=await target.model.find({
    createdBy:ownerObjectId,[path+"._id"]:{$in:objectIds}
  }).select("_id "+path+"._id "+path+".customFields").lean();
  for(const record of records){
    for(const child of Array.isArray(record[path])?record[path]:[]){
      const id=String(child?._id||"");
      if(idSet.has(id))addSelectedValues(result,id,child.customFields,keys);
    }
  }
  return result;
}

async function writeTableRecordValue({tableKey,rowKey,fieldKey,value,ownerId,onlyIfMissing=false}){
  const target=getTableCustomFieldTarget(tableKey);
  const ownerObjectId=validOwnerId(ownerId),rowObjectId=validRowId(rowKey),key=String(fieldKey||"");
  if(!target||target.kind==="virtual")return {matchedCount:0,unsupported:true};
  if(!ownerObjectId||!rowObjectId||!FIELD_KEY_PATTERN.test(key))return {matchedCount:0,invalid:true};

  const filter={createdBy:ownerObjectId};
  let fieldPath;
  if(target.kind==="record"){
    filter._id=rowObjectId;
    fieldPath="customFields."+key;
    if(onlyIfMissing)filter[fieldPath]={$exists:false};
  }else{
    const elementMatch={_id:rowObjectId};
    fieldPath=target.arrayPath+".$.customFields."+key;
    if(onlyIfMissing)elementMatch["customFields."+key]={$exists:false};
    filter[target.arrayPath]={$elemMatch:elementMatch};
  }
  const update=value===null||value===undefined?{$unset:{[fieldPath]:1}}:{$set:{[fieldPath]:value}};
  const result=await target.model.updateOne(filter,update,{runValidators:true});
  return {matchedCount:Number(result.matchedCount??result.n??0),modifiedCount:Number(result.modifiedCount??result.nModified??0)};
}

async function migrateLegacyTableCustomValue(legacy,TableCustomValue){
  const tableKey=String(legacy?.tableKey||""),rowKey=String(legacy?.rowKey||""),fieldKey=String(legacy?.fieldKey||"");
  const target=getTableCustomFieldTarget(tableKey);
  if(!target||target.kind==="virtual")return {status:"unsupported"};
  if(!validOwnerId(legacy?.createdBy)||!validRowId(rowKey)||!FIELD_KEY_PATTERN.test(fieldKey))return {status:"invalid"};
  const remove=()=>TableCustomValue.deleteOne({_id:legacy._id,createdBy:legacy.createdBy});
  const current=await readTableRecordValues({tableKey,rowKeys:[rowKey],ownerId:legacy.createdBy,fieldKeys:[fieldKey]});
  if(Object.prototype.hasOwnProperty.call(current.get(rowKey)||{},fieldKey)){await remove();return {status:"already-present"};}
  if(legacy.value===null||legacy.value===undefined){await remove();return {status:"empty"};}
  const saved=await writeTableRecordValue({tableKey,rowKey,fieldKey,value:legacy.value,ownerId:legacy.createdBy,onlyIfMissing:true});
  if(saved.matchedCount>0){await remove();return {status:"migrated"};}
  const after=await readTableRecordValues({tableKey,rowKeys:[rowKey],ownerId:legacy.createdBy,fieldKeys:[fieldKey]});
  if(Object.prototype.hasOwnProperty.call(after.get(rowKey)||{},fieldKey)){await remove();return {status:"already-present"};}
  return {status:"missing-record"};
}

module.exports={FIELD_KEY_PATTERN,TABLE_CUSTOM_FIELD_TARGETS,getTableCustomFieldTarget,tableCustomFieldRowExists,toPlainMap,readTableRecordValues,writeTableRecordValue,migrateLegacyTableCustomValue};
