const express=require("express");
const mongoose=require("mongoose");
const Event=require("../models/Calendar");
const auth=require("../middleware/auth");
const {applyWorkflows}=require("../utils/workflowEngine");
const {buildCalendarOverlapQuery}=require("../utils/calendarDateRange");
const {normalizeCalendarEventInput}=require("../utils/calendarEventInput");
const {
  loadConfiguredFormFields,
  calculateConfiguredCustomFields,
  hasConfiguredCustomCalculations
}=require("../utils/customFieldCalculations");
const {
  prepareConfiguredFormValues,
  validateConfiguredFormValues
}=require("../utils/configuredFormValidation");

const router=express.Router();
const owner=req=>req.user.id;
const cleanCustomFields=(value,current={})=>{
  let parsed=value;
  if(typeof parsed==="string"){
    try{parsed=JSON.parse(parsed||"{}");}
    catch{throw calendarValidationError("Custom event fields are not valid.");}
  }
  if(parsed===undefined)return {...current};
  if(parsed instanceof Map||parsed?.$isMongooseMap===true
    ||(typeof parsed?.entries==="function"&&typeof parsed?.get==="function")){
    parsed=Object.fromEntries(parsed.entries());
  }
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)){
    throw calendarValidationError("Custom event fields are not valid.");
  }
  const entries=Object.entries(parsed);
  if(entries.length>100)throw calendarValidationError("An event can have no more than 100 custom fields.");
  const result={...current};
  for(const [rawKey,value] of entries){
    const key=String(rawKey).trim();
    if(!key||key.length>100||["__proto__","prototype","constructor"].includes(key)){
      throw calendarValidationError("A custom event field name is not valid.");
    }
    result[key]=value;
  }
  return result;
};
const plainCustomFields=value=>{
  if(value instanceof Map||value?.$isMongooseMap===true
    ||(typeof value?.entries==="function"&&typeof value?.get==="function")){
    return Object.fromEntries(value.entries());
  }
  return value&&typeof value==="object"&&!Array.isArray(value)?{...value}:{};
};
const calendarValidationError=message=>{
  const error=new Error(message);
  error.status=400;
  return error;
};
const applyConfiguredEventValues=(event,values,customFields,fields)=>{
  for(const field of fields||[]){
    if(field?.custom||!field?.key)continue;
    if(Object.prototype.hasOwnProperty.call(values,field.key)){
      event.set(field.key,values[field.key]);
    }
  }
  event.customFields=customFields;
};
const prepareEventInput=({input,customFields,existingValues={},existingCustomFields={},isNewRecord=false})=>{
  return {input,customFields,existingValues,existingCustomFields,isNewRecord};
};
const validDate=value=>{
  const date=new Date(value);
  return Number.isNaN(date.getTime())?null:date;
};

router.get("/",auth,async(req,res)=>{
  try{
    const range=buildCalendarOverlapQuery(req.query);
    const query={createdBy:owner(req),...range};
    res.json(await Event.find(query).sort({start:1}).lean());
  }catch(error){res.status(error.status||500).json({message:error.message});}
});

router.post("/",auth,async(req,res)=>{
  try{
    const configuredFields=await loadConfiguredFormFields(owner(req),"calendar.event");
    const start=validDate(req.body?.start);
    const end=validDate(req.body?.end)||start;
    const input={
      title:req.body?.title,
      start,
      end,
      color:req.body?.color??"#3788d8"
    };
    const prepared=await prepareConfiguredFormValues({
      ownerId:owner(req),
      fields:configuredFields,
      values:input,
      customFields:cleanCustomFields(req.body?.customFields),
      isNewRecord:true
    });
    const event=new Event({
      ...prepared.values,
      color:String(prepared.values.color||"#3788d8").slice(0,20),
      customFields:prepared.customFields,
      createdBy:owner(req)
    });
    Object.assign(event,normalizeCalendarEventInput(event));
    await applyWorkflows({resource:"calendar",event:"record_created",doc:event,createdBy:owner(req)});
    Object.assign(event,normalizeCalendarEventInput(event));
    if(hasConfiguredCustomCalculations(configuredFields)){
      event.customFields=calculateConfiguredCustomFields(
        configuredFields,
        event.toObject({depopulate:true}),
        plainCustomFields(event.customFields)
      );
    }
    const validated=validateConfiguredFormValues({
      fields:configuredFields,
      values:event.toObject({depopulate:true}),
      customFields:plainCustomFields(event.customFields),
      validateAllValues:true
    });
    applyConfiguredEventValues(event,validated.values,validated.customFields,configuredFields);
    Object.assign(event,normalizeCalendarEventInput(event));
    await event.save();
    res.status(201).json(event);
  }catch(error){res.status(error.status||400).json({message:error.message});}
});

router.put("/:id",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid event ID."});
    const event=await Event.findOne({_id:req.params.id,createdBy:owner(req)});
    if(!event)return res.status(404).json({message:"Event not found."});

    const originalValues=event.toObject({depopulate:true});
    const originalCustomFields=plainCustomFields(event.customFields);
    const values={...originalValues};
    for(const key of ["title","start","end","color"]){
      if(req.body?.[key]===undefined)continue;
      if(key==="start"||key==="end"){
        const parsed=validDate(req.body[key]);
        if(!parsed)return res.status(400).json({message:key==="start"?"Valid start date/time is required.":"Valid end date/time is required."});
        values[key]=parsed;
      }else if(key==="color"){
        values[key]=String(req.body[key]).slice(0,20);
      }else{
        values[key]=req.body[key];
      }
    }

    const configuredFields=await loadConfiguredFormFields(owner(req),"calendar.event");
    const prepared=await prepareConfiguredFormValues({
      ownerId:owner(req),
      fields:configuredFields,
      values,
      customFields:cleanCustomFields(req.body?.customFields,originalCustomFields),
      existingValues:originalValues,
      existingCustomFields:originalCustomFields,
      onlyChangedLookups:true
    });
    for(const key of ["title","start","end","color"]){
      if(Object.prototype.hasOwnProperty.call(prepared.values,key)){
        values[key]=prepared.values[key];
      }
    }

    for(const key of ["title","start","end","color"]){
      if(Object.prototype.hasOwnProperty.call(values,key))event.set(key,values[key]);
    }
    event.customFields=prepared.customFields;
    Object.assign(event,normalizeCalendarEventInput(event));
    await applyWorkflows({resource:"calendar",event:"record_updated",doc:event,createdBy:owner(req)});
    Object.assign(event,normalizeCalendarEventInput(event));
    if(hasConfiguredCustomCalculations(configuredFields)){
      event.customFields=calculateConfiguredCustomFields(
        configuredFields,
        event.toObject({depopulate:true}),
        plainCustomFields(event.customFields)
      );
    }
    const validated=validateConfiguredFormValues({
      fields:configuredFields,
      values:event.toObject({depopulate:true}),
      customFields:plainCustomFields(event.customFields),
      existingValues:originalValues,
      existingCustomFields:originalCustomFields
    });
    applyConfiguredEventValues(event,validated.values,validated.customFields,configuredFields);
    Object.assign(event,normalizeCalendarEventInput(event));
    await event.save();
    res.json(event);
  }catch(error){res.status(error.status||400).json({message:error.message});}
});

router.delete("/:id",auth,async(req,res)=>{
  try{
    if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:"Invalid event ID."});
    const event=await Event.findOneAndDelete({_id:req.params.id,createdBy:owner(req)});
    if(!event)return res.status(404).json({message:"Event not found."});
    res.json({message:"Event deleted successfully."});
  }catch(error){res.status(500).json({message:error.message});}
});

module.exports=router;
