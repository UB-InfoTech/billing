const PAGE_SIZES=new Set(["A4","A5","Letter"]);
const BLOCK_TYPES=new Set(["field","text","items_table","totals","logo","divider","shape","image"]);
const TEMPLATE_KEYS=new Set(["clean","modern","classic","classic-gst","elegant","compact","retail","premium","minimal","blank","imported","html-import"]);
const FONT_FAMILIES=new Set(["Arial","Helvetica","Georgia","Times New Roman","Verdana","Tahoma"]);
const FIELD_KEYS=new Set([
  "company_name","company_address","company_gstin","company_phone","company_email",
  "customer_name","customer_address","customer_phone","customer_gstin","customer_state",
  "invoice_title","invoice_no","invoice_date","due_date","challan_no","payment_terms","eway_bill",
  "subtotal","discount","taxable_value","cgst","sgst","igst","round_off","grand_total",
  "amount_paid","balance_due","amount_words","bank_details","terms","signature"
]);
const TABLE_COLUMN_LABELS={
  sr:"#",description:"Description",designNumber:"Design No.",hsnCode:"HSN",quantity:"Qty",
  qtyUnit:"Unit",cut:"Cut",MTR:"MTR",shortPcs:"Short Pcs",unitPrice:"Rate",
  amount:"Amount",discount:"Disc. %",taxable:"Taxable"
};
const TABLE_COLUMN_KEYS=new Set(Object.keys(TABLE_COLUMN_LABELS));
const DEFAULT_BLOCKS=[
  {id:"company-name",type:"field",fieldKey:"company_name",label:"Business name",x:6,y:4,w:58,h:6,fontSize:17,bold:true,align:"left",color:"#172335"},
  {id:"company-address",type:"field",fieldKey:"company_address",label:"Business address",x:6,y:11,w:58,h:7,fontSize:8,bold:false,align:"left",color:"#46566b"},
  {id:"company-gstin",type:"field",fieldKey:"company_gstin",label:"Business GSTIN",x:6,y:19,w:55,h:3,fontSize:8,bold:true,align:"left",color:"#46566b"},
  {id:"logo",type:"logo",fieldKey:"logo",label:"Business logo",x:80,y:4,w:14,h:11,fontSize:10,bold:false,align:"center",color:"#172335"},
  {id:"invoice-title",type:"field",fieldKey:"invoice_title",label:"Invoice title",x:65,y:18,w:29,h:5,fontSize:13,bold:true,align:"right",color:"#172335"},
  {id:"invoice-number",type:"field",fieldKey:"invoice_no",label:"Invoice number",x:65,y:23,w:29,h:3,fontSize:8,bold:true,align:"right",color:"#46566b"},
  {id:"customer-name",type:"field",fieldKey:"customer_name",label:"Customer name",x:6,y:26,w:43,h:5,fontSize:10,bold:true,align:"left",color:"#172335"},
  {id:"customer-address",type:"field",fieldKey:"customer_address",label:"Customer address",x:6,y:32,w:43,h:8,fontSize:8,bold:false,align:"left",color:"#46566b"},
  {id:"invoice-date",type:"field",fieldKey:"invoice_date",label:"Invoice date",x:58,y:27,w:36,h:4,fontSize:9,bold:false,align:"right",color:"#46566b"},
  {id:"due-date",type:"field",fieldKey:"due_date",label:"Due date",x:58,y:32,w:36,h:4,fontSize:9,bold:false,align:"right",color:"#46566b"},
  {id:"items",type:"items_table",fieldKey:"items",label:"Invoice items",x:6,y:43,w:88,h:33,fontSize:8,bold:false,align:"left",color:"#172335"},
  {id:"totals",type:"totals",fieldKey:"totals",label:"Invoice totals",x:61,y:78,w:33,h:15,fontSize:9,bold:false,align:"right",color:"#172335"},
  {id:"terms",type:"field",fieldKey:"terms",label:"Terms and conditions",x:6,y:80,w:48,h:11,fontSize:8,bold:false,align:"left",color:"#46566b"},
  {id:"signature",type:"field",fieldKey:"signature",label:"Authorised signatory",x:64,y:94,w:30,h:4,fontSize:8,bold:true,align:"right",color:"#172335"}
];
const cleanString=(value,max,fallback="")=>String(value??fallback).trim().slice(0,max);
const clamp=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.min(max,Math.max(min,Number(value))):fallback;
const safeId=value=>/^[a-z0-9_-]{1,48}$/i.test(String(value||""))?String(value):"";
const safeColor=value=>/^#[0-9a-f]{6}$/i.test(String(value||""))?String(value):"#172335";
const safeBackground=value=>String(value||"")==="transparent"?"transparent":/^#[0-9a-f]{6}$/i.test(String(value||""))?String(value):"transparent";
const safePrintMargin=value=>clamp(value,0,25,0);
const safeImage=value=>/^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]{1,250000}$/i.test(String(value||""))?String(value):"";

function defaultTemplate(id="clean-default",name="Clean"){
  return {
    id,name,templateKey:"clean",pageSize:"A4",orientation:"portrait",
    background:{url:"",type:"none",locked:true,visible:true},
    blocks:DEFAULT_BLOCKS.map(block=>({...block}))
  };
}

function sanitizeTableColumns(columns){
  if(!Array.isArray(columns))return undefined;
  const safe=columns.slice(0,14).map((column,index)=>{
    const key=String(column?.key||"");
    if(!TABLE_COLUMN_KEYS.has(key))return null;
    return {
      key,
      label:cleanString(column.label,40,TABLE_COLUMN_LABELS[key])||TABLE_COLUMN_LABELS[key],
      width:clamp(column.width,3,70,8),
      order:index,
      visible:column.visible!==false
    };
  }).filter(Boolean);
  if(safe.length&&!safe.some(column=>column.visible))safe[0].visible=true;
  return safe;
}

function sanitizeBlock(block,index,hasBackground=false){
  if(!block||typeof block!=="object"||!BLOCK_TYPES.has(block.type))return null;
  const id=safeId(block.id)||"block-"+(index+1);
  const fieldKey=block.type==="field"&&FIELD_KEYS.has(String(block.fieldKey||""))?String(block.fieldKey):"";
  if(block.type==="field"&&!fieldKey)return null;
  if(block.type==="image"&&!safeImage(block.imageUrl))return null;
  const x=clamp(block.x,0,97,6);
  const y=clamp(block.y,0,97,6);
  const w=clamp(block.w,3,100-x,30);
  const h=clamp(block.h,2,100-y,5);
  return {
    id,type:block.type,fieldKey,
    label:cleanString(block.label,80,block.type==="text"?"Text":fieldKey.replace(/_/g," ")),
    text:block.type==="text"?cleanString(block.text,500):"",
    imageUrl:block.type==="image"?safeImage(block.imageUrl):"",
    imageFit:block.type==="image"&&["contain","cover","fill"].includes(block.imageFit)?block.imageFit:"contain",
    ...(block.type==="items_table"&&Array.isArray(block.columns)?{columns:sanitizeTableColumns(block.columns)}:{}),
    tableHeaderBackground:safeBackground(block.tableHeaderBackground||"#edf2f7"),
    tableHeaderColor:safeColor(block.tableHeaderColor||"#172335"),
    tableRowBackground:safeBackground(block.tableRowBackground||"#ffffff"),
    tableAlternateRowBackground:safeBackground(block.tableAlternateRowBackground||"#f7f9fc"),
    tableBorderColor:safeColor(block.tableBorderColor||"#b8c4d1"),
    tableBorderWidth:clamp(block.tableBorderWidth,0,3,1),
    tableCellPadding:clamp(block.tableCellPadding,1,10,4),
    alternateRows:block.alternateRows!==false,
    x,y,w,h,
    fontSize:clamp(block.fontSize,6,48,10),
    bold:block.bold===true,
    align:["left","center","right"].includes(block.align)?block.align:"left",
    color:safeColor(block.color),
    backgroundColor:safeBackground(block.backgroundColor),
    borderColor:safeColor(block.borderColor),
    borderWidth:clamp(block.borderWidth,0,6,0),
    borderRadius:clamp(block.borderRadius,0,24,0),
    padding:clamp(block.padding,0,16,1),
    fontFamily:FONT_FAMILIES.has(block.fontFamily)?block.fontFamily:"Arial",
    italic:block.italic===true,
    opacity:clamp(block.opacity,0.1,1,1),
    showLabel:block.type==="field"?(block.showLabel===undefined?!hasBackground:block.showLabel!==false):false,
    visible:block.visible!==false
  };
}

function sanitizeTemplate(template,index,ownerId){
  if(!template||typeof template!=="object")return null;
  const id=safeId(template.id)||"template-"+(index+1);
  const rawBackground=template.background&&typeof template.background==="object"?template.background:{};
  const url=String(rawBackground.url||"");
  const prefix=ownerId?"^/uploads/invoice-designs/"+ownerId+"-[a-f0-9]{24}\\.(?:pdf|png|jpe?g|webp)$":"^/uploads/invoice-designs/[a-f0-9]{24}-[a-f0-9]{24}\\.(?:pdf|png|jpe?g|webp)$";
  const safeBackground= new RegExp(prefix,"i").test(url)?url:"";
  const extension=safeBackground.split(".").pop().toLowerCase();
  return {
    id,
    name:cleanString(template.name,60,"My invoice design")||"My invoice design",
    templateKey:TEMPLATE_KEYS.has(template.templateKey)?template.templateKey:"clean",
    pageSize:PAGE_SIZES.has(template.pageSize)?template.pageSize:"A4",
    orientation:template.orientation==="landscape"?"landscape":"portrait",
    printMargins:{top:safePrintMargin(template.printMargins?.top),right:safePrintMargin(template.printMargins?.right),bottom:safePrintMargin(template.printMargins?.bottom),left:safePrintMargin(template.printMargins?.left)},
    background:{
      url:safeBackground,
      type:safeBackground?(extension==="pdf"?"pdf":"image"):"none",
      locked:rawBackground.locked!==false,
      visible:rawBackground.visible!==false
    },
    blocks:(Array.isArray(template.blocks)?template.blocks:DEFAULT_BLOCKS).slice(0,80).map((block,blockIndex)=>sanitizeBlock(block,blockIndex,Boolean(safeBackground))).filter(Boolean)
  };
}

function createDefaultInvoiceDesign(){
  return {
    enabled:false,
    activeTemplateId:"clean-default",
    templates:[defaultTemplate()]
  };
}

function sanitizeInvoiceDesign(input,ownerId){
  const defaults=createDefaultInvoiceDesign();
  if(!input||typeof input!=="object")return defaults;
  const source=Array.isArray(input.templates)?input.templates.slice(0,12):defaults.templates;
  const templates=source.map((item,index)=>sanitizeTemplate(item,index,ownerId)).filter(Boolean);
  const safeTemplates=templates.length?templates:defaults.templates;
  const requestedId=safeId(input.activeTemplateId);
  const activeTemplateId=safeTemplates.some(item=>item.id===requestedId)?requestedId:safeTemplates[0].id;
  return {
    enabled:input.enabled===true,
    activeTemplateId,
    templates:safeTemplates
  };
}

module.exports={
  createDefaultInvoiceDesign,
  sanitizeInvoiceDesign,
  sanitizeBlock,
  DEFAULT_BLOCKS
};
