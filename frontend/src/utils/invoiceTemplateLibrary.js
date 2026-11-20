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
const column=(key,label,width)=>({key,label,width,visible:true});
const INVOICE_DESIGN_PRESETS=[
 {key:"textile-wholesale",name:"Textile wholesale",category:"Textile & fabric",description:"Wide GST invoice for fabric lots, design numbers, cuts, metres and short pieces",accent:"#173b63",deep:"#102a46",soft:"#edf4fa",border:"#c5d5e4",header:"band",pageSize:"A4",orientation:"landscape",columns:[column("sr","#",4),column("designNumber","Design",10),column("description","Fabric / item description",22),column("hsnCode","HSN",7),column("quantity","Pcs",6),column("cut","Cut",6),column("MTR","MTR",9),column("shortPcs","Short",6),column("unitPrice","Rate",11),column("amount","Amount",19)]},
 {key:"garment-workshop",name:"Garment & job work",category:"Manufacturing",description:"Production-ready layout for job work, stitching, design references and quantities",accent:"#315b4d",deep:"#183c32",soft:"#edf5f0",border:"#c9ddd2",header:"split",pageSize:"A4",orientation:"landscape",columns:[column("sr","#",5),column("designNumber","Style / design",14),column("description","Garment / work details",25),column("quantity","Quantity",10),column("qtyUnit","Unit",7),column("cut","Cut",7),column("shortPcs","Short pcs",7),column("unitPrice","Work rate",12),column("amount","Amount",13)]},
 {key:"retail-counter",name:"Retail counter bill",category:"Retail & POS",description:"Compact A5 counter invoice with clear product, quantity, price and payable total",accent:"#9a4b20",deep:"#713515",soft:"#fff2e8",border:"#f0d4bd",header:"warm",pageSize:"A5",orientation:"portrait",columns:[column("sr","#",6),column("description","Product",42),column("quantity","Qty",12),column("qtyUnit","Unit",9),column("unitPrice","Rate",14),column("amount","Amount",17)]},
 {key:"fashion-retail",name:"Fashion & apparel store",category:"Retail & POS",description:"Customer-friendly retail invoice for apparel, styles, quantities and GST",accent:"#8b3d69",deep:"#51233f",soft:"#fbf0f6",border:"#e8cfe0",header:"center",pageSize:"A4",orientation:"portrait",columns:[column("sr","#",5),column("designNumber","Style",13),column("description","Item / colour / size",30),column("hsnCode","HSN",8),column("quantity","Qty",10),column("unitPrice","Rate",15),column("amount","Amount",19)]},
 {key:"jewellery-premium",name:"Jewellery & ornaments",category:"Speciality retail",description:"Premium dark-and-gold presentation for item references, HSN, quantity and value",accent:"#98733a",deep:"#29251f",soft:"#f7f3e9",border:"#d9c9a7",header:"dark",pageSize:"A4",orientation:"portrait",columns:[column("sr","#",5),column("designNumber","Item code",17),column("description","Description / details",29),column("hsnCode","HSN",9),column("quantity","Qty",9),column("unitPrice","Unit value",14),column("amount","Total",17)]},
 {key:"electronics-distribution",name:"Electronics distribution",category:"Wholesale & distribution",description:"Distributor invoice with product description, HSN, quantity, discount and totals",accent:"#2455a4",deep:"#17376d",soft:"#edf3ff",border:"#c7d6f5",header:"split",pageSize:"A4",orientation:"landscape",columns:[column("sr","#",5),column("description","Product / model",32),column("hsnCode","HSN",10),column("quantity","Qty",9),column("qtyUnit","Unit",8),column("unitPrice","Rate",14),column("discount","Disc. %",8),column("amount","Amount",14)]},
 {key:"pharma-distribution",name:"Pharma distribution",category:"Wholesale & distribution",description:"Clean stockist invoice with medicine details, HSN, pack units, quantity and rate",accent:"#11756e",deep:"#0d4d49",soft:"#eaf7f5",border:"#bee1dc",header:"center",pageSize:"A4",orientation:"landscape",columns:[column("sr","#",5),column("description","Medicine / product",31),column("hsnCode","HSN",12),column("quantity","Qty",10),column("qtyUnit","Pack",10),column("unitPrice","Rate",13),column("discount","Disc. %",7),column("amount","Amount",12)]},
 {key:"building-materials",name:"Building materials",category:"Construction & supplies",description:"Supplier invoice for material, HSN, quantities, units and delivery challan references",accent:"#5b5144",deep:"#332d26",soft:"#f4f1ec",border:"#d8d0c5",header:"band",pageSize:"A4",orientation:"landscape",columns:[column("sr","#",5),column("description","Material description",34),column("hsnCode","HSN",10),column("quantity","Qty",10),column("qtyUnit","Unit",9),column("unitPrice","Rate",14),column("amount","Amount",18)]},
 {key:"professional-services",name:"Professional services",category:"Services",description:"Elegant service invoice for consulting, design, labour, retainers and professional fees",accent:"#36516b",deep:"#1d3348",soft:"#f0f4f7",border:"#d2dde6",header:"minimal",pageSize:"A4",orientation:"portrait",columns:[column("sr","#",6),column("description","Service / engagement",48),column("quantity","Hours / units",12),column("qtyUnit","Unit",9),column("unitPrice","Rate",12),column("amount","Fee",13)]},
 {key:"transport-logistics",name:"Transport & logistics",category:"Transport & logistics",description:"Dispatch-focused layout for consignment details, challan, E-Way Bill and freight charges",accent:"#344d63",deep:"#1d3448",soft:"#eef3f7",border:"#cad8e2",header:"band",pageSize:"A4",orientation:"landscape",columns:[column("sr","#",5),column("description","Goods / consignment",33),column("hsnCode","HSN",10),column("quantity","Packages",10),column("qtyUnit","Unit",8),column("unitPrice","Freight rate",14),column("amount","Freight",20)]},
 {key:"food-catering",name:"Food & catering",category:"Food & hospitality",description:"Warm, readable invoice for catering orders, menu items, servings, delivery and charges",accent:"#a44b27",deep:"#6f2c18",soft:"#fff3e9",border:"#f0d3c0",header:"warm",pageSize:"A4",orientation:"portrait",columns:[column("sr","#",5),column("description","Menu / package",43),column("quantity","Servings",12),column("qtyUnit","Unit",9),column("unitPrice","Rate",14),column("amount","Amount",17)]},
 {key:"gst-wholesale",name:"GST wholesale invoice",category:"Wholesale & distribution",description:"Formal wholesale format with HSN, taxable value, tax split, payment and bank details",accent:"#334c65",deep:"#1b3045",soft:"#eef3f8",border:"#cbd7e2",header:"split",pageSize:"A4",orientation:"portrait",columns:[column("sr","#",5),column("description","Product description",35),column("hsnCode","HSN",10),column("quantity","Qty",10),column("qtyUnit","Unit",8),column("unitPrice","Rate",14),column("amount","Amount",18)]},
 {key:"modern-business",name:"Modern business invoice",category:"General business",description:"Contemporary blue layout with generous spacing, clear customer details and prominent balance",accent:"#3569b6",deep:"#193a68",soft:"#edf4ff",border:"#cad9f1",header:"split",pageSize:"A4",orientation:"portrait",columns:[column("sr","#",5),column("description","Description",39),column("hsnCode","HSN",9),column("quantity","Qty",10),column("qtyUnit","Unit",8),column("unitPrice","Rate",13),column("amount","Amount",16)]},
 {key:"executive-minimal",name:"Executive minimal",category:"General business",description:"Quiet monochrome design with refined typography and a clean, uncluttered hierarchy",accent:"#4b5563",deep:"#202a35",soft:"#f5f6f7",border:"#d7dce1",header:"minimal",pageSize:"A4",orientation:"portrait",columns:[column("sr","#",6),column("description","Description",42),column("quantity","Qty",11),column("qtyUnit","Unit",8),column("unitPrice","Rate",15),column("amount","Amount",18)]}
];
const block=(id,type,fieldKey,label,x,y,w,h,extra={})=>({id,type,fieldKey:fieldKey||"",label:label||"",text:"",x,y,w,h,fontSize:10,bold:false,align:"left",color:"#172335",backgroundColor:"transparent",borderColor:"#d8e0e9",borderWidth:0,borderRadius:0,padding:1,fontFamily:"Arial",italic:false,opacity:1,lineHeight:1.25,letterSpacing:0,textDecoration:"none",textTransform:"none",verticalAlign:"top",visible:true,showLabel:true,...extra});
const field=(id,key,x,y,w,h,extra={})=>block(id,"field",key,FIELD_LABELS[key]||"Invoice field",x,y,w,h,extra);
const text=(id,value,x,y,w,h,extra={})=>block(id,"text","",value,x,y,w,h,{text:value,label:value,...extra});
const shape=(id,x,y,w,h,backgroundColor,extra={})=>block(id,"shape","","",x,y,w,h,{backgroundColor,...extra});
const line=(id,x,y,w,color="#cbd5e1")=>block(id,"divider","","Divider",x,y,w,.55,{color,borderWidth:0});
const logo=(id,x,y,w,h,extra={})=>block(id,"logo","logo","Business logo",x,y,w,h,{align:"center",padding:0,...extra});
const items=(id,x,y,w,h,preset)=>block(id,"items_table","items","Invoice items",x,y,w,h,{fontSize:preset.pageSize==="A5"?6.8:8,tableHeaderBackground:preset.accent,tableHeaderColor:"#ffffff",tableBorderColor:preset.border,tableBorderWidth:.65,tableCellPadding:preset.pageSize==="A5"?2.5:4,tableRowBackground:"#ffffff",tableAlternateRowBackground:preset.soft,alternateRows:true,columns:preset.columns.map((item,index)=>({...item,order:index}))});
const totals=(id,x,y,w,h,preset)=>block(id,"totals","totals","Invoice totals",x,y,w,h,{fontSize:preset.pageSize==="A5"?7.2:9,color:preset.deep});

function createInvoiceDesignTemplate(id,key="modern-business"){
 const preset=INVOICE_DESIGN_PRESETS.find(item=>item.key===key)||INVOICE_DESIGN_PRESETS[0];
 const compact=preset.pageSize==="A5",blocks=[],band=["band","dark","warm"].includes(preset.header);
 if(band){
  blocks.push(shape("brand-band",0,0,100,preset.header==="dark"?24:22,preset.deep));
  blocks.push(field("company-name","company_name",6,4,68,5.5,{fontSize:compact?15:19,bold:true,color:"#ffffff",showLabel:false}));
  blocks.push(field("company-address","company_address",6,10.5,69,3.7,{fontSize:8,color:"#f7fafc",showLabel:false}));
  blocks.push(field("company-phone","company_phone",6,15,34,2.6,{fontSize:7.4,color:"#e8eef4",showLabel:false}));
  blocks.push(field("company-gstin","company_gstin",42,15,34,2.6,{fontSize:7.4,bold:true,color:"#ffffff",showLabel:false}));
  blocks.push(logo("business-logo",84,4,10,12,{backgroundColor:"rgba(255,255,255,.1)",borderColor:"#ffffff",borderWidth:.4,borderRadius:2}));
 }else if(preset.header==="center"){
  blocks.push(shape("top-accent",0,0,100,1.6,preset.accent));
  blocks.push(logo("business-logo",5,4,12,11));
  blocks.push(field("company-name","company_name",19,4,62,5.4,{fontSize:18,bold:true,align:"center",color:preset.deep,showLabel:false}));
  blocks.push(field("company-address","company_address",19,10,62,3.5,{fontSize:7.8,align:"center",color:"#617184",showLabel:false}));
  blocks.push(field("company-phone","company_phone",19,14,62,2.7,{fontSize:7.3,align:"center",color:"#617184",showLabel:false}));
  blocks.push(field("company-gstin","company_gstin",19,17,62,2.7,{fontSize:7.4,bold:true,align:"center",color:preset.accent,showLabel:false}));
  blocks.push(line("header-rule",5,22,90,preset.border));
 }else{
  blocks.push(shape("top-accent",0,0,100,preset.header==="minimal"?1:2,preset.accent));
  blocks.push(logo("business-logo",5,4,12,11));
  blocks.push(field("company-name","company_name",20,4,49,5.5,{fontSize:18,bold:true,color:preset.deep,showLabel:false}));
  blocks.push(field("company-address","company_address",20,10,50,3.8,{fontSize:7.8,color:"#65758a",showLabel:false}));
  blocks.push(field("company-phone","company_phone",20,14.2,25,2.5,{fontSize:7.3,color:"#65758a",showLabel:false}));
  blocks.push(field("company-email","company_email",46,14.2,30,2.5,{fontSize:7.3,color:"#65758a",showLabel:false}));
  blocks.push(field("company-gstin","company_gstin",20,17.2,53,2.5,{fontSize:7.4,bold:true,color:preset.accent,showLabel:false}));
  blocks.push(line("header-rule",5,22.5,90,preset.border));
 }
 const titleY=band?24:23;
 blocks.push(field("invoice-heading","invoice_title",6,titleY,54,5.2,{fontSize:compact?11:13.5,bold:true,color:preset.accent,showLabel:false}));
 blocks.push(text("invoice-copy-type",preset.category==="Retail & POS"?"CUSTOMER COPY":"ORIGINAL FOR RECIPIENT",66,titleY+1,28,2.5,{fontSize:6.4,bold:true,align:"right",color:"#748398",textTransform:"uppercase"}));
 blocks.push(shape("customer-panel",5,29,56,18,preset.soft,{borderColor:preset.border,borderWidth:.45,borderRadius:preset.header==="minimal"?0:2}));
 blocks.push(shape("invoice-panel",63,29,32,18,"#fbfcfd",{borderColor:preset.border,borderWidth:.45,borderRadius:preset.header==="minimal"?0:2}));
 blocks.push(text("bill-to-label",preset.category==="Services"?"BILL TO / CLIENT":"BILL TO",7,30,49,2.3,{fontSize:7,bold:true,color:preset.accent}));
 blocks.push(field("customer-name","customer_name",7,33,50,3.2,{fontSize:9.2,bold:true,color:preset.deep}));
 blocks.push(field("customer-address","customer_address",7,36.6,50,4,{fontSize:7.1,color:"#536477"}));
 blocks.push(field("customer-phone","customer_phone",7,41,24,2.3,{fontSize:6.7,color:"#536477"}));
 blocks.push(field("customer-gstin","customer_gstin",32,41,25,2.3,{fontSize:6.7,color:"#536477"}));
 blocks.push(text("invoice-details-label","INVOICE DETAILS",65,30,28,2.3,{fontSize:7,bold:true,color:preset.accent}));
 blocks.push(field("invoice-no","invoice_no",65,32.8,28,2.3,{fontSize:7.5,bold:true,color:preset.deep}));
 blocks.push(field("invoice-date","invoice_date",65,35.3,28,2.3,{fontSize:7}));
 blocks.push(field("due-date","due_date",65,37.8,28,2.3,{fontSize:7}));
 blocks.push(field("challan-no","challan_no",65,40.3,28,2.3,{fontSize:6.8}));
 blocks.push(field("payment-terms","payment_terms",65,42.8,28,2.3,{fontSize:6.8}));
 blocks.push(text("items-caption",preset.category==="Services"?"SERVICE DETAILS":preset.category==="Transport & logistics"?"GOODS / FREIGHT DETAILS":preset.category==="Textile & fabric"?"FABRIC / DESIGN DETAILS":"PRODUCT / SERVICE DETAILS",5,47.2,90,1.7,{fontSize:6.4,bold:true,color:preset.accent}));
 blocks.push(items("item-table",5,49,90,compact?29:29.5,preset));
 blocks.push(text("amount-words-label","AMOUNT IN WORDS",6,79.2,53,2,{fontSize:6.8,bold:true,color:preset.accent}));
 blocks.push(field("amount-in-words","amount_words",6,81.2,53,5,{fontSize:7,color:"#43536a"}));
 blocks.push(shape("totals-panel",62,79,33,17,preset.soft,{borderColor:preset.border,borderWidth:.45,borderRadius:preset.header==="minimal"?0:2}));
 blocks.push(totals("invoice-totals",64,80,29,15,preset));
 blocks.push(text("terms-heading","TERMS & CONDITIONS",6,88.2,51,1.8,{fontSize:6.5,bold:true,color:preset.accent}));
 blocks.push(field("terms","terms",6,90,52,4.5,{fontSize:6.4,color:"#637287"}));
 blocks.push(field("bank-details","bank_details",6,95,54,3,{fontSize:6.3,color:"#637287"}));
 blocks.push(line("signature-rule",66,96.2,28,preset.border));
 blocks.push(field("signature","signature",62,97,33,2.4,{fontSize:6.8,bold:true,align:"right",color:preset.deep}));
 return {id,name:preset.name,templateKey:key,pageSize:preset.pageSize||"A4",orientation:preset.orientation||"portrait",elementLimit:80,printMargins:{top:0,right:0,bottom:0,left:0},background:{url:"",type:"none",locked:true,visible:true},blocks};
}
function createBlankInvoiceDesignTemplate(id,name="Blank design"){
 return {id,name,templateKey:"blank",pageSize:"A4",orientation:"portrait",elementLimit:80,printMargins:{top:0,right:0,bottom:0,left:0},background:{url:"",type:"none",locked:true,visible:true},blocks:[]};
}
export {INVOICE_DESIGN_PRESETS,createInvoiceDesignTemplate,createBlankInvoiceDesignTemplate};
