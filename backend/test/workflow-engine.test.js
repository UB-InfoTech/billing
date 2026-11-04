const test=require("node:test");
const assert=require("node:assert/strict");
const {matchesWorkflowConditions}=require("../utils/workflowEngine");

test("workflow condition groups use all mode by default",()=>{
  const doc={accountStatus:"Active",businessType:"Wholesale"};
  const conditions=[
    {fieldKey:"accountStatus",operator:"equals",value:"Active"},
    {fieldKey:"businessType",operator:"equals",value:"Retail"}
  ];
  assert.equal(matchesWorkflowConditions(conditions,doc),false);
  assert.equal(matchesWorkflowConditions(conditions,doc,"all"),false);
});

test("workflow any mode runs when at least one condition matches",()=>{
  const doc={accountStatus:"Active",businessType:"Wholesale"};
  const conditions=[
    {fieldKey:"accountStatus",operator:"equals",value:"Active"},
    {fieldKey:"businessType",operator:"equals",value:"Retail"}
  ];
  assert.equal(matchesWorkflowConditions(conditions,doc,"any"),true);
});

test("workflow all mode still requires every condition to match",()=>{
  const doc={accountStatus:"Active",businessType:"Wholesale"};
  const conditions=[
    {fieldKey:"accountStatus",operator:"equals",value:"Active"},
    {fieldKey:"businessType",operator:"equals",value:"Wholesale"}
  ];
  assert.equal(matchesWorkflowConditions(conditions,doc,"all"),true);
});

test("an automation without conditions remains eligible to run",()=>{
  assert.equal(matchesWorkflowConditions([],{}, "all"),true);
  assert.equal(matchesWorkflowConditions(null,{}, "any"),true);
});
