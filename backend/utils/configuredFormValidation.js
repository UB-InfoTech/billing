const mongoose=require("mongoose");
const {
  getFormLookupSource,
  getFormLookupQuery
}=require("./formLookupPolicy");

const isEmpty=value=>value===null||value===undefined
  ||(typeof value==="string"&&!value.trim())
  ||(Array.isArray(value)&&value.length===0);

const plain=value=>{
  if(value instanceof Map||value?.$isMongooseMap===true
    ||(typeof value?.entries==="function"&&typeof value?.get==="function")){
    return Object.fromEntries(value.entries());
  }
  if(!value||typeof value!=="object"||Array.isArray(value))return {};
  return {...value};
};

const readFieldValue=(field,values={},customFields={})=>{
  if(field?.custom){
    return Object.prototype.hasOwnProperty.call(customFields,field.key)
      ?customFields[field.key]
      :values[field.key];
  }
  return Object.prototype.hasOwnProperty.call(values,field?.key)
    ?values[field.key]
    :customFields[field?.key];
};

const readTargetValue=(key,fields,values,customFields)=>{
  const target=(fields||[]).find(field=>field.key===key);
  return target?.custom?customFields[key]:values[key];
};

const writeTargetValue=(key,value,fields,values,customFields,updates)=>{
  const target=(fields||[]).find(field=>field.key===key);
  if(target?.custom)customFields[key]=value??"";
  else values[key]=value??"";
  if(updates)updates.push({key,value:value??"",custom:Boolean(target?.custom)});
};

const sameValue=(left,right)=>{
  if(left===right)return true;
  try{return JSON.stringify(left??null)===JSON.stringify(right??null);}
  catch{return String(left??"")===String(right??"");}
};

const numericConditionMatches=(current,expected,operator)=>{
  if(isEmpty(current)||isEmpty(expected))return false;
  const a=Number(current),b=Number(expected);
  if(!Number.isFinite(a)||!Number.isFinite(b))return false;
  return operator==="greater_than"?a>b:operator==="less_than"?a<b:false;
};

const conditionMatches=(condition,values)=>{
  const current=values?.[condition?.fieldKey];
  const expected=condition?.value??"";
  const text=String(current??"").trim().toLowerCase();
  const target=String(expected??"").trim().toLowerCase();
  switch(condition?.operator){
    case "not_equals":return text!==target;
    case "contains":return text.includes(target);
    case "not_contains":return !text.includes(target);
    case "greater_than":return numericConditionMatches(current,expected,"greater_than");
    case "less_than":return numericConditionMatches(current,expected,"less_than");
    case "empty":return text==="";
    case "not_empty":return text!=="";
    default:return text===target;
  }
};

const getConfiguredFieldState=(field,values)=>{
  const conditions=Array.isArray(field?.conditions)?field.conditions:[];
  let visible=field?.visible!==false;
  let required=Boolean(field?.required);
  let disabled=Boolean(field?.disabled);

  const showRules=conditions.filter(condition=>condition.action==="show");
  const hideRules=conditions.filter(condition=>condition.action==="hide");
  if(showRules.length)visible=showRules.every(condition=>conditionMatches(condition,values));
  if(hideRules.some(condition=>conditionMatches(condition,values)))visible=false;

  conditions.forEach(condition=>{
    if(!conditionMatches(condition,values))return;
    if(condition.action==="require")required=true;
    if(condition.action==="optional")required=false;
    if(condition.action==="enable")disabled=false;
    if(condition.action==="disable")disabled=true;
  });

  return {visible,required,disabled};
};

const makeValidationError=(field,message)=>{
  const error=new Error(message||`Check “${field?.label||"this field"}”.`);
  error.status=400;
  return error;
};

const isValidCalendarDate=value=>{
  const match=String(value||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match)return false;
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const date=new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year&&date.getUTCMonth()+1===month&&date.getUTCDate()===day;
};

const isValidDateTime=value=>{
  const raw=String(value||"");
  const local=raw.match(/^(\d{4}-\d{2}-\d{2})[T ]([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,3}))?)?$/);
  const zoned=raw.match(/^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)$/i);
  return Boolean((local||zoned)&&isValidCalendarDate((local||zoned)[1])&&!Number.isNaN(new Date(raw).getTime()));
};

const getLookupRecord=async(resource,id,ownerId)=>{
  const source=getFormLookupSource(resource);
  if(!source)return null;
  if(!mongoose.isValidObjectId(id))return null;
  const ownership=getFormLookupQuery(resource,new mongoose.Types.ObjectId(String(ownerId)));
  if(!ownership)return null;
  const projection=[...new Set(["_id",...source.fields])].join(" ");
  return source.model.findOne({
    ...ownership,
    _id:new mongoose.Types.ObjectId(String(id))
  }).select(projection).lean();
};

const findLookupRecordByValue=async(resource,valueField,value,ownerId)=>{
  const source=getFormLookupSource(resource);
  if(!source||!source.fields.includes(valueField)||isEmpty(value))return null;
  const ownership=getFormLookupQuery(resource,new mongoose.Types.ObjectId(String(ownerId)));
  if(!ownership)return null;
  const projection=[...new Set(["_id",...source.fields])].join(" ");
  const records=await source.model.find({
    ...ownership,
    [valueField]:value
  }).select(projection).limit(2).lean();
  if(records.length>1){
    throw makeValidationError(
      {label:"This selection"},
      "This linked list has duplicate names. Choose a record that has a unique name, or use its record ID."
    );
  }
  return records[0]||null;
};

const applyConfiguredAutoFill=async({
  ownerId,
  fields=[],
  values={},
  customFields={},
  existingValues={},
  existingCustomFields={},
  onlyChanged=false
})=>{
  const nextValues={...(values||{})};
  const nextCustomFields=plain(customFields);
  const previousValues=existingValues||{};
  const previousCustomFields=plain(existingCustomFields);
  const updates=[];
  const fieldList=Array.isArray(fields)?fields:[];
  const fieldByKey=new Map(fieldList.map(field=>[field.key,field]));

  for(const field of fieldList){
    const sourceConfig=field.dataSource;
    if(sourceConfig?.type!=="lookup")continue;
    const source=getFormLookupSource(sourceConfig.resource);
    if(!source)throw makeValidationError(field,`The linked list for “${field.label}” is no longer available. Choose another list.`);

    const mappings=Array.isArray(sourceConfig.autoFill)?sourceConfig.autoFill:[];
    const idMapping=mappings.find(mapping=>mapping.sourceKey==="_id");
    const selectedValue=readFieldValue(field,nextValues,nextCustomFields);
    const selectedId=idMapping
      ?readTargetValue(idMapping.targetKey,fieldList,nextValues,nextCustomFields)
      :sourceConfig.valueField==="_id"?selectedValue:"";

    const referenceChanged=!sameValue(
      selectedValue,
      readFieldValue(field,previousValues,previousCustomFields)
    )||Boolean(idMapping&&!sameValue(
      readTargetValue(idMapping.targetKey,fieldList,nextValues,nextCustomFields),
      readTargetValue(idMapping.targetKey,fieldList,previousValues,previousCustomFields)
    ));

    if(onlyChanged&&!referenceChanged)continue;

    const multi=field.fieldType==="multiselect"||Boolean(sourceConfig.multiple);
    const ids=multi&&Array.isArray(selectedId)?selectedId:multi&&Array.isArray(selectedValue)?selectedValue:null;

    if(ids){
      const normalized=[...new Set(ids.map(String).filter(Boolean))];
      if(normalized.some(id=>!mongoose.isValidObjectId(id))){
        throw makeValidationError(field,`Choose valid records for “${field.label}”.`);
      }
      const ownership=getFormLookupQuery(sourceConfig.resource,new mongoose.Types.ObjectId(String(ownerId)));
      const found=await source.model.find({
        ...ownership,
        _id:{$in:normalized.map(id=>new mongoose.Types.ObjectId(id))}
      }).select("_id").lean();
      if(found.length!==normalized.length){
        throw makeValidationError(field,`One or more selected records for “${field.label}” do not belong to this business.`);
      }
      if(!idMapping&&sourceConfig.valueField==="_id"&&field.custom){
        nextCustomFields[field.key]=normalized;
      }
      continue;
    }

    const hasSelection=!isEmpty(selectedId)||!isEmpty(selectedValue);
    if(!hasSelection){
      if(referenceChanged&&mappings.length){
        mappings.forEach(mapping=>{
          writeTargetValue(mapping.targetKey,"",fieldList,nextValues,nextCustomFields,updates);
        });
      }
      continue;
    }

    let record=null;
    if(!isEmpty(selectedId)){
      record=await getLookupRecord(sourceConfig.resource,selectedId,ownerId);
    }else if(sourceConfig.valueField==="_id"){
      record=await getLookupRecord(sourceConfig.resource,selectedValue,ownerId);
    }else{
      record=await findLookupRecordByValue(
        sourceConfig.resource,
        sourceConfig.valueField,
        selectedValue,
        ownerId
      );
    }

    if(!record){
      throw makeValidationError(field,`The selected record for “${field.label}” was not found in this business. Choose it again.`);
    }

    if(idMapping&&sourceConfig.valueField!=="_id"&&!isEmpty(selectedValue)){
      if(String(record[sourceConfig.valueField]??"")!==String(selectedValue)){
        throw makeValidationError(field,`The selected record for “${field.label}” has changed. Choose it again.`);
      }
    }

    mappings.forEach(mapping=>{
      if(!source.fields.includes(mapping.sourceKey)&&mapping.sourceKey!=="_id"){
        throw makeValidationError(field,`The selected record cannot provide “${mapping.sourceKey}”. Update the field's linked information.`);
      }
      const mappedValue=mapping.sourceKey==="_id"?String(record._id):record[mapping.sourceKey];
      writeTargetValue(mapping.targetKey,mappedValue,fieldList,nextValues,nextCustomFields,updates);
    });

    // Reference-type custom fields always retain the stable record ID.
    if(field.fieldType==="reference"&&field.custom){
      nextCustomFields[field.key]=String(record._id);
    }
    if(field.fieldType==="reference"&&!field.custom&&idMapping){
      // The visible field keeps its friendly label; the linked record ID is
      // stored in the mapped hidden field (for example clientId/productId).
    }
  }

  return {values:nextValues,customFields:nextCustomFields,updates};
};

const normalizeConfiguredFieldValue=(field,value)=>{
  if(isEmpty(value))return value;
  const label=field.label||"This field";
  switch(field.fieldType){
    case "number":
    case "currency":{
      if(typeof value==="boolean"||typeof value==="object"){
        throw makeValidationError(field,`Enter a valid number for “${label}”.`);
      }
      const number=Number(String(value).trim());
      if(!Number.isFinite(number))throw makeValidationError(field,`Enter a valid number for “${label}”.`);
      if(field.validation?.min!==null&&field.validation?.min!==undefined&&number<Number(field.validation.min)){
        throw makeValidationError(field,`“${label}” must be at least ${field.validation.min}.`);
      }
      if(field.validation?.max!==null&&field.validation?.max!==undefined&&number>Number(field.validation.max)){
        throw makeValidationError(field,`“${label}” cannot be more than ${field.validation.max}.`);
      }
      return field.custom
        ?field.fieldType==="currency"?Math.round((number+Number.EPSILON)*100)/100:number
        :value;
    }
    case "boolean":{
      if(value===true||value===1||value==="1"||String(value).toLowerCase()==="true")return field.custom?true:value;
      if(value===false||value===0||value==="0"||String(value).toLowerCase()==="false")return field.custom?false:value;
      throw makeValidationError(field,`Choose Yes or No for “${label}”.`);
    }
    case "select":{
      if(field.dataSource?.type==="lookup")return value;
      const allowed=new Set((field.options||[]).map(option=>String(option?.value??option)));
      if(!allowed.has(String(value)))throw makeValidationError(field,`Choose an available option for “${label}”.`);
      return field.custom?String(value):value;
    }
    case "multiselect":{
      if(!Array.isArray(value))throw makeValidationError(field,`Choose one or more options for “${label}”.`);
      if(value.length>100)throw makeValidationError(field,`Choose no more than 100 options for “${label}”.`);
      if(field.dataSource?.type==="lookup")return value;
      const allowed=new Set((field.options||[]).map(option=>String(option?.value??option)));
      const selected=[...new Set(value.map(String))];
      if(selected.some(item=>!allowed.has(item)))throw makeValidationError(field,`Choose available options for “${label}”.`);
      return selected;
    }
    case "date":
      if(!isValidCalendarDate(value))throw makeValidationError(field,`Enter a valid date for “${label}”.`);
      return value;
    case "datetime":
      if(!isValidDateTime(value))throw makeValidationError(field,`Enter a valid date and time for “${label}”.`);
      return value;
    case "email":{
      const email=String(value).trim();
      if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
        throw makeValidationError(field,`Enter a valid email address for “${label}”.`);
      }
      return field.custom?email.toLowerCase():value;
    }
    case "phone":{
      const phone=String(value).trim();
      if(!/^\+?[0-9\s().-]{5,25}$/.test(phone)){
        throw makeValidationError(field,`Enter a valid phone number for “${label}”.`);
      }
      return field.custom?phone:value;
    }
    case "url":{
      const raw=String(value).trim();
      try{
        const parsed=new URL(raw);
        if(!["http:","https:"].includes(parsed.protocol))throw new Error("protocol");
      }catch{
        throw makeValidationError(field,`Enter a valid website address for “${label}”.`);
      }
      return field.custom?raw:value;
    }
    case "reference":{
      if(field.dataSource?.type!=="lookup")throw makeValidationError(field,`Choose where “${label}” should come from.`);
      if(!mongoose.isValidObjectId(String(value)))throw makeValidationError(field,`Choose an existing record for “${label}”.`);
      return field.custom?String(value):value;
    }
    case "text":
    case "textarea":{
      if(typeof value==="object")throw makeValidationError(field,`Enter text for “${label}”.`);
      const text=String(value);
      if(text.length>(field.fieldType==="textarea"?10000:2000)){
        throw makeValidationError(field,`“${label}” is too long.`);
      }
      if(field.validation?.pattern){
        let pattern;
        try{pattern=new RegExp(field.validation.pattern);}
        catch{throw makeValidationError(field,`The saved validation for “${label}” is invalid. Contact your administrator.`);}
        if(!pattern.test(text))throw makeValidationError(field,`Check the format entered for “${label}”.`);
      }
      return field.custom?text:value;
    }
    default:
      return value;
  }
};

const applyConfiguredDefaults=({fields,values,customFields})=>{
  const nextValues={...(values||{})};
  const nextCustomFields=plain(customFields);
  for(const field of fields||[]){
    if(!isEmpty(readFieldValue(field,nextValues,nextCustomFields)))continue;
    if(field.defaultValue===undefined||field.defaultValue===null||field.defaultValue==="")continue;
    if(field.custom)nextCustomFields[field.key]=field.defaultValue;
    else nextValues[field.key]=field.defaultValue;
  }
  return {values:nextValues,customFields:nextCustomFields};
};

const preserveNonEditableFields=({
  fields,
  values,
  customFields,
  existingValues={},
  existingCustomFields={},
  autoFillUpdates=[]
})=>{
  const nextValues={...(values||{})};
  const nextCustomFields=plain(customFields);
  const autofilled=new Set(autoFillUpdates.map(update=>update.key));
  for(const field of fields||[]){
    const isNonEditable=field.editable===false||field.readOnly===true||field.disabled===true;
    if(!isNonEditable||autofilled.has(field.key)||field.formula)continue;
    const existing=field.custom?existingCustomFields[field.key]:existingValues[field.key];
    const fallback=existing===undefined?field.defaultValue:existing;
    if(field.custom){
      if(fallback===undefined)delete nextCustomFields[field.key];
      else nextCustomFields[field.key]=fallback;
    }else if(fallback===undefined){
      delete nextValues[field.key];
    }else{
      nextValues[field.key]=fallback;
    }
  }
  return {values:nextValues,customFields:nextCustomFields};
};

const validateConfiguredFormValues=({
  fields=[],
  values={},
  customFields={},
  existingValues=null,
  existingCustomFields=null,
  validateAllValues=false
})=>{
  const nextValues={...(values||{})};
  const nextCustomFields=plain(customFields);
  const existing=existingValues||{};
  const existingCustom=plain(existingCustomFields);
  const formValues={...nextValues,...nextCustomFields};

  for(const field of fields||[]){
    const state=getConfiguredFieldState(field,formValues);
    let value=readFieldValue(field,nextValues,nextCustomFields);
    if(field.fieldType==="reference"&&!field.custom&&field.dataSource?.type==="lookup"){
      const idMapping=(field.dataSource.autoFill||[]).find(mapping=>mapping.sourceKey==="_id");
      if(idMapping)value=readTargetValue(idMapping.targetKey,fields,nextValues,nextCustomFields);
    }
    if(state.visible&&state.required&&!state.disabled&&isEmpty(value)){
      throw makeValidationError(field,`Please complete “${field.label||"this field"}” before saving.`);
    }
    if(isEmpty(value))continue;

    const previous=field.custom?existingCustom[field.key]:existing[field.key];
    if(!validateAllValues&&!sameValue(value,previous))continue;
    const normalized=normalizeConfiguredFieldValue(field,value);
    const referenceIdMapping=field.fieldType==="reference"&&!field.custom
      ?(field.dataSource?.autoFill||[]).find(mapping=>mapping.sourceKey==="_id")
      :null;
    if(field.custom)nextCustomFields[field.key]=normalized;
    else if(!referenceIdMapping)nextValues[field.key]=normalized;
  }

  return {values:nextValues,customFields:nextCustomFields};
};

const prepareConfiguredFormValues=async({
  ownerId,
  fields=[],
  values={},
  customFields={},
  existingValues={},
  existingCustomFields={},
  isNewRecord=false,
  onlyChangedLookups=false
})=>{
  const defaults=isNewRecord
    ?applyConfiguredDefaults({fields,values,customFields})
    :{values:{...(values||{})},customFields:plain(customFields)};
  const linked=await applyConfiguredAutoFill({
    ownerId,
    fields,
    values:defaults.values,
    customFields:defaults.customFields,
    existingValues,
    existingCustomFields,
    onlyChanged:onlyChangedLookups
  });
  const preserved=preserveNonEditableFields({
    fields,
    values:linked.values,
    customFields:linked.customFields,
    existingValues,
    existingCustomFields,
    autoFillUpdates:linked.updates
  });
  return {...preserved,updates:linked.updates};
};

module.exports={
  isEmpty,
  readFieldValue,
  conditionMatches,
  getConfiguredFieldState,
  normalizeConfiguredFieldValue,
  applyConfiguredAutoFill,
  applyConfiguredDefaults,
  preserveNonEditableFields,
  prepareConfiguredFormValues,
  validateConfiguredFormValues
};
