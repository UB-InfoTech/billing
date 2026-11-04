const ORDER_STATUSES=["Pending","In Process","Completed","Cancelled","Dispatched"];
const PROTECTED_FIELDS=new Set([
 "_id","id","__v","createdBy","customFields","status","statusHistory","payments","paymentHistory",
 "lastPaymentDate","paymentStatus","paidAmount","dueAmount","discountAmount","taxAmount","totalCost",
 "totalAmount","finalRevenue","roundOffFinalRevenue","roundOff","creditAppliedAmount","creditNoteCount",
 "creditBalance","creditBalanceAdjustment","outstanding_balance","pendingPayments","totalPaid","totalRevenue",
 "orderCount","lastOrderDate","averageOrderValue","preferredProducts","orderFrequency","ewbDetails"
]);
const WORKFLOW_FORM_KEYS=Object.freeze({
 orders:"orders.form",clients:"clients.form",products:"products.form",expenses:"expenses.form",calendar:"calendar.event"
});
const BUILT_IN_CONDITION_FIELDS=Object.freeze({
 orders:["orderNumber","companyName","status","paymentStatus","discountRate","taxPercentage","dueAmount","roundOffFinalRevenue"],
 clients:["name","companyName","businessType","accountStatus","paymentTerms","discountRate"],
 products:["productName","productCode","rate","quantity"],
 expenses:["title","category","amount","paymentMethod"],calendar:["title","start","end","color"]
});
const BUILT_IN_ACTION_FIELDS=Object.freeze({
 orders:["companyName","discountRate","taxPercentage"],
 clients:["name","companyName","businessType","accountStatus","paymentTerms","discountRate"],
 products:["productName","productCode","rate","quantity"],
 expenses:["title","category","amount","paymentMethod"],calendar:["title","start","end","color"]
});
const CUSTOM_WORKFLOW_FIELD_TYPES=new Set(["text","textarea","number","currency","percentage","date","datetime","select","boolean","email","phone","url"]);
function isUnsafeWorkflowFieldPath(value){
 const key=String(value??"").trim();
 return !key||["__proto__","prototype","constructor"].includes(key)||key.startsWith("$")||key.includes(".");
}
function isProtectedWorkflowField(value){
 const key=String(value??"").trim();
 return isUnsafeWorkflowFieldPath(key)||PROTECTED_FIELDS.has(key);
}
function buildWorkflowFieldPolicy(resource,configuredFields=[]){
 const conditionFields=new Set(BUILT_IN_CONDITION_FIELDS[resource]||[]);
 const actionFields=new Set(BUILT_IN_ACTION_FIELDS[resource]||[]);
 for(const field of Array.isArray(configuredFields)?configuredFields:[]){
  const key=String(field?.key||"").trim();
  if(field?.custom!==true||field?.visible===false||!key.startsWith("custom_")||
    isUnsafeWorkflowFieldPath(key)||!CUSTOM_WORKFLOW_FIELD_TYPES.has(field?.fieldType))continue;
  conditionFields.add(key);
  if(field?.editable!==false&&field?.readOnly!==true&&field?.disabled!==true&&field?.locked!==true&&!String(field?.formula||"").trim()){
   actionFields.add(key);
  }
 }
 const customFieldDefinitions=new Map();
 for(const field of Array.isArray(configuredFields)?configuredFields:[]){
  const key=String(field?.key||"").trim();
  if(field?.custom===true&&field?.visible!==false&&key.startsWith("custom_")&&!isUnsafeWorkflowFieldPath(key)&&CUSTOM_WORKFLOW_FIELD_TYPES.has(field?.fieldType)){
   customFieldDefinitions.set(key,field);
  }
 }
 return {resource,conditionFields,actionFields,customFieldDefinitions};
}
async function loadWorkflowFieldPolicy(createdBy,resource){
 const formKey=WORKFLOW_FORM_KEYS[resource];
 if(!formKey)return buildWorkflowFieldPolicy(resource);
 const FormConfiguration=require("../models/FormConfiguration");
 const configuration=await FormConfiguration.findOne({createdBy,formKey}).select({fields:1}).lean();
 return buildWorkflowFieldPolicy(resource,configuration?.fields||[]);
}
function normalizeWorkflowActionValues(workflow,fieldPolicy){
 const definitions=fieldPolicy?.customFieldDefinitions instanceof Map?fieldPolicy.customFieldDefinitions:new Map();
 for(const action of Array.isArray(workflow?.actions)?workflow.actions:[]){
  if(action?.type!=="set_value")continue;
  const field=definitions.get(String(action.fieldKey||""));
  if(!field)continue;
  const value=action.value;
  if(value===null||value===undefined||value===""){action.value="";continue;}
  // Leave arrays/objects untouched so payload validation rejects them; never coerce
  // an unexpected object into the literal string "[object Object]".
  if(!["string","number","boolean"].includes(typeof value))continue;
  if(["number","currency","percentage"].includes(field.fieldType)){
   const number=typeof value==="number"?value:Number(value);
   if(Number.isFinite(number))action.value=number;
  }else if(field.fieldType==="boolean"){
   if(value===true||value==="true")action.value=true;
   else if(value===false||value==="false")action.value=false;
  }else action.value=String(value);
 }
 return workflow;
}

function validateWorkflowPayload(workflow,fieldPolicy=buildWorkflowFieldPolicy(workflow?.trigger?.resource)){
 const resource=workflow?.trigger?.resource;
 const conditions=Array.isArray(workflow?.conditions)?workflow.conditions:[];
 const allowedConditionFields=fieldPolicy?.conditionFields instanceof Set?fieldPolicy.conditionFields:new Set(BUILT_IN_CONDITION_FIELDS[resource]||[]);
 const allowedActionFields=fieldPolicy?.actionFields instanceof Set?fieldPolicy.actionFields:new Set(BUILT_IN_ACTION_FIELDS[resource]||[]);
 if(!WORKFLOW_FORM_KEYS[resource])throw new Error("Choose a supported record type for this automation.");
 if(fieldPolicy?.resource&&fieldPolicy.resource!==resource)throw new Error("The selected form fields do not match this automation's record type. Reload the form and try again.");
 if(!["all","any"].includes(workflow?.matchMode||"all"))throw new Error("Choose whether all conditions or any condition must match.");
 if(conditions.length>20)throw new Error("A workflow can have no more than 20 conditions.");
 for(const condition of conditions){
  const key=String(condition?.fieldKey||"").trim();
  if(!key)throw new Error("Choose a field for every condition or remove the unfinished condition.");
  // Read-only financial/status values remain safe to compare in conditions.
  if(!allowedConditionFields.has(key)||isUnsafeWorkflowFieldPath(key))throw new Error("This condition field is not available for the selected record type. Choose a current form field.");
  if(!["equals","not_equals","contains","not_contains","greater_than","less_than","empty","not_empty"].includes(condition?.operator))throw new Error("Choose a valid condition.");
  if(!["empty","not_empty"].includes(condition.operator)&&!String(condition?.value??"").trim())throw new Error("Enter a value for every condition or choose an empty/not empty condition.");
 }
 const actions=Array.isArray(workflow?.actions)?workflow.actions:[];
 if(!actions.length)throw new Error("Add at least one working action.");
 for(const action of actions){
  if(action.type==="set_value"){
   const key=String(action.fieldKey??"").trim();
   if(!key)throw new Error("Choose which field this workflow should update.");
   if(isProtectedWorkflowField(key))throw new Error("This field is maintained by the software and cannot be changed directly by a workflow. Use Change status for invoice status.");
   if(!allowedActionFields.has(key))throw new Error("This field cannot be changed by an automation. Choose an editable field from the selected form.");
   const valueType=typeof action.value;
   if(action.value!==null&&!["string","number","boolean"].includes(valueType))throw new Error("Enter a simple text, number or yes/no value for this automation.");
   if(typeof action.value==="string"&&action.value.length>1000)throw new Error("The automation value is too long.");
   const customField=fieldPolicy?.customFieldDefinitions instanceof Map?fieldPolicy.customFieldDefinitions.get(key):null;
   if(customField){
    const value=action.value;
    const empty=value===null||value===undefined||value==="";
    if(["number","currency","percentage"].includes(customField.fieldType)&&!empty){
     if(typeof value!=="number"||!Number.isFinite(value))throw new Error(`Enter a valid number for “${customField.label||"this field"}”.`);
     const minimum=customField.fieldType==="percentage"?Math.max(0,Number(customField.validation?.min??0)):customField.validation?.min;
     const maximum=customField.fieldType==="percentage"?Math.min(100,Number(customField.validation?.max??100)):customField.validation?.max;
     if(minimum!==null&&minimum!==undefined&&Number.isFinite(Number(minimum))&&value<Number(minimum))throw new Error(`The value for “${customField.label||"this field"}” is below its minimum.`);
     if(maximum!==null&&maximum!==undefined&&Number.isFinite(Number(maximum))&&value>Number(maximum))throw new Error(`The value for “${customField.label||"this field"}” is above its maximum.`);
    }
    if(customField.fieldType==="boolean"&&!empty&&typeof value!=="boolean")throw new Error(`Choose Yes or No for “${customField.label||"this field"}”.`);
    if(customField.fieldType==="select"&&!empty){
     const options=Array.isArray(customField.options)?customField.options:[];
     const allowed=options.map(option=>String(option&&typeof option==="object"?(option.value??option.label??""):option??""));
     if(!allowed.includes(String(value)))throw new Error(`Choose an available option for “${customField.label||"this field"}”.`);
    }
   }
   continue;
  }
  if(action.type==="change_status"){
   if(resource!=="orders")throw new Error("Automatic status changes are available for invoices only.");
   if(!ORDER_STATUSES.includes(String(action.value??"")))throw new Error("Choose a valid invoice status for this workflow.");
   continue;
  }
  throw new Error("This workflow action is not supported yet. Choose Set a field or Change status.");
 }
 return workflow;
}
module.exports={ORDER_STATUSES,PROTECTED_FIELDS,WORKFLOW_FORM_KEYS,BUILT_IN_CONDITION_FIELDS,BUILT_IN_ACTION_FIELDS,CUSTOM_WORKFLOW_FIELD_TYPES,isUnsafeWorkflowFieldPath,isProtectedWorkflowField,buildWorkflowFieldPolicy,loadWorkflowFieldPolicy,normalizeWorkflowActionValues,validateWorkflowPayload};
