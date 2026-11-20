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
  {key:"clean",name:"Professional classic",category:"Everyday",description:"A complete, balanced GST invoice for everyday business",accent:"#284b70"},
  {key:"modern",name:"Modern blue",category:"Business",description:"A crisp blue business invoice with clear sections and strong totals",accent:"#2563eb"},
  {key:"classic-gst",name:"GST standard",category:"GST",description:"A formal GST layout with buyer, invoice and tax details",accent:"#334155"},
  {key:"elegant",name:"Executive navy",category:"Premium",description:"A premium dark header with refined blue-grey sections",accent:"#172554"},
  {key:"compact",name:"Compact A5",category:"Compact",description:"A space-conscious layout for short invoices and counter billing",accent:"#0f766e"},
  {key:"retail",name:"Retail warm",category:"Retail",description:"A bold, friendly invoice for shops and retail businesses",accent:"#c2410c"},
  {key:"premium",name:"Premium teal",category:"Premium",description:"A polished teal design with soft panels and clean typography",accent:"#0f766e"},
  {key:"minimal",name:"Minimal mono",category:"Minimal",description:"A restrained monochrome design with a premium editorial feel",accent:"#475569"}
];

const block=(id,type,fieldKey,label,x,y,w,h,extra={})=>({
  id,type,fieldKey:fieldKey||"",label:label||"",text:"",
  x,y,w,h,fontSize:10,bold:false,align:"left",color:"#172335",
  backgroundColor:"transparent",borderColor:"#d8e0e9",borderWidth:0,
  borderRadius:0,padding:1,fontFamily:"Arial",italic:false,opacity:1,
  lineHeight:1.25,letterSpacing:0,textDecoration:"none",textTransform:"none",verticalAlign:"top",
  visible:true,showLabel:true,...extra
});
const field=(id,key,x,y,w,h,extra={})=>block(id,"field",key,FIELD_LABELS[key]||"Invoice field",x,y,w,h,extra);
const text=(id,value,x,y,w,h,extra={})=>block(id,"text","",value,x,y,w,h,{text:value,label:value,...extra});
const shape=(id,x,y,w,h,backgroundColor,extra={})=>block(id,"shape","","",x,y,w,h,{backgroundColor,...extra});
const line=(id,x,y,w,color="#cbd5e1")=>block(id,"divider","","Divider",x,y,w,0.5,{color,borderWidth:0});
const logo=(id,x,y,w,h)=>block(id,"logo","logo","Business logo",x,y,w,h,{align:"center",padding:0});
const items=(id,x,y,w,h,extra={})=>block(id,"items_table","items","Invoice items",x,y,w,h,{fontSize:8,tableHeaderBackground:"#edf2f7",tableHeaderColor:"#172335",tableBorderColor:"#b8c4d1",tableBorderWidth:0.7,tableCellPadding:4,alternateRows:true,...extra});
const totals=(id,x,y,w,h,extra={})=>block(id,"totals","totals","Invoice totals",x,y,w,h,{fontSize:8.5,color:"#172335",...extra});

function createInvoiceDesignTemplate(id,key="clean"){
  const preset=INVOICE_DESIGN_PRESETS.find(item=>item.key===key)||INVOICE_DESIGN_PRESETS[0];
  const variants={
    clean:{accent:"#284b70",soft:"#edf3f8",deep:"#1e3a5b",header:"line",border:"#cbd5e1"},
    modern:{accent:"#2563eb",soft:"#dbeafe",deep:"#1d4ed8",header:"band",border:"#93c5fd"},
    "classic-gst":{accent:"#334155",soft:"#e2e8f0",deep:"#1e293b",header:"center",border:"#94a3b8"},
    elegant:{accent:"#172554",soft:"#eef2ff",deep:"#172554",header:"dark",border:"#c7d2fe"},
    compact:{accent:"#0f766e",soft:"#ccfbf1",deep:"#115e59",header:"compact",border:"#99f6e4"},
    retail:{accent:"#c2410c",soft:"#fff7ed",deep:"#9a3412",header:"warm",border:"#fdba74"},
    premium:{accent:"#0f766e",soft:"#f0fdfa",deep:"#134e4a",header:"teal",border:"#99f6e4"},
    minimal:{accent:"#475569",soft:"#f8fafc",deep:"#0f172a",header:"minimal",border:"#cbd5e1"}
  };
  const style=variants[key]||variants.clean;
  const compact=key==="compact";
  const band=["band","dark","warm"].includes(style.header);
  const pageSize=compact?"A5":"A4";
  const blocks=[];

  if(band){
    const bandHeight=style.header==="dark"?23:style.header==="warm"?21:22;
    blocks.push(shape("brand-band",0,0,100,bandHeight,style.deep));
    blocks.push(field("company-name","company_name",6,4,64,6,{fontSize:18,bold:true,color:"#ffffff"}));
    blocks.push(field("company-address","company_address",6,11,67,4,{fontSize:8,color:"#f8fafc"}));
    blocks.push(field("company-phone","company_phone",6,16,36,3,{fontSize:7.5,color:"#f8fafc",showLabel:false}));
    blocks.push(field("company-gstin","company_gstin",6,19,54,2.5,{fontSize:7.5,bold:true,color:"#f8fafc"}));
    blocks.push(logo("business-logo",83,4,11,12));
  }else if(style.header==="center"){
    blocks.push(logo("business-logo",5,4,12,12));
    blocks.push(field("company-name","company_name",19,4,66,6,{fontSize:18,bold:true,align:"center",color:style.deep}));
    blocks.push(field("company-address","company_address",19,11,66,4,{fontSize:8,align:"center",color:"#475569"}));
    blocks.push(field("company-phone","company_phone",19,16,66,3,{fontSize:7.5,align:"center",showLabel:false}));
    blocks.push(field("company-gstin","company_gstin",19,19,66,2.5,{fontSize:7.5,bold:true,align:"center"}));
    blocks.push(shape("header-rule",5,23,90,0.8,style.border));
  }else{
    blocks.push(shape("top-accent",0,0,100,style.header==="compact"?1.7:2.2,style.accent));
    blocks.push(field("company-name","company_name",6,4,63,6,{fontSize:compact?15:18,bold:true,color:style.deep}));
    blocks.push(field("company-address","company_address",6,11,66,4,{fontSize:compact?7:8,color:"#64748b"}));
    blocks.push(field("company-phone","company_phone",6,16,37,3,{fontSize:7.5,showLabel:false,color:"#64748b"}));
    blocks.push(field("company-email","company_email",44,16,32,3,{fontSize:7.5,showLabel:false,color:"#64748b"}));
    blocks.push(field("company-gstin","company_gstin",6,19.5,65,2.5,{fontSize:7.5,bold:true,color:"#475569"}));
    blocks.push(logo("business-logo",83,4,11,12));
  }

  const titleY=band?24:style.header==="center"?24:23;
  blocks.push(field("invoice-heading","invoice_title",6,titleY,48,5,{fontSize:compact?11:13,bold:true,color:style.accent,showLabel:false}));
  blocks.push(shape("customer-panel",5,29,53,18,style.soft,{borderColor:style.border,borderWidth:0.35,borderRadius:key==="minimal"?0:2}));
  blocks.push(shape("invoice-panel",60,29,35,18,key==="minimal"?"#ffffff":"#f8fafc",{borderColor:style.border,borderWidth:0.35,borderRadius:key==="minimal"?0:2}));
  // Reinsert headings after panels so text remains above their backgrounds.
  blocks.push(text("bill-to-label","BILL TO",7,30,46,2.5,{fontSize:7.5,bold:true,color:style.accent}));
  blocks.push(field("customer-name","customer_name",7,33,47,3.5,{fontSize:9.5,bold:true,color:style.deep}));
  blocks.push(field("customer-address","customer_address",7,37,47,4.2,{fontSize:7.2,color:"#475569"}));
  blocks.push(field("customer-phone","customer_phone",7,41.5,24,2.4,{fontSize:6.8,showLabel:true,color:"#475569"}));
  blocks.push(field("customer-gstin","customer_gstin",32,41.5,23,2.4,{fontSize:6.8,showLabel:true,color:"#475569"}));
  blocks.push(text("invoice-details-label","INVOICE DETAILS",62,30,31,2.5,{fontSize:7.5,bold:true,color:style.accent}));
  blocks.push(field("invoice-no","invoice_no",62,33,31,2.4,{fontSize:8,bold:true,color:style.deep}));
  blocks.push(field("invoice-date","invoice_date",62,35.7,31,2.4,{fontSize:7.2}));
  blocks.push(field("due-date","due_date",62,38.4,31,2.4,{fontSize:7.2}));
  blocks.push(field("challan-no","challan_no",62,41.1,31,2.4,{fontSize:7.2}));
  blocks.push(field("payment-terms","payment_terms",62,43.8,31,2.4,{fontSize:7.2}));
  blocks.push(items("item-table",5,49,90,27.5,{
    fontSize:compact?6.8:7.5,
    tableHeaderBackground:style.accent,
    tableHeaderColor:"#ffffff",
    tableBorderColor:style.border,
    tableBorderWidth:0.6,
    tableCellPadding:compact?2:3,
    tableAlternateRowBackground:style.soft
  }));
  blocks.push(text("amount-words-label","AMOUNT IN WORDS",6,77.3,52,2,{fontSize:7,bold:true,color:style.accent}));
  blocks.push(field("amount-in-words","amount_words",6,79.5,52,4.5,{fontSize:7.1,color:"#334155"}));
  blocks.push(shape("totals-panel",60,77,35,19,style.soft,{borderColor:style.border,borderWidth:0.4,borderRadius:key==="minimal"?0:2}));
  blocks.push(totals("invoice-totals",62,78,31,17.5,{fontSize:compact?7:8,color:style.deep}));
  blocks.push(text("terms-heading","TERMS & CONDITIONS",6,85,51,2,{fontSize:7,bold:true,color:style.accent}));
  blocks.push(field("terms","terms",6,87,51,5.5,{fontSize:6.8,color:"#64748b"}));
  blocks.push(field("bank-details","bank_details",6,93,51,3,{fontSize:6.7,color:"#64748b"}));
  blocks.push(line("signature-rule",65,98,29,style.border));
  blocks.push(field("signature","signature",62,98,33,2,{fontSize:7.2,bold:true,align:"right",color:style.deep}));

  return {
    id,name:preset.name,templateKey:key,pageSize,orientation:"portrait",
    printMargins:{top:0,right:0,bottom:0,left:0},
    background:{url:"",type:"none",locked:true,visible:true},
    blocks
  };
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
