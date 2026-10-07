const WorkflowDefinition=require("../models/WorkflowDefinition");

const readValue=(doc,key)=>{
  if(!doc||!key)return "";
  if(doc.customFields&&Object.prototype.hasOwnProperty.call(doc.customFields,key))return doc.customFields[key];
  const direct=typeof doc.get==="function"?doc.get(key):doc[key];
  return direct;
};

const matches=(condition,doc)=>{
  const current=readValue(doc,condition.fieldKey);
  const expected=condition.value??"";
  const text=String(current??"").trim().toLowerCase();
  const target=String(expected??"").trim().toLowerCase();

  switch(condition.operator){
    case "not_equals":return text!==target;
    case "contains":return text.includes(target);
    case "not_contains":return !text.includes(target);
    case "greater_than":return Number(current)>Number(expected);
    case "less_than":return Number(current)<Number(expected);
    case "empty":return text==="";
    case "not_empty":return text!=="";
    default:return text===target;
  }
};

const setValue=(doc,key,value)=>{
  if(!key)return false;
  const custom=doc.customFields&&Object.prototype.hasOwnProperty.call(doc.customFields,key);
  if(custom||key.startsWith("custom_")){
    doc.customFields=doc.customFields&&typeof doc.customFields==="object"?doc.customFields:{};
    doc.customFields[key]=value;
    doc.markModified?.("customFields");
    return true;
  }

  const schemaPath=doc.schema?.path?.(key);
  if(!schemaPath)return false;
  doc[key]=value;
  return true;
};

async function applyWorkflows({resource,event,doc,createdBy}){
  const workflows=await WorkflowDefinition.find({
    createdBy,
    active:true,
    "trigger.resource":resource,
    "trigger.event":event
  }).lean();

  const applied=[];
  for(const workflow of workflows){
    if((workflow.conditions||[]).some(condition=>!matches(condition,doc)))continue;

    let changed=false;
    for(const action of workflow.actions||[]){
      if(action.type==="set_value"&&action.fieldKey){
        changed=setValue(doc,action.fieldKey,action.value)||changed;
      }

      if(action.type==="change_status"&&resource==="orders"&&action.value){
        if(doc.status!==action.value){
          doc.status=action.value;
          doc.statusHistory=Array.isArray(doc.statusHistory)?doc.statusHistory:[];
          doc.statusHistory.push({status:action.value,timestamp:new Date()});
          changed=true;
        }
      }
    }

    if(changed)applied.push(workflow.name);
  }

  return applied;
}

module.exports={applyWorkflows};
