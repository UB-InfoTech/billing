const test=require("node:test");
const assert=require("node:assert/strict");
const {
  getConfiguredFieldState,
  normalizeConfiguredFieldValue,
  validateConfiguredFormValues
}=require("../utils/configuredFormValidation");

test("conditional visibility and required rules match the selected customer type",()=>{
  const field={
    key:"gstNumber",
    label:"GST Number",
    custom:true,
    fieldType:"text",
    conditions:[
      {action:"show",fieldKey:"customerType",operator:"equals",value:"Business"},
      {action:"require",fieldKey:"customerType",operator:"equals",value:"Business"}
    ]
  };
  const individual=getConfiguredFieldState(field,{customerType:"Individual"});
  const business=getConfiguredFieldState(field,{customerType:"Business"});
  assert.equal(individual.visible,false);
  assert.equal(individual.required,false);
  assert.equal(business.visible,true);
  assert.equal(business.required,true);
});

test("conditional optional and disabled rules override configured required state",()=>{
  const field={
    key:"deliveryNote",
    label:"Delivery note",
    required:true,
    conditions:[
      {action:"optional",fieldKey:"deliveryType",operator:"equals",value:"Pickup"},
      {action:"disable",fieldKey:"deliveryType",operator:"equals",value:"Pickup"}
    ]
  };
  const pickup=getConfiguredFieldState(field,{deliveryType:"Pickup"});
  const delivery=getConfiguredFieldState(field,{deliveryType:"Delivery"});
  assert.deepEqual(pickup,{visible:true,required:false,disabled:true,readOnly:false});
  assert.deepEqual(delivery,{visible:true,required:true,disabled:false,readOnly:false});
});

test("server rejects missing visible conditional required fields",()=>{
  const fields=[
    {key:"customerType",label:"Customer type",custom:true,fieldType:"select",options:["Individual","Business"]},
    {key:"gstNumber",label:"GST Number",custom:true,fieldType:"text",conditions:[
      {action:"show",fieldKey:"customerType",operator:"equals",value:"Business"},
      {action:"require",fieldKey:"customerType",operator:"equals",value:"Business"}
    ]}
  ];
  assert.throws(
    ()=>validateConfiguredFormValues({
      fields,
      values:{},
      customFields:{customerType:"Business",gstNumber:""},
      validateAllValues:true
    }),
    /Please complete “GST Number”/i
  );
  assert.doesNotThrow(()=>validateConfiguredFormValues({
    fields,
    values:{},
    customFields:{customerType:"Individual",gstNumber:""},
    validateAllValues:true
  }));
});

test("server rejects values that are not in a saved dropdown",()=>{
  const field={key:"customerType",label:"Customer type",custom:true,fieldType:"select",options:[
    {value:"Individual",label:"Individual"},
    {value:"Business",label:"Business"}
  ]};
  assert.equal(normalizeConfiguredFieldValue(field,"Business"),"Business");
  assert.throws(()=>normalizeConfiguredFieldValue(field,"Unknown"),/available option/i);
});

test("server validates numbers, dates, email, phone and website values",()=>{
  assert.equal(normalizeConfiguredFieldValue({key:"rate",label:"Rate",custom:true,fieldType:"currency",validation:{min:0,max:100}}, "12.345"),12.35);
  assert.throws(()=>normalizeConfiguredFieldValue({key:"rate",label:"Rate",fieldType:"currency",validation:{min:0,max:100}},"101"),/cannot be more than 100/i);
  assert.equal(normalizeConfiguredFieldValue({key:"billDate",label:"Bill date",fieldType:"date"},"2026-10-31"),"2026-10-31");
  assert.throws(()=>normalizeConfiguredFieldValue({key:"billDate",label:"Bill date",fieldType:"date"},"2026-02-30"),/valid date/i);
  assert.equal(normalizeConfiguredFieldValue({key:"email",label:"Email",custom:true,fieldType:"email"},"OWNER@EXAMPLE.COM"),"owner@example.com");
  assert.throws(()=>normalizeConfiguredFieldValue({key:"email",label:"Email",fieldType:"email"},"not-an-email"),/valid email/i);
  assert.equal(normalizeConfiguredFieldValue({key:"phone",label:"Phone",fieldType:"phone"},"+91 99999 88888"),"+91 99999 88888");
  assert.throws(()=>normalizeConfiguredFieldValue({key:"phone",label:"Phone",fieldType:"phone"},"call me"),/valid phone/i);
  assert.equal(normalizeConfiguredFieldValue({key:"website",label:"Website",custom:true,fieldType:"url"},"https://example.com"),"https://example.com");
  assert.throws(()=>normalizeConfiguredFieldValue({key:"website",label:"Website",fieldType:"url"},"javascript:alert(1)"),/valid website/i);
});

test("server preserves an explicit false boolean and rejects ambiguous input",()=>{
  assert.equal(normalizeConfiguredFieldValue({key:"verified",label:"Verified",custom:true,fieldType:"boolean"},false),false);
  assert.equal(normalizeConfiguredFieldValue({key:"verified",label:"Verified",custom:true,fieldType:"boolean"},"false"),false);
  assert.throws(()=>normalizeConfiguredFieldValue({key:"verified",label:"Verified",fieldType:"boolean"},"maybe"),/choose yes or no/i);
});

test("server validation does not require a field hidden or disabled by its rules",()=>{
  const fields=[{
    key:"gstNumber",
    label:"GST Number",
    custom:true,
    fieldType:"text",
    required:true,
    conditions:[
      {action:"hide",fieldKey:"customerType",operator:"equals",value:"Individual"},
      {action:"disable",fieldKey:"accountStatus",operator:"equals",value:"Inactive"}
    ]
  }];
  assert.doesNotThrow(()=>validateConfiguredFormValues({
    fields,
    values:{},
    customFields:{customerType:"Individual",accountStatus:"Active",gstNumber:""},
    validateAllValues:true
  }));
  assert.doesNotThrow(()=>validateConfiguredFormValues({
    fields,
    values:{},
    customFields:{customerType:"Business",accountStatus:"Inactive",gstNumber:""},
    validateAllValues:true
  }));
  assert.throws(()=>validateConfiguredFormValues({
    fields,
    values:{},
    customFields:{customerType:"Business",accountStatus:"Active",gstNumber:""},
    validateAllValues:true
  }),/Please complete “GST Number”/i);
});


test("server marks fields read-only when a business condition is met",()=>{
  const field={
    key:"completionNote",
    label:"Completion note",
    custom:true,
    fieldType:"text",
    conditions:[{action:"readonly",fieldKey:"status",operator:"equals",value:"Completed"}]
  };
  assert.equal(getConfiguredFieldState(field,{status:"Pending"}).readOnly,false);
  assert.equal(getConfiguredFieldState(field,{status:"Completed"}).readOnly,true);
});

test("server preserves saved values when a field is conditionally read-only or hidden",()=>{
  const fields=[
    {
      key:"completionNote",
      label:"Completion note",
      custom:true,
      fieldType:"text",
      conditions:[{action:"readonly",fieldKey:"status",operator:"equals",value:"Completed"}]
    },
    {
      key:"personalNote",
      label:"Personal note",
      custom:true,
      fieldType:"text",
      conditions:[{action:"hide",fieldKey:"customerType",operator:"equals",value:"Business"}]
    }
  ];
  const preserved=require("../utils/configuredFormValidation").preserveNonEditableFields({
    fields,
    values:{status:"Completed",customerType:"Business"},
    customFields:{completionNote:"Forged completion note",personalNote:"Forged hidden note"},
    existingValues:{status:"Completed",customerType:"Business"},
    existingCustomFields:{completionNote:"Manager approved",personalNote:"Keep historical note"}
  });
  assert.equal(preserved.customFields.completionNote,"Manager approved");
  assert.equal(preserved.customFields.personalNote,"Keep historical note");
});

test("server preserves a non-editable field's configured default on new records",()=>{
  const fields=[{
    key:"origin",
    label:"Origin",
    custom:true,
    fieldType:"text",
    editable:false,
    defaultValue:"Created in billing"
  }];
  const preserved=require("../utils/configuredFormValidation").preserveNonEditableFields({
    fields,
    values:{},
    customFields:{origin:"Forged origin"},
    existingValues:{},
    existingCustomFields:{}
  });
  assert.equal(preserved.customFields.origin,"Created in billing");
});
