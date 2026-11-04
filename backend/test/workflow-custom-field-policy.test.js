const test=require("node:test");
const assert=require("node:assert/strict");
const {buildWorkflowFieldPolicy,validateWorkflowPayload}=require("../utils/workflowPolicy");
const makePayload=(resource,actions,conditions=[])=>({name:"Configured field test",active:true,trigger:{resource,event:"record_updated"},matchMode:"all",conditions,actions});

test("configured visible custom fields can be checked and updated",()=>{
 const policy=buildWorkflowFieldPolicy("clients",[{key:"custom_salesPerson_1",custom:true,visible:true,editable:true,fieldType:"text"}]);
 assert.doesNotThrow(()=>validateWorkflowPayload(makePayload("clients",[{type:"set_value",fieldKey:"custom_salesPerson_1",value:"Team A"}],[{fieldKey:"custom_salesPerson_1",operator:"not_empty",value:""}]),policy));
});

test("status and financial fields stay available as conditions but cannot be written directly",()=>{
 const policy=buildWorkflowFieldPolicy("orders",[{key:"custom_approval_1",custom:true,visible:true,editable:false,readOnly:true,fieldType:"text"}]);
 assert.doesNotThrow(()=>validateWorkflowPayload(makePayload("orders",[{type:"set_value",fieldKey:"companyName",value:"Customer"}],[
  {fieldKey:"status",operator:"equals",value:"Completed"},
  {fieldKey:"paymentStatus",operator:"equals",value:"Unpaid"},
  {fieldKey:"dueAmount",operator:"greater_than",value:"0"},
  {fieldKey:"custom_approval_1",operator:"not_empty",value:""}
 ]),policy));
 assert.throws(()=>validateWorkflowPayload(makePayload("orders",[{type:"set_value",fieldKey:"custom_approval_1",value:"Yes"}]),policy),/cannot be changed by an automation/i);
});

test("hidden and unsupported fields are excluded while read-only values remain condition-only",()=>{
 const fields=[
  {key:"custom_hidden",custom:true,visible:false,fieldType:"text"},
  {key:"custom_disabled",custom:true,visible:true,disabled:true,fieldType:"text"},
  {key:"custom_formula",custom:true,visible:true,fieldType:"number",formula:"1+2",readOnly:true,editable:false},
  {key:"custom_image",custom:true,visible:true,fieldType:"image"},
  {key:"custom_file",custom:true,visible:true,fieldType:"file"},
  {key:"custom_multi",custom:true,visible:true,fieldType:"multiselect"},
  {key:"custom_reference",custom:true,visible:true,fieldType:"reference"}
 ];
 const policy=buildWorkflowFieldPolicy("clients",fields);
 assert.equal(policy.conditionFields.has("custom_hidden"),false);
 for(const key of ["custom_image","custom_file","custom_multi","custom_reference"]){
  assert.equal(policy.conditionFields.has(key),false,key);
  assert.equal(policy.actionFields.has(key),false,key);
 }
 for(const key of ["custom_disabled","custom_formula"]){
  assert.equal(policy.conditionFields.has(key),true,key);
  assert.equal(policy.actionFields.has(key),false,key);
 }
});

test("custom fields cannot be used against another record type",()=>{
 const policy=buildWorkflowFieldPolicy("clients",[{key:"custom_customerType",custom:true,visible:true,editable:true,fieldType:"select"}]);
 assert.throws(()=>validateWorkflowPayload(makePayload("orders",[{type:"set_value",fieldKey:"custom_customerType",value:"Retail"}]),policy),/do not match this automation/i);
});

test("unknown custom fields and nested paths are rejected",()=>{
 assert.throws(()=>validateWorkflowPayload(makePayload("clients",[{type:"set_value",fieldKey:"accountStatus",value:"Active"}],[{fieldKey:"custom_missing",operator:"not_empty",value:""}])),/condition field is not available/i);
 assert.throws(()=>validateWorkflowPayload(makePayload("clients",[{type:"set_value",fieldKey:"accountStatus",value:"Active"}],[{fieldKey:"name.secret",operator:"not_empty",value:""}])),/condition field is not available/i);
});

test("workflow field actions reject object values",()=>{
 assert.throws(()=>validateWorkflowPayload(makePayload("clients",[{type:"set_value",fieldKey:"name",value:{nested:"value"}}])),/simple text, number or yes\/no value/i);
});
