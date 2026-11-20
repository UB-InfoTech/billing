const FIELD_LABELS={
  company_name:"Business name",company_address:"Business address",company_gstin:"Business GSTIN",
  company_phone:"Business phone",company_email:"Business email",customer_name:"Customer name",
  customer_address:"Customer address",customer_phone:"Customer phone",customer_gstin:"Customer GSTIN",
  customer_state:"Customer state",invoice_title:"Invoice title",invoice_no:"Invoice number",
  invoice_date:"Invoice date",due_date:"Due date",challan_no:"Challan number",payment_terms:"Payment terms",
  eway_bill:"E-Way Bill",subtotal:"Subtotal",discount:"Discount",taxable_value:"Taxable value",
  cgst:"CGST",sgst:"SGST",igst:"IGST",round_off:"Round off",grand_total:"Invoice total",
  amount_paid:"Amount paid",balance_due:"Balance due",amount_words:"Amount in words",
  bank_details:"Bank details",terms:"Terms and conditions",signature:"Authorised signatory"
};

const INVOICE_DESIGN_PRESETS=[
  {key:"clean",name:"Clean & simple",category:"Everyday",description:"Balanced, spacious and easy to read",accent:"#284b70"},
  {key:"modern",name:"Modern blue",category:"Business",description:"Confident blue accents and clear hierarchy",accent:"#2563eb"},
  {key:"classic-gst",name:"Classic GST",category:"GST",description:"Traditional layout with clear tax and buyer details",accent:"#334155"},
  {key:"elegant",name:"Elegant dark",category:"Premium",description:"Deep navy header with a premium finish",accent:"#172554"},
  {key:"compact",name:"Compact A5",category:"Compact",description:"Space-conscious design for smaller invoices",accent:"#0f766e"},
  {key:"retail",name:"Retail bold",category:"Retail",description:"Strong totals and clear customer information",accent:"#c2410c"},
  {key:"premium",name:"Premium teal",category:"Premium",description:"Refined teal details and soft section panels",accent:"#0f766e"},
  {key:"minimal",name:"Minimal",category:"Minimal",description:"A quiet, borderless layout with generous space",accent:"#475569"}
];

const block=(id,type,fieldKey,label,x,y,w,h,extra={})=>({
  id,type,fieldKey:fieldKey||"",label:label||"",text:"",
  x,y,w,h,fontSize:10,bold:false,align:"left",color:"#172335",
  backgroundColor:"transparent",borderColor:"#d8e0e9",borderWidth:0,
  borderRadius:0,padding:1,fontFamily:"Arial",italic:false,opacity:1,
  visible:true,showLabel:true,...extra
});
const field=(id,key,x,y,w,h,extra={})=>block(id,"field",key,FIELD_LABELS[key]||"Invoice field",x,y,w,h,extra);
const shape=(id,x,y,w,h,backgroundColor,extra={})=>block(id,"shape","","",x,y,w,h,{backgroundColor,...extra});
const line=(id,x,y,w,color="#cbd5e1")=>block(id,"divider","", "Divider",x,y,w,0.5,{color,borderWidth:0});
const logo=(id,x,y,w,h)=>block(id,"logo","logo","Business logo",x,y,w,h,{align:"center",padding:0});
const items=(id,x,y,w,h,extra={})=>block(id,"items_table","items","Invoice items",x,y,w,h,{fontSize:8,...extra});
const totals=(id,x,y,w,h,extra={})=>block(id,"totals","totals","Invoice totals",x,y,w,h,{fontSize:9,...extra});

function commonFooter(accent="#172335",compact=false){
  return [
    field("terms","terms",6,compact?88:82,53,compact?7:10,{fontSize:compact?7:8,color:"#64748b"}),
    field("signature","signature",64,compact?92:94,30,4,{fontSize:8,bold:true,align:"right",color:accent})
  ];
}

function createInvoiceDesignTemplate(id,key="clean"){
  const preset=INVOICE_DESIGN_PRESETS.find(item=>item.key===key)||INVOICE_DESIGN_PRESETS[0];
  const accent=preset.accent;
  const base={
    id,name:preset.name,templateKey:key,pageSize:key==="compact"?"A5":"A4",orientation:"portrait",
    printMargins:{top:0,right:0,bottom:0,left:0},
    background:{url:"",type:"none",locked:true,visible:true}
  };
  let blocks=[];
  if(key==="elegant"){
    blocks=[
      shape("top-panel",0,0,100,23,"#172554"),
      field("company-name","company_name",6,5,61,6,{fontSize:19,bold:true,color:"#ffffff"}),
      field("company-address","company_address",6,12,62,5,{fontSize:8,color:"#e0e7ff"}),
      field("company-gstin","company_gstin",6,18,60,3,{fontSize:8,bold:true,color:"#e0e7ff"}),
      logo("business-logo",82,4,12,12),
      field("invoice-title","invoice_title",67,27,27,5,{fontSize:14,bold:true,align:"right",color:accent}),
      field("invoice-number","invoice_no",67,33,27,4,{fontSize:9,bold:true,align:"right"}),
      shape("customer-panel",5,26,54,15,"#f1f5f9",{borderRadius:4}),
      field("customer-name","customer_name",7,28,48,5,{fontSize:11,bold:true}),
      field("customer-address","customer_address",7,34,48,6,{fontSize:8,color:"#475569"}),
      field("invoice-date","invoice_date",67,39,27,4,{fontSize:8,align:"right"}),
      field("due-date","due_date",67,44,27,4,{fontSize:8,align:"right"}),
      items("item-table",5,51,90,28,{fontSize:8,backgroundColor:"#e0e7ff",borderColor:"#c7d2fe"}),
      totals("invoice-totals",62,81,33,13,{fontSize:8,color:accent}),
      ...commonFooter(accent)
    ];
  }else if(key==="classic-gst"){
    blocks=[
      field("company-name","company_name",6,4,88,6,{fontSize:18,bold:true,align:"center"}),
      field("company-address","company_address",10,11,80,5,{fontSize:8,align:"center",color:"#475569"}),
      field("company-gstin","company_gstin",10,17,80,4,{fontSize:9,bold:true,align:"center"}),
      logo("business-logo",4,4,10,12),
      shape("title-band",5,23,90,6,"#e2e8f0",{borderColor:"#94a3b8",borderWidth:0.5,borderRadius:1}),
      field("invoice-title","invoice_title",6,23.5,88,5,{fontSize:12,bold:true,align:"center"}),
      field("customer-name","customer_name",7,31,43,5,{fontSize:10,bold:true}),
      field("customer-address","customer_address",7,37,43,8,{fontSize:8}),
      field("customer-gstin","customer_gstin",7,45,43,4,{fontSize:8}),
      field("invoice-no","invoice_no",56,31,38,4,{fontSize:9,bold:true,align:"right"}),
      field("invoice-date","invoice_date",56,36,38,4,{fontSize:8,align:"right"}),
      field("challan-no","challan_no",56,41,38,4,{fontSize:8,align:"right"}),
      field("due-date","due_date",56,46,38,4,{fontSize:8,align:"right"}),
      line("header-rule",5,51,90,"#64748b"),
      items("item-table",5,53,90,26,{fontSize:8,backgroundColor:"#e2e8f0",borderColor:"#64748b"}),
      totals("invoice-totals",61,81,34,13,{fontSize:8,borderColor:"#64748b"}),
      ...commonFooter("#334155")
    ];
  }else if(key==="compact"){
    blocks=[
      field("company-name","company_name",5,4,66,6,{fontSize:15,bold:true,color:accent}),
      field("company-address","company_address",5,11,65,6,{fontSize:7,color:"#64748b"}),
      field("company-gstin","company_gstin",5,18,64,3,{fontSize:7,bold:true}),
      logo("business-logo",80,4,14,11),
      shape("title-band",5,23,90,5,"#ccfbf1",{borderRadius:2}),
      field("invoice-title","invoice_title",6,23,88,5,{fontSize:10,bold:true,align:"center",color:"#115e59"}),
      field("invoice-no","invoice_no",5,30,43,4,{fontSize:8,bold:true}),
      field("invoice-date","invoice_date",52,30,43,4,{fontSize:8,align:"right"}),
      field("customer-name","customer_name",5,36,90,4,{fontSize:9,bold:true}),
      field("customer-address","customer_address",5,41,90,5,{fontSize:7}),
      items("item-table",5,48,90,24,{fontSize:7,backgroundColor:"#ccfbf1",borderColor:"#99f6e4"}),
      totals("invoice-totals",60,74,35,13,{fontSize:8,color:accent}),
      ...commonFooter(accent,true)
    ];
  }else if(key==="retail"){
    blocks=[
      shape("header-band",0,0,100,21,"#9a3412"),
      field("company-name","company_name",6,4,65,7,{fontSize:19,bold:true,color:"#ffffff"}),
      field("company-address","company_address",6,12,65,4,{fontSize:8,color:"#ffedd5"}),
      logo("business-logo",82,4,12,12),
      field("invoice-title","invoice_title",6,24,48,6,{fontSize:15,bold:true,color:accent}),
      field("invoice-no","invoice_no",58,25,36,4,{fontSize:9,bold:true,align:"right"}),
      field("invoice-date","invoice_date",58,30,36,4,{fontSize:8,align:"right"}),
      shape("buyer-panel",5,36,90,11,"#fff7ed",{borderRadius:3}),
      field("customer-name","customer_name",7,38,86,4,{fontSize:10,bold:true}),
      field("customer-address","customer_address",7,43,86,3,{fontSize:7}),
      items("item-table",5,50,90,28,{fontSize:8,backgroundColor:"#ffedd5",borderColor:"#fdba74"}),
      shape("total-panel",59,80,36,12,"#ffedd5",{borderColor:"#fdba74",borderWidth:0.5,borderRadius:2}),
      totals("invoice-totals",61,81,32,10,{fontSize:8,color:"#9a3412"}),
      ...commonFooter("#9a3412")
    ];
  }else if(key==="premium"){
    blocks=[
      shape("accent-line",0,0,100,2,"#0f766e"),
      field("company-name","company_name",6,5,63,7,{fontSize:20,bold:true,color:"#134e4a"}),
      field("company-address","company_address",6,13,64,5,{fontSize:8,color:"#64748b"}),
      field("company-gstin","company_gstin",6,19,63,3,{fontSize:8,bold:true,color:"#475569"}),
      logo("business-logo",82,5,12,12),
      field("invoice-title","invoice_title",63,26,31,5,{fontSize:13,bold:true,align:"right",color:accent}),
      field("invoice-no","invoice_no",63,32,31,4,{fontSize:8,align:"right"}),
      field("invoice-date","invoice_date",63,37,31,4,{fontSize:8,align:"right"}),
      shape("customer-panel",5,26,52,16,"#f0fdfa",{borderColor:"#ccfbf1",borderWidth:0.5,borderRadius:3}),
      field("customer-name","customer_name",7,28,48,5,{fontSize:10,bold:true,color:"#134e4a"}),
      field("customer-address","customer_address",7,34,48,7,{fontSize:8}),
      items("item-table",5,47,90,29,{fontSize:8,backgroundColor:"#ccfbf1",borderColor:"#99f6e4"}),
      totals("invoice-totals",62,78,33,15,{fontSize:9,color:"#134e4a"}),
      ...commonFooter("#134e4a")
    ];
  }else if(key==="minimal"){
    blocks=[
      field("company-name","company_name",5,5,66,7,{fontSize:20,bold:true,color:"#0f172a"}),
      field("company-address","company_address",5,13,66,5,{fontSize:8,color:"#64748b"}),
      field("company-gstin","company_gstin",5,19,66,3,{fontSize:8}),
      logo("business-logo",82,5,12,12),
      field("invoice-title","invoice_title",5,27,50,6,{fontSize:14,bold:true}),
      field("invoice-no","invoice_no",62,28,33,4,{fontSize:9,bold:true,align:"right"}),
      line("rule-1",5,35,90,"#cbd5e1"),
      field("customer-name","customer_name",5,39,50,5,{fontSize:10,bold:true}),
      field("customer-address","customer_address",5,45,50,7,{fontSize:8,color:"#64748b"}),
      field("invoice-date","invoice_date",62,39,33,4,{fontSize:8,align:"right"}),
      field("due-date","due_date",62,44,33,4,{fontSize:8,align:"right"}),
      items("item-table",5,55,90,24,{fontSize:8,borderColor:"#cbd5e1"}),
      totals("invoice-totals",63,81,32,13,{fontSize:8}),
      ...commonFooter("#0f172a")
    ];
  }else{
    const modern=key==="modern";
    const accentColor=modern?"#2563eb":"#284b70";
    blocks=[
      shape("accent-line",0,0,100,2.2,accentColor),
      field("company-name","company_name",6,5,60,6,{fontSize:modern?19:17,bold:true,color:modern?accentColor:"#172335"}),
      field("company-address","company_address",6,12,61,5,{fontSize:8,color:"#64748b"}),
      field("company-gstin","company_gstin",6,18,60,3,{fontSize:8,bold:true}),
      logo("business-logo",81,4,13,11),
      field("invoice-title","invoice_title",64,20,30,5,{fontSize:13,bold:true,align:"right",color:accentColor}),
      field("invoice-number","invoice_no",64,26,30,3,{fontSize:8,bold:true,align:"right"}),
      field("customer-name","customer_name",6,30,44,5,{fontSize:10,bold:true}),
      field("customer-address","customer_address",6,36,44,7,{fontSize:8}),
      field("invoice-date","invoice_date",58,30,36,4,{fontSize:9,align:"right"}),
      field("due-date","due_date",58,35,36,4,{fontSize:8,align:"right"}),
      items("item-table",6,46,88,32,{fontSize:8,backgroundColor:modern?"#dbeafe":"#edf2f7",borderColor:modern?"#93c5fd":"#b8c4d1"}),
      totals("invoice-totals",61,80,33,14,{fontSize:9,color:accentColor}),
      ...commonFooter(accentColor)
    ];
  }
  return {...base,blocks};
}

function createBlankInvoiceDesignTemplate(id,name="Blank design"){
  return {
    id,name,templateKey:"blank",pageSize:"A4",orientation:"portrait",
    printMargins:{top:0,right:0,bottom:0,left:0},
    background:{url:"",type:"none",locked:true,visible:true},
    blocks:[]
  };
}

export {INVOICE_DESIGN_PRESETS,createInvoiceDesignTemplate,createBlankInvoiceDesignTemplate};
