const {
  loadConfiguredFormFields,
  calculateConfiguredCustomFields,
  hasConfiguredCustomCalculations
}=require("./customFieldCalculations");
const {
  prepareConfiguredFormValues,
  validateConfiguredFormValues
}=require("./configuredFormValidation");

const EWAYBILL_BASE_FIELDS=[
  {
    key:"supplyType",label:"Supply Type",fieldType:"select",width:4,section:"compliance",order:0,required:true,system:true,locked:true,
    defaultValue:"O",
    options:[{value:"O",label:"Outward"},{value:"I",label:"Inward"}]
  },
  {
    key:"subSupplyType",label:"Sub Supply Type",fieldType:"select",width:4,section:"compliance",order:1,required:true,system:true,locked:true,
    defaultValue:"1",
    options:[
      {value:"1",label:"Supply"},{value:"2",label:"Import"},{value:"3",label:"Export"},
      {value:"4",label:"Job Work"},{value:"5",label:"For Own Use"},{value:"6",label:"Job Work Returns"},
      {value:"7",label:"Sales Return"},{value:"8",label:"Others"}
    ]
  },
  {
    key:"transactionType",label:"Transaction Type",fieldType:"select",width:4,section:"compliance",order:2,required:true,system:true,locked:true,
    defaultValue:"1",
    options:[
      {value:"1",label:"Regular"},{value:"2",label:"Bill To - Ship To"},
      {value:"3",label:"Bill From - Dispatch From"},{value:"4",label:"Combination"}
    ]
  },
  {key:"transporterName",label:"Transporter Name",fieldType:"text",width:3,section:"transport",order:3},
  {key:"transporterId",label:"Transporter GST / ID",fieldType:"text",width:3,section:"transport",order:4},
  {key:"transDocNo",label:"Transport Document No.",fieldType:"text",width:3,section:"transport",order:5},
  {key:"transDocDate",label:"Transport Document Date",fieldType:"date",width:3,section:"transport",order:6},
  {
    key:"transMode",label:"Transport Mode",fieldType:"select",width:3,section:"transport",order:7,defaultValue:"1",
    options:[
      {value:"1",label:"Road"},{value:"2",label:"Rail"},
      {value:"3",label:"Air"},{value:"4",label:"Ship"}
    ]
  },
  {key:"vehicleNo",label:"Vehicle Number",fieldType:"text",width:3,section:"transport",order:8},
  {
    key:"vehicleType",label:"Vehicle Type",fieldType:"select",width:3,section:"transport",order:9,defaultValue:"R",
    options:[{value:"R",label:"Regular"},{value:"O",label:"ODC"}]
  },
  {key:"transDistance",label:"Distance (KM)",fieldType:"number",width:3,section:"transport",order:10,defaultValue:0,validation:{min:0}}
];

const EWAYBILL_ROOT_KEYS=EWAYBILL_BASE_FIELDS.map(field=>field.key);
const EWAYBILL_RESERVED_KEYS=new Set(["__proto__","prototype","constructor"]);

const ewaybillError=message=>{
  const error=new Error(message);
  error.status=400;
  return error;
};

const plainFields=value=>{
  if(value instanceof Map||value?.$isMongooseMap===true
    ||(typeof value?.entries==="function"&&typeof value?.get==="function")){
    return Object.fromEntries(value.entries());
  }
  return value&&typeof value==="object"&&!Array.isArray(value)?{...value}:{};
};

const cleanCustomFields=value=>{
  let parsed=value;
  if(typeof parsed==="string"){
    try{parsed=JSON.parse(parsed||"{}");}
    catch{throw ewaybillError("Custom E-Way Bill fields are not valid.");}
  }
  if(parsed===undefined)return {};
  if(parsed instanceof Map||parsed?.$isMongooseMap===true
    ||(typeof parsed?.entries==="function"&&typeof parsed?.get==="function")){
    parsed=Object.fromEntries(parsed.entries());
  }
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)){
    throw ewaybillError("Custom E-Way Bill fields are not valid.");
  }
  const entries=Object.entries(parsed);
  if(entries.length>100)throw ewaybillError("An E-Way Bill can have no more than 100 custom fields.");
  const result={};
  for(const [rawKey,value] of entries){
    const key=String(rawKey).trim();
    if(!key||key.length>100||EWAYBILL_RESERVED_KEYS.has(key)){
      throw ewaybillError("A custom E-Way Bill field name is not valid.");
    }
    result[key]=value;
  }
  return result;
};

const mergeConfiguredEwaybillFields=savedFields=>{
  const savedByKey=new Map((Array.isArray(savedFields)?savedFields:[]).map(field=>[field?.key,field]));
  const baseKeys=new Set(EWAYBILL_ROOT_KEYS);
  const base=EWAYBILL_BASE_FIELDS.map(defaultField=>{
    const saved=savedByKey.get(defaultField.key)||{};
    const baseMin=defaultField.validation?.min;
    const configuredMin=saved.validation?.min;
    const validation={
      ...(defaultField.validation||{}),
      ...(saved.validation||{})
    };
    if(baseMin!==undefined&&baseMin!==null){
      validation.min=configuredMin===undefined||configuredMin===null
        ?baseMin
        :Math.max(Number(baseMin),Number(configuredMin));
    }
    return {
      ...defaultField,
      ...saved,
      key:defaultField.key,
      custom:false,
      system:true,
      locked:true,
      fieldType:defaultField.fieldType,
      options:defaultField.options||[],
      required:Boolean(defaultField.required||saved.required),
      defaultValue:saved.defaultValue===undefined||saved.defaultValue===null||saved.defaultValue===""
        ?defaultField.defaultValue??""
        :saved.defaultValue,
      formula:"",
      dataSource:{type:"none"},
      validation
    };
  });
  const custom=(Array.isArray(savedFields)?savedFields:[]).filter(field=>
    field?.custom===true&&!baseKeys.has(field.key)
  );
  return [...base,...custom];
};

const normalizeEwaybillValues=values=>{
  const next={...(values||{})};
  const allowed={
    supplyType:new Set(["O","I"]),
    subSupplyType:new Set(["1","2","3","4","5","6","7","8"]),
    transactionType:new Set(["1","2","3","4"]),
    transMode:new Set(["1","2","3","4"]),
    vehicleType:new Set(["R","O"])
  };
  for(const [key,options] of Object.entries(allowed)){
    const value=String(next[key]??"").trim();
    if(!options.has(value)){
      throw ewaybillError(`Choose a valid ${EWAYBILL_BASE_FIELDS.find(field=>field.key===key)?.label||key}.`);
    }
    next[key]=value;
  }
  const distance=Number(next.transDistance??0);
  if(!Number.isFinite(distance)||distance<0){
    throw ewaybillError("Distance must be a valid non-negative number.");
  }
  next.transDistance=distance;
  return next;
};

const prepareEwaybillForm=async({ownerId,body={}})=>{
  const savedFields=await loadConfiguredFormFields(ownerId,"ewaybill.form");
  const fields=mergeConfiguredEwaybillFields(savedFields);
  const values={};
  for(const key of EWAYBILL_ROOT_KEYS){
    if(Object.prototype.hasOwnProperty.call(body,key))values[key]=body[key];
  }
  const prepared=await prepareConfiguredFormValues({
    ownerId,
    fields,
    values,
    customFields:cleanCustomFields(body.customFields),
    isNewRecord:true
  });
  let customFields=plainFields(prepared.customFields);
  if(hasConfiguredCustomCalculations(fields)){
    customFields=calculateConfiguredCustomFields(fields,prepared.values,customFields);
  }
  const validated=validateConfiguredFormValues({
    fields,
    values:prepared.values,
    customFields,
    validateAllValues:true
  });
  return {
    values:normalizeEwaybillValues(validated.values),
    customFields:plainFields(validated.customFields),
    fields
  };
};

module.exports={
  EWAYBILL_BASE_FIELDS,
  mergeConfiguredEwaybillFields,
  normalizeEwaybillValues,
  prepareEwaybillForm
};
