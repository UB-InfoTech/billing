const {
  loadConfiguredFormFields,
  calculateConfiguredCustomFields,
  hasConfiguredCustomCalculations
}=require("./customFieldCalculations");
const {
  prepareConfiguredFormValues,
  validateConfiguredFormValues
}=require("./configuredFormValidation");

const plainCustomFields=value=>{
  if(value instanceof Map||value?.$isMongooseMap===true
    ||(typeof value?.entries==="function"&&typeof value?.get==="function")){
    return Object.fromEntries(value.entries());
  }
  return value&&typeof value==="object"&&!Array.isArray(value)?{...value}:{};
};

const formError=message=>{
  const error=new Error(message);
  error.status=400;
  return error;
};

const parseCustomFields=value=>{
  let parsed=value;
  if(typeof parsed==="string"){
    try{parsed=JSON.parse(parsed||"{}");}
    catch{throw formError("Additional Credit Note details are not valid.");}
  }
  if(parsed===undefined||parsed===null)return {};
  if(parsed instanceof Map||parsed?.$isMongooseMap===true
    ||(typeof parsed?.entries==="function"&&typeof parsed?.get==="function")){
    parsed=Object.fromEntries(parsed.entries());
  }
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)){
    throw formError("Additional Credit Note details must be a valid set of fields.");
  }
  const entries=Object.entries(parsed);
  if(entries.length>100)throw formError("A Credit Note can have no more than 100 additional details.");
  const result={};
  for(const [rawKey,value] of entries){
    const key=String(rawKey).trim();
    if(!key||key.length>100||["__proto__","prototype","constructor"].includes(key)){
      throw formError("An additional Credit Note field is not valid.");
    }
    result[key]=value;
  }
  return result;
};

const prepareCreditNoteCustomFields=async({
  ownerId,
  value,
  existingCustomFields={},
  isNewRecord=false
})=>{
  const fields=(await loadConfiguredFormFields(ownerId,"creditnotes.form"))
    .filter(field=>field?.custom===true&&typeof field.key==="string");
  const existing=plainCustomFields(existingCustomFields);
  const supplied=parseCustomFields(value);
  const allowed=new Set(fields.map(field=>field.key));
  const unknown=Object.keys(supplied).filter(key=>!allowed.has(key));
  if(unknown.length){
    throw formError("Some additional Credit Note fields are no longer available. Refresh the form and try again.");
  }

  const merged={...existing,...supplied};
  const prepared=await prepareConfiguredFormValues({
    ownerId,
    fields,
    values:{},
    customFields:merged,
    existingValues:{},
    existingCustomFields:existing,
    isNewRecord,
    onlyChangedLookups:true
  });

  let customFields=plainCustomFields(prepared.customFields);
  if(hasConfiguredCustomCalculations(fields)){
    customFields=calculateConfiguredCustomFields(fields,{},customFields);
  }
  const validated=validateConfiguredFormValues({
    fields,
    values:{},
    customFields,
    existingValues:{},
    existingCustomFields:existing,
    validateAllValues:isNewRecord
  });
  return plainCustomFields(validated.customFields);
};

module.exports={
  plainCustomFields,
  parseCustomFields,
  prepareCreditNoteCustomFields
};
