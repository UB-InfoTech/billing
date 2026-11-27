const FIELD_LABELS={
  company_name:"Business name",company_address:"Business address",company_gstin:"GSTIN",
  company_phone:"Phone",company_email:"Email",customer_name:"Customer name",
  customer_address:"Billing address",customer_phone:"Phone",customer_gstin:"GSTIN",
  customer_state:"State",invoice_title:"Invoice title",invoice_no:"Invoice number",
  invoice_date:"Invoice date",due_date:"Due date",challan_no:"Challan no.",
  payment_terms:"Payment terms",eway_bill:"E-Way Bill",subtotal:"Subtotal",
  discount:"Discount",taxable_value:"Taxable value",cgst:"CGST",sgst:"SGST",
  igst:"IGST",round_off:"Round off",grand_total:"Invoice total",
  amount_paid:"Amount paid",balance_due:"Balance due",amount_words:"Amount in words",
  bank_details:"Bank details",terms:"Terms and conditions",signature:"Authorised signatory"
};

const column=(key,label,width)=>({key,label,width,visible:true});
const INVOICE_DESIGN_PRESETS=[
 {key:"textile-wholesale",name:"Textile wholesale",category:"Textile & fabric",description:"GST-ready fabric invoice with design, HSN, pieces, cut, metres, short pieces and taxable value",accent:"#214a70",deep:"#122f4d",soft:"#edf3f8",border:"#c8d8e7",header:"band",pageSize:"A4",orientation:"landscape",columns:[column("sr","#",4),column("designNumber","Design No.",8),column("description","Fabric / item description",20),column("hsnCode","HSN",7),column("quantity","Pcs",5),column("qtyUnit","Unit",4),column("cut","Cut",5),column("MTR","MTR",8),column("shortPcs","Short",5),column("unitPrice","Rate",9),column("taxable","Taxable value",13),column("amount","Amount",12)]},
 {key:"garment-workshop",name:"Garment & job work",category:"Manufacturing",description:"For stitching, embroidery and job work with style references, quantities, work rates and tax values",accent:"#32624f",deep:"#1e4034",soft:"#edf5f0",border:"#cbded3",header:"split",pageSize:"A4",orientation:"landscape",columns:[column("sr","#",4),column("designNumber","Style / design",11),column("description","Garment / work details",22),column("hsnCode","HSN",6),column("quantity","Quantity",7),column("qtyUnit","Unit",6),column("cut","Cut",6),column("shortPcs","Short pcs",6),column("unitPrice","Work rate",10),column("taxable","Taxable value",11),column("amount","Amount",11)]},
 {key:"embroidery-job-work",name:"Embroidery & textile job work",category:"Textile & manufacturing",description:"Job-work invoice for embroidery designs, fabric details, pieces, cut, metres, work rates and taxable value",accent:"#70518f",deep:"#432d5c",soft:"#f4f0f8",border:"#ded2e9",header:"band",pageSize:"A4",orientation:"landscape",columns:[column("sr","#",4),column("designNumber","Design No.",10),column("description","Fabric / embroidery details",22),column("hsnCode","HSN",7),column("quantity","Pcs",10),column("qtyUnit","Unit",5),column("cut","Cut",5),column("MTR","MTR",7),column("shortPcs","Short",5),column("unitPrice","Work rate",9),column("taxable","Taxable value",8),column("amount","Amount",8)]},
 {key:"retail-counter",name:"Retail counter bill",category:"Retail & POS",description:"Compact A5 customer bill with clearly visible product, quantity, rate, total and amount due",accent:"#9a4b27",deep:"#6c3219",soft:"#fff3e9",border:"#efd5c1",header:"warm",pageSize:"A5",orientation:"portrait",columns:[column("sr","#",6),column("description","Product / item",40),column("quantity","Qty",10),column("qtyUnit","Unit",9),column("unitPrice","Rate",15),column("amount","Amount",20)]},
 {key:"fashion-retail",name:"Fashion & apparel store",category:"Retail & POS",description:"Polished apparel bill for style numbers, item details, HSN, sizes, quantities and pricing",accent:"#8c456f",deep:"#552943",soft:"#faf0f6",border:"#e8d0df",header:"center",pageSize:"A4",orientation:"portrait",columns:[column("sr","#",5),column("designNumber","Style No.",12),column("description","Item / colour / size",30),column("hsnCode","HSN",8),column("quantity","Qty",10),column("qtyUnit","Unit",5),column("unitPrice","Rate",13),column("amount","Amount",17)]},
 {key:"jewellery-premium",name:"Jewellery & ornaments",category:"Speciality retail",description:"Premium understated layout for item codes, product details, HSN, quantity and transaction value",accent:"#98763f",deep:"#332b1e",soft:"#f7f3e9",border:"#dccda9",header:"dark",pageSize:"A4",orientation:"portrait",columns:[column("sr","#",5),column("designNumber","Item code",15),column("description","Description / details",28),column("hsnCode","HSN",8),column("quantity","Qty",9),column("qtyUnit","Unit",5),column("unitPrice","Unit value",14),column("amount","Total value",16)]},
 {key:"electronics-distribution",name:"Electronics distribution",category:"Wholesale & distribution",description:"Distributor invoice for model descriptions, HSN, unit quantities, discounts and taxable amounts",accent:"#315ba0",deep:"#1b3769",soft:"#eef3ff",border:"#ccd8ef",header:"split",pageSize:"A4",orientation:"landscape",columns:[column("sr","#",5),column("description","Product / model",30),column("hsnCode","HSN",9),column("quantity","Qty",8),column("qtyUnit","Unit",7),column("unitPrice","Rate",13),column("discount","Disc. %",7),column("taxable","Taxable value",10),column("amount","Amount",11)]},
 {key:"pharma-distribution",name:"Pharma distribution",category:"Wholesale & distribution",description:"Stockist-ready layout with medicine, HSN, pack unit, quantity, discount and taxable value",accent:"#16766d",deep:"#104c47",soft:"#eaf6f4",border:"#c2e1dc",header:"center",pageSize:"A4",orientation:"landscape",columns:[column("sr","#",5),column("description","Medicine / product",28),column("hsnCode","HSN",10),column("quantity","Qty",9),column("qtyUnit","Pack",9),column("unitPrice","Rate",13),column("discount","Disc. %",6),column("taxable","Taxable value",10),column("amount","Amount",10)]},
 {key:"building-materials",name:"Building materials",category:"Construction & supplies",description:"Supplier invoice for construction materials, HSN, unit, quantity, rate and taxable value",accent:"#665747",deep:"#3e3429",soft:"#f5f1ec",border:"#ddd3c7",header:"band",pageSize:"A4",orientation:"landscape",columns:[column("sr","#",5),column("description","Material description",32),column("hsnCode","HSN",9),column("quantity","Qty",9),column("qtyUnit","Unit",9),column("unitPrice","Rate",14),column("taxable","Taxable value",11),column("amount","Amount",11)]},
 {key:"professional-services",name:"Professional services",category:"Services",description:"Elegant client invoice for consulting, design, labour, retainers and professional fees",accent:"#3a596f",deep:"#233b4d",soft:"#eff4f7",border:"#d2dfe7",header:"minimal",pageSize:"A4",orientation:"portrait",columns:[column("sr","#",6),column("description","Service / engagement",45),column("quantity","Hours / units",12),column("qtyUnit","Unit",9),column("unitPrice","Rate",13),column("amount","Fee",15)]},
 {key:"transport-logistics",name:"Transport & logistics",category:"Transport & logistics",description:"Dispatch invoice with goods, HSN, package count, freight rate, challan and E-Way Bill references",accent:"#3b556b",deep:"#243b4f",soft:"#eef3f7",border:"#d0dce5",header:"band",pageSize:"A4",orientation:"landscape",columns:[column("sr","#",5),column("description","Goods / consignment",33),column("hsnCode","HSN",9),column("quantity","Packages",8),column("qtyUnit","Unit",8),column("unitPrice","Freight rate",13),column("taxable","Taxable value",11),column("amount","Freight",13)]},
 {key:"food-catering",name:"Food & catering",category:"Food & hospitality",description:"Warm, clear order bill for menus, packages, servings, units, service rates and tax",accent:"#a44f2c",deep:"#71361e",soft:"#fff3e9",border:"#f0d4c1",header:"warm",pageSize:"A4",orientation:"portrait",columns:[column("sr","#",5),column("description","Menu / package",43),column("quantity","Servings",12),column("qtyUnit","Unit",9),column("unitPrice","Rate",14),column("taxable","Taxable value",8),column("amount","Amount",9)]},
 {key:"gst-wholesale",name:"GST wholesale invoice",category:"Wholesale & distribution",description:"Formal tax invoice with HSN, unit quantity, taxable value, payment status and tax summary",accent:"#364f68",deep:"#20364b",soft:"#eff3f7",border:"#cfd9e2",header:"split",pageSize:"A4",orientation:"portrait",columns:[column("sr","#",5),column("description","Product description",31),column("hsnCode","HSN",10),column("quantity","Qty",8),column("qtyUnit","Unit",7),column("unitPrice","Rate",12),column("taxable","Taxable value",12),column("amount","Amount",15)]},
 {key:"modern-business",name:"Modern business invoice",category:"General business",description:"Balanced customer-facing invoice with clear hierarchy, spacious details and prominent amount due",accent:"#3569b6",deep:"#1d3c68",soft:"#edf4ff",border:"#cfddf1",header:"split",pageSize:"A4",orientation:"portrait",columns:[column("sr","#",5),column("description","Description",32),column("hsnCode","HSN",9),column("quantity","Qty",9),column("qtyUnit","Unit",7),column("unitPrice","Rate",13),column("taxable","Taxable value",12),column("amount","Amount",13)]},
 {key:"executive-minimal",name:"Executive minimal",category:"General business",description:"Refined monochrome invoice with generous white space, readable labels and a quiet totals panel",accent:"#596473",deep:"#29323d",soft:"#f4f6f8",border:"#d8dee5",header:"minimal",pageSize:"A4",orientation:"portrait",columns:[column("sr","#",6),column("description","Description",43),column("quantity","Qty",11),column("qtyUnit","Unit",8),column("unitPrice","Rate",14),column("amount","Amount",18)]}
];

const block=(id,type,fieldKey,label,x,y,w,h,extra={})=>({
  id,type,fieldKey:fieldKey||"",label:label||"",text:"",x,y,w,h,
  fontSize:10,bold:false,align:"left",color:"#172335",
  backgroundColor:"transparent",borderColor:"#d8e0e9",borderWidth:0,
  borderRadius:0,padding:1,fontFamily:"Arial",italic:false,opacity:1,
  lineHeight:1.22,letterSpacing:0,textDecoration:"none",
  textTransform:"none",verticalAlign:"top",visible:true,showLabel:true,...extra
});
const field=(id,key,x,y,w,h,extra={})=>block(id,"field",key,FIELD_LABELS[key]||"Invoice field",x,y,w,h,extra);
const text=(id,value,x,y,w,h,extra={})=>block(id,"text","",value,x,y,w,h,{text:value,label:value,...extra});
const shape=(id,x,y,w,h,backgroundColor,extra={})=>block(id,"shape","","",x,y,w,h,{backgroundColor,...extra});
const line=(id,x,y,w,color="#cbd5e1")=>block(id,"divider","","Divider",x,y,w,.55,{color,borderWidth:0});
const logo=(id,x,y,w,h,extra={})=>block(id,"logo","logo","Business logo",x,y,w,h,{align:"center",padding:0,...extra});
const items=(id,x,y,w,h,preset,fontSize,padding)=>block(id,"items_table","items","Invoice items",x,y,w,h,{
  fontSize,tableHeaderBackground:preset.accent,tableHeaderColor:"#ffffff",
  tableBorderColor:preset.border,tableBorderWidth:.7,tableCellPadding:padding,
  tableRowBackground:"#ffffff",tableAlternateRowBackground:preset.soft,
  alternateRows:true,columns:preset.columns.map((item,index)=>({...item,order:index}))
});
const totals=(id,x,y,w,h,preset,fontSize)=>block(id,"totals","totals","Invoice totals",x,y,w,h,{
  fontSize,color:preset.deep
});

function createInvoiceDesignTemplate(id,key="modern-business"){
  const preset=INVOICE_DESIGN_PRESETS.find(item=>item.key===key)||INVOICE_DESIGN_PRESETS.find(item=>item.key==="modern-business");
  const compact=preset.pageSize==="A5";
  const landscape=preset.orientation==="landscape";
  const band=["band","dark","warm"].includes(preset.header);
  const blocks=[];
  // Use the top third for identity and billing details, then reserve a larger
  // printable area for line items. A4 portrait fits more rows; landscape and
  // A5 keep their proportions without forcing the closing totals off-page.
  const tableTop=45.5;
  const tableHeight=compact?27:(landscape?32.5:34);
  const footerTop=tableTop+tableHeight+1;
  const footerHeight=100-footerTop-1;
  const itemFont=compact?9.2:(landscape?10:10.3);
  const smallFont=compact?8.6:9.0;

  if(band){
    const height=18.5;
    blocks.push(shape("brand-band",0,0,100,height,preset.deep));
    blocks.push(field("company-name","company_name",5.5,2.4,71,5.4,{
      fontSize:compact?20:21.5,bold:true,color:"#ffffff",showLabel:false,lineHeight:1.08
    }));
    blocks.push(field("company-address","company_address",5.7,8.1,70,3.0,{
      fontSize:9.7,color:"#f5f8fb",showLabel:false
    }));
    blocks.push(field("company-phone","company_phone",5.7,11.4,31,2.2,{
      fontSize:9.0,color:"#ffffff",showLabel:false
    }));
    blocks.push(field("company-email","company_email",37.5,11.4,35,2.2,{
      fontSize:8.5,color:"#ffffff",showLabel:false
    }));
    blocks.push(field("company-gstin","company_gstin",5.7,14.2,67,2.4,{
      fontSize:8.9,bold:true,color:"#ffffff",showLabel:true
    }));
    blocks.push(logo("business-logo",84,2.5,10.5,13.5,{
      backgroundColor:"#ffffff",borderColor:"#ffffff",borderWidth:.4,borderRadius:2
    }));
  }else if(preset.header==="center"){
    blocks.push(shape("top-accent",0,0,100,1.2,preset.accent));
    blocks.push(logo("business-logo",5,3.0,11.5,11.5));
    blocks.push(field("company-name","company_name",18.5,2.8,63,5.2,{
      fontSize:20.5,bold:true,align:"center",color:preset.deep,showLabel:false
    }));
    blocks.push(field("company-address","company_address",18.5,8.2,63,3.0,{
      fontSize:9.7,align:"center",color:"#536579",showLabel:false
    }));
    blocks.push(field("company-phone","company_phone",20,11.5,28,2.2,{
      fontSize:9.0,align:"center",color:"#536579",showLabel:false
    }));
    blocks.push(field("company-email","company_email",49,11.5,31,2.2,{
      fontSize:8.4,align:"center",color:"#536579",showLabel:false
    }));
    blocks.push(field("company-gstin","company_gstin",20,14.3,60,2.2,{
      fontSize:8.8,bold:true,align:"center",color:preset.accent,showLabel:true
    }));
    blocks.push(line("header-rule",5,18.2,90,preset.border));
  }else{
    blocks.push(shape("top-accent",0,0,100,preset.header==="minimal"?1.1:1.5,preset.accent));
    blocks.push(logo("business-logo",5,3.0,11.5,11.5));
    blocks.push(field("company-name","company_name",19,2.8,59,5.4,{
      fontSize:20.5,bold:true,color:preset.deep,showLabel:false
    }));
    blocks.push(field("company-address","company_address",19.2,8.3,59,3.0,{
      fontSize:9.7,color:"#596b7f",showLabel:false
    }));
    blocks.push(field("company-phone","company_phone",19.2,11.6,27,2.2,{
      fontSize:9.0,color:"#596b7f",showLabel:false
    }));
    blocks.push(field("company-email","company_email",47,11.6,31,2.2,{
      fontSize:8.4,color:"#596b7f",showLabel:false
    }));
    blocks.push(field("company-gstin","company_gstin",19.2,14.3,59,2.2,{
      fontSize:8.8,bold:true,color:preset.accent,showLabel:true
    }));
    blocks.push(line("header-rule",5,18.2,90,preset.border));
  }

  blocks.push(field("invoice-heading","invoice_title",5.5,19.2,58,4.8,{
    fontSize:compact?17:20,bold:true,color:preset.accent,showLabel:false,lineHeight:1.05
  }));
  blocks.push(text("invoice-copy-type","ORIGINAL FOR RECIPIENT",65,20.8,30,2.4,{
    fontSize:7.5,bold:true,align:"right",color:"#718197",textTransform:"uppercase",letterSpacing:.35
  }));

  blocks.push(shape("customer-panel",5,25,55.5,17.2,preset.soft,{
    borderColor:preset.border,borderWidth:.5,borderRadius:preset.header==="minimal"?1:2
  }));
  blocks.push(shape("invoice-panel",62,25,33,17.2,"#fbfcfd",{
    borderColor:preset.border,borderWidth:.5,borderRadius:preset.header==="minimal"?1:2
  }));
  blocks.push(text("bill-to-label","BILL TO",7,26.1,50,2,{
    fontSize:8.1,bold:true,color:preset.accent,letterSpacing:.35
  }));
  blocks.push(field("customer-name","customer_name",7,28.6,50.5,3,{
    fontSize:12.0,bold:true,color:preset.deep,showLabel:false
  }));
  blocks.push(field("customer-address","customer_address",7,31.8,50.5,3.2,{
    fontSize:9.4,color:"#536477",showLabel:false,lineHeight:1.2
  }));
  blocks.push(field("customer-phone","customer_phone",7,35.3,25,2.1,{
    fontSize:9.0,color:"#536477"
  }));
  blocks.push(field("customer-gstin","customer_gstin",32.8,35.3,25.5,2.1,{
    fontSize:8.2,color:"#536477"
  }));
  blocks.push(field("customer-state","customer_state",7,38,50,2,{
    fontSize:8.2,color:"#536477"
  }));

  blocks.push(text("invoice-details-label","INVOICE DETAILS",64.3,26.1,29,2,{
    fontSize:8.0,bold:true,color:preset.accent,letterSpacing:.3
  }));
  const metaRows=[
    ["invoice-no","invoice_no"],
    ["invoice-date","invoice_date"],
    ["due-date","due_date"],
    ["payment-terms","payment_terms"],
    ["challan-no","challan_no"],
    ["eway-bill","eway_bill"]
  ];
  metaRows.forEach(([fieldId,fieldKey],index)=>{
    blocks.push(field(fieldId,fieldKey,64.3,28.5+index*2.15,29,1.95,{
      fontSize:8.9,color:preset.deep,bold:index===0
    }));
  });

  const caption=preset.key==="embroidery-job-work"?"EMBROIDERY & JOB WORK DETAILS":
    preset.category==="Services"?"SERVICES PROVIDED":
    preset.category==="Transport & logistics"?"GOODS / CONSIGNMENT DETAILS":
    preset.category==="Textile & fabric"?"FABRIC & DESIGN DETAILS":
    preset.category==="Manufacturing"?"JOB WORK / PRODUCTION DETAILS":
    preset.category==="Food & hospitality"?"ORDER DETAILS":"ITEM DETAILS";
  blocks.push(text("items-caption",caption,5.3,tableTop-2.8,89.5,2.2,{
    fontSize:8.0,bold:true,color:preset.accent,letterSpacing:.35
  }));
  blocks.push(items("item-table",5,tableTop,90,tableHeight,preset,itemFont,compact?2.8:3.7));

  const wordsTop=footerTop+.5;
  const bankTop=footerTop+5.0;
  const termsTitleTop=footerTop+8.8;
  const termsTop=footerTop+10.6;
  const termsHeight=Math.max(2.6,footerHeight-11.5);
  // Keep the signatory rule outside the totals panel on every page size.
  const totalsPanelHeight=Math.max(10,footerHeight-4.0);
  const totalsTop=footerTop+.2;
  const totalsBlockTop=footerTop+.8;
  const signatureTop=footerTop+footerHeight-2.45;

  blocks.push(field("amount-in-words","amount_words",5.5,wordsTop,54,4.1,{
    fontSize:smallFont,bold:true,color:preset.deep
  }));
  blocks.push(field("bank-details","bank_details",5.5,bankTop,54,3.4,{
    fontSize:smallFont,color:"#536477",lineHeight:1.16
  }));
  blocks.push(text("terms-heading","TERMS & CONDITIONS",5.5,termsTitleTop,54,1.7,{
    fontSize:7.5,bold:true,color:preset.accent,letterSpacing:.3
  }));
  blocks.push(field("terms","terms",5.5,termsTop,54,termsHeight,{
    fontSize:compact?7.6:7.9,color:"#5b6b7e",lineHeight:1.16,showLabel:false
  }));
  blocks.push(shape("totals-panel",62,totalsTop,33,totalsPanelHeight,preset.soft,{
    borderColor:preset.border,borderWidth:.5,borderRadius:preset.header==="minimal"?1:2
  }));
  blocks.push(totals("invoice-totals",64,totalsBlockTop,29,totalsPanelHeight-1.2,preset,compact?9.1:10));
  blocks.push(line("signature-rule",70,signatureTop-.6,22,preset.border));
  blocks.push(field("signature","signature",64,signatureTop,31,2.1,{
    fontSize:8.2,bold:true,align:"right",color:preset.deep,showLabel:false
  }));

  return {
    id,name:preset.name,templateKey:key,pageSize:preset.pageSize||"A4",
    orientation:preset.orientation||"portrait",elementLimit:80,
    printMargins:{top:0,right:0,bottom:0,left:0},
    background:{url:"",type:"none",locked:true,visible:true},
    blocks
  };
}

function createBlankInvoiceDesignTemplate(id,name="Blank design"){
  return {
    id,name,templateKey:"blank",pageSize:"A4",orientation:"portrait",elementLimit:80,
    printMargins:{top:0,right:0,bottom:0,left:0},
    background:{url:"",type:"none",locked:true,visible:true},blocks:[]
  };
}
export {INVOICE_DESIGN_PRESETS,createInvoiceDesignTemplate,createBlankInvoiceDesignTemplate};
