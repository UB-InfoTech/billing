const {
  loadConfiguredFormFields,
  calculateConfiguredCustomFields,
  hasConfiguredCustomCalculations
}=require("./customFieldCalculations");
const {
  prepareConfiguredFormValues,
  validateConfiguredFormValues
}=require("./configuredFormValidation");

const PAYMENT_BASE_FIELDS=[
  {
    key:"amount",
    label:"Amount received",
    fieldType:"currency",
    section:"payment",
    width:3,
    required:true,
    locked:true,
    system:true,
    editable:true,
    validation:{min:0.01}
  },
  {
    key:"method",
    label:"Payment method",
    fieldType:"select",
    section:"payment",
    width:3,
    required:true,
    locked:true,
    system:true,
    editable:true,
    options:["Cash","Bank Transfer","UPI","Cheque","Bank"].map(value=>({value,label:value}))
  },
  {
    key:"amountReference",
    label:"Reference",
    fieldType:"text",
    section:"payment",
    width:3,
    locked:true,
    system:true,
    editable:true
  },
  {
    key:"paymentDate",
    label:"Date received",
    fieldType:"date",
    section:"payment",
    width:3,
    required:true,
    locked:true,
    system:true,
    editable:true
  }
];

const BASE_KEYS=new Set(PAYMENT_BASE_FIELDS.map(field=>field.key));
const RESERVED_KEYS=new Set(["__proto__","prototype","constructor"]);

const paymentFormError=message=>{
  const error=new Error(message);
  error.status=400;
  return error;
};

const plain=value=>{
  if(value instanceof Map||value?.$isMongooseMap===true
    ||(typeof value?.entries==="function"&&typeof value?.get==="function")){
    return Object.fromEntries(value.entries());
  }
  return value&&typeof value==="object"&&!Array.isArray(value)?{...value}:{};
};

const mergeConfiguredPaymentFields=savedFields=>{
  const savedByKey=new Map((Array.isArray(savedFields)?savedFields:[]).map(field=>[field?.key,field]));
  const base=PAYMENT_BASE_FIELDS.map((defaultField,index)=>{
    const saved=savedByKey.get(defaultField.key)||{};
    return {
      ...defaultField,
      ...saved,
      key:defaultField.key,
      custom:false,
      system:true,
      locked:true,
      fieldType:defaultField.fieldType,
      required:defaultField.required,
      editable:true,
      readOnly:false,
      disabled:false,
      formula:"",
      options:defaultField.options||[],
      dataSource:{type:"none"},
      conditions:[],
      validation:defaultField.validation||{},
      order:Number.isFinite(Number(saved.order))?Number(saved.order):index
    };
  });
  const custom=(Array.isArray(savedFields)?savedFields:[]).filter(field=>
    field?.custom===true&&!BASE_KEYS.has(field.key)
  );
  return [...base,...custom];
};

const cleanIncomingCustomFields=value=>{
  let parsed=value;
  if(typeof parsed==="string"){
    try{parsed=JSON.parse(parsed||"{}");}
    catch{throw paymentFormError("Custom payment details are not valid.");}
  }
  if(parsed===undefined||parsed===null)return {};
  if(parsed instanceof Map||parsed?.$isMongooseMap===true
    ||(typeof parsed?.entries==="function"&&typeof parsed?.get==="function")){
    parsed=Object.fromEntries(parsed.entries());
  }
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)){
    throw paymentFormError("Custom payment details are not valid.");
  }
  const entries=Object.entries(parsed);
  if(entries.length>100)throw paymentFormError("A payment can have no more than 100 custom details.");
  const result={};
  for(const [rawKey,value] of entries){
    const key=String(rawKey).trim();
    if(!key||key.length>100||RESERVED_KEYS.has(key)){
      throw paymentFormError("A custom payment detail name is not valid.");
    }
    result[key]=value;
  }
  return result;
};

const preparePaymentCustomFields=async({
  ownerId,
  values={},
  customFields={},
  existingValues={},
  existingCustomFields={},
  isNewRecord=false
})=>{
  const savedFields=await loadConfiguredFormFields(ownerId,"orders.payments");
  const fields=mergeConfiguredPaymentFields(savedFields);
  const existing=plain(existingCustomFields);
  const incoming=cleanIncomingCustomFields(customFields);
  const allowedCustomKeys=new Set(fields.filter(field=>field.custom).map(field=>field.key));
  // Only configured fields may be introduced by the browser. Previously saved
  // values for fields later removed from the layout remain preserved.
  const acceptedIncoming=Object.fromEntries(
    Object.entries(incoming).filter(([key])=>allowedCustomKeys.has(key))
  );
  const nextCustomFields={...existing,...acceptedIncoming};

  const prepared=await prepareConfiguredFormValues({
    ownerId,
    fields,
    values,
    customFields:nextCustomFields,
    existingValues,
    existingCustomFields:existing,
    isNewRecord,
    onlyChangedLookups:!isNewRecord
  });

  let calculated=plain(prepared.customFields);
  if(hasConfiguredCustomCalculations(fields)){
    calculated=calculateConfiguredCustomFields(fields,prepared.values,calculated);
  }

  const validated=validateConfiguredFormValues({
    fields,
    values:prepared.values,
    customFields:calculated,
    existingValues:isNewRecord?null:existingValues,
    existingCustomFields:isNewRecord?null:existing,
    validateAllValues:true
  });

  return {
    customFields:plain(validated.customFields),
    fields
  };
};

module.exports={
  PAYMENT_BASE_FIELDS,
  mergeConfiguredPaymentFields,
  cleanIncomingCustomFields,
  preparePaymentCustomFields
};
