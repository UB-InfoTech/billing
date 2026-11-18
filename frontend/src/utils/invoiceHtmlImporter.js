import {suggestInvoiceField} from "./invoiceOcrMapping.js";

const PAGE_WIDTH=794;
const PAGE_HEIGHT=1123;
const MAX_HTML_BYTES=1024*1024;
const MAX_BLOCKS=80;
const MAX_DATA_IMAGE_LENGTH=200000;
const MAX_TOTAL_IMAGE_LENGTH=500000;
const VALUE_WIDTHS={
  invoice_no:22,challan_no:22,eway_bill:25,invoice_date:18,due_date:18,
  customer_name:30,company_name:30,customer_address:42,company_address:42,
  customer_phone:20,company_phone:20,customer_gstin:24,company_gstin:24,
  subtotal:20,discount:20,taxable_value:20,cgst:18,sgst:18,igst:18,
  grand_total:22,amount_paid:20,balance_due:20,bank_details:40,terms:44,signature:30
};
const FIELD_LABELS={
  invoice_no:"Invoice number",challan_no:"Challan number",eway_bill:"E-Way Bill",
  invoice_date:"Invoice date",due_date:"Due date",customer_address:"Customer address",
  company_address:"Business address",customer_name:"Customer name",company_name:"Business name",
  customer_phone:"Customer phone",company_phone:"Business phone",customer_gstin:"Customer GSTIN",
  company_gstin:"Business GSTIN",discount:"Discount",taxable_value:"Taxable value",
  cgst:"CGST",sgst:"SGST",igst:"IGST",subtotal:"Subtotal",grand_total:"Invoice total",
  amount_paid:"Amount paid",balance_due:"Balance due",bank_details:"Bank details",
  terms:"Terms and conditions",signature:"Authorised signatory"
};
const BASE_STYLE=`
  html,body{margin:0!important;padding:0!important;width:794px!important;min-width:794px!important;background:#fff!important}
  body{font-family:Arial,Helvetica,sans-serif!important}
  #invoice-import-page{position:relative!important;width:794px!important;height:1123px!important;min-height:1123px!important;max-height:1123px!important;overflow:hidden!important;background:#fff!important;box-sizing:border-box!important}
  #invoice-import-page *{box-sizing:border-box}
`;
const CSP="<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'\">";

function sanitizeCss(css){
  return String(css||"")
    .replace(/@import\\b[^;]*;?/gi,"")
    .replace(/@font-face\\s*\\{[^}]*\\}/gi,"")
    .replace(/url\\s*\\([^)]*\\)/gi,"none")
    .replace(/expression\\s*\\([^)]*\\)/gi,"")
    .replace(/behavior\\s*:[^;]+;?/gi,"")
    .replace(/-moz-binding\\s*:[^;]+;?/gi,"")
    .replace(/javascript\\s*:/gi,"")
    .slice(0,80000);
}

function safeStyleAttribute(value){
  const allowed=new Set([
    "display","position","top","right","bottom","left","width","height","min-width","max-width",
    "min-height","max-height","margin","margin-top","margin-right","margin-bottom","margin-left",
    "padding","padding-top","padding-right","padding-bottom","padding-left","border","border-top",
    "border-right","border-bottom","border-left","border-width","border-style","border-color",
    "border-radius","background","background-color","color","font","font-family","font-size",
    "font-weight","font-style","line-height","letter-spacing","text-align","text-transform",
    "text-decoration","vertical-align","white-space","overflow","overflow-wrap","word-break",
    "float","clear","flex","flex-direction","align-items","justify-content","grid-template-columns",
    "gap","table-layout","border-collapse","opacity"
  ]);
  const parsed=String(value||"").split(";").map(declaration=>{
    const separator=declaration.indexOf(":");
    if(separator<1)return "";
    const property=declaration.slice(0,separator).trim().toLowerCase();
    const cssValue=declaration.slice(separator+1).trim();
    if(!allowed.has(property)||!cssValue||/url\s*\(|expression|javascript:|@import|behavior/i.test(cssValue))return "";
    return property+":"+cssValue;
  }).filter(Boolean);
  return parsed.join(";");
}

function sanitizeInvoiceHtmlSource(source){
  if(typeof DOMParser==="undefined")throw new Error("HTML import needs a modern browser. PDF and image imports are still available.");
  const parsed=new DOMParser().parseFromString(String(source||""),"text/html");
  const removedScripts=parsed.querySelectorAll("script").length;
  const externalStylesheetCount=parsed.querySelectorAll('link[rel~="stylesheet"]').length;
  parsed.querySelectorAll("script,iframe,frame,frameset,object,embed,applet,form,button,input,textarea,select,link,base,svg,math,video,audio,source,track,canvas").forEach(node=>node.remove());
  parsed.querySelectorAll("meta[http-equiv]").forEach(node=>{
    if(String(node.getAttribute("http-equiv")||"").toLowerCase()!=="content-type")node.remove();
  });
  parsed.querySelectorAll("*").forEach(element=>{
    [...element.attributes].forEach(attribute=>{
      const name=attribute.name.toLowerCase();
      if(name.startsWith("on")||name==="srcdoc"||name==="formaction"||name==="action"||name==="xlink:href"){
        element.removeAttribute(attribute.name);
      }else if(name==="href"){
        element.removeAttribute(attribute.name);
      }else if(name==="style"){
        const safe=safeStyleAttribute(attribute.value);
        if(safe)element.setAttribute("style",safe);
        else element.removeAttribute("style");
      }else if(name==="src"){
        const value=attribute.value.trim();
        const safeImage=element.tagName==="IMG"
          &&/^data:image\\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(value)
          &&value.length<=MAX_DATA_IMAGE_LENGTH;
        if(!safeImage)element.removeAttribute("src");
      }
    });
  });
  const styles=[...parsed.querySelectorAll("style")].map(style=>sanitizeCss(style.textContent)).filter(Boolean).join("\n");
  parsed.querySelectorAll("style").forEach(style=>style.remove());
  return {body:parsed.body.innerHTML,styles,removedScripts,externalStylesheetCount};
}

function colorToHex(value,fallback="#172335"){
  const input=String(value||"").trim();
  if(/^#[0-9a-f]{6}$/i.test(input))return input;
  const rgba=input.match(/^rgba\\(\\s*\\d+\\s*,\\s*\\d+\\s*,\\s*\\d+\\s*,\\s*([\\d.]+)/i);
  if(rgba&&Number(rgba[1])===0)return fallback;
  const rgb=input.match(/^rgba?\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)/i);
  if(!rgb)return fallback;
  return "#"+rgb.slice(1,4).map(part=>Math.max(0,Math.min(255,Number(part))).toString(16).padStart(2,"0")).join("");
}

function normalizeRect(rect,pageRect){
  if(!rect||!pageRect||rect.width<=1||rect.height<=1)return null;
  const x=Math.max(0,Math.min(100,(rect.left-pageRect.left)/PAGE_WIDTH*100));
  const y=Math.max(0,Math.min(100,(rect.top-pageRect.top)/PAGE_HEIGHT*100));
  const right=Math.max(x,Math.min(100,(rect.right-pageRect.left)/PAGE_WIDTH*100));
  const bottom=Math.max(y,Math.min(100,(rect.bottom-pageRect.top)/PAGE_HEIGHT*100));
  if(right-x<0.3||bottom-y<0.15)return null;
  return {x,y,w:right-x,h:bottom-y};
}

function makeBlock(id,type,fieldKey,label,rect,style={},extra={}){
  const box=rect;
  if(!box)return null;
  return {
    id,type,fieldKey:fieldKey||"",label:label||"",text:extra.text||"",
    x:box.x,y:box.y,w:box.w,h:box.h,
    fontSize:Math.max(6,Math.min(48,Number.parseFloat(style.fontSize)||10)),
    bold:/bold|[6-9]00/.test(String(style.fontWeight||"")),
    italic:String(style.fontStyle||"").toLowerCase()==="italic",
    align:["left","center","right","justify"].includes(style.textAlign)?style.textAlign:"left",
    color:colorToHex(style.color),
    backgroundColor:colorToHex(style.backgroundColor,"transparent"),
    borderColor:colorToHex(style.borderColor,"#d8e0e9"),
    borderWidth:Math.max(0,Math.min(6,Number.parseFloat(style.borderWidth)||0)),
    borderRadius:Math.max(0,Math.min(24,Number.parseFloat(style.borderRadius)||0)),
    padding:Math.max(0,Math.min(16,Number.parseFloat(style.padding)||0)),
    fontFamily:/georgia/i.test(style.fontFamily||"")?"Georgia":/times/i.test(style.fontFamily||"")?"Times New Roman":/verdana/i.test(style.fontFamily||"")?"Verdana":/tahoma/i.test(style.fontFamily||"")?"Tahoma":/helvetica/i.test(style.fontFamily||"")?"Helvetica":"Arial",
    opacity:Math.max(0.1,Math.min(1,Number(style.opacity)||1)),
    visible:true,showLabel:false,...extra
  };
}

function getDirectTextNodes(element){
  return [...element.childNodes].filter(node=>node.nodeType===3&&String(node.nodeValue||"").trim());
}

function findValueOffset(text,fieldKey){
  const matches=[...String(text||"").matchAll(/\\S+/g)];
  for(let count=1;count<matches.length;count+=1){
    const last=matches[count-1];
    const prefix=String(text).slice(0,last.index+last[0].length).trim();
    if(suggestInvoiceField(prefix)?.fieldKey!==fieldKey)continue;
    const next=matches[count];
    return next.index;
  }
  return null;
}

function rectForTextRange(doc,textNode,start,end){
  try{
    const range=doc.createRange();
    range.setStart(textNode,start);
    range.setEnd(textNode,end);
    return range.getBoundingClientRect();
  }catch(error){
    return null;
  }
}

function toComputedStyle(element,view){
  const computed=view.getComputedStyle(element);
  return {
    fontSize:computed.fontSize,fontWeight:computed.fontWeight,fontStyle:computed.fontStyle,
    textAlign:computed.textAlign,color:computed.color,backgroundColor:computed.backgroundColor,
    borderColor:computed.borderTopColor,borderWidth:computed.borderTopWidth,
    borderRadius:computed.borderRadius,padding:computed.padding,fontFamily:computed.fontFamily,opacity:computed.opacity
  };
}

function siblingValueRect(labelNode,labelElement,doc){
  const parent=labelElement.parentElement;
  if(!parent)return null;
  const nodes=[...parent.childNodes];
  const index=nodes.indexOf(labelNode);
  for(const sibling of nodes.slice(index+1)){
    if(sibling.nodeType===3&&String(sibling.nodeValue||"").trim()){
      const raw=String(sibling.nodeValue||"");
      const start=raw.search(/\\S/);
      return rectForTextRange(doc,sibling,start,raw.length);
    }
    if(sibling.nodeType===1&&String(sibling.textContent||"").trim()){
      return sibling.getBoundingClientRect();
    }
  }
  return null;
}

async function createMeasurementFrame(safeDocument){
  const frame=document.createElement("iframe");
  frame.setAttribute("title","Safely reading imported invoice HTML");
  frame.setAttribute("sandbox","allow-same-origin");
  frame.setAttribute("aria-hidden","true");
  frame.tabIndex=-1;
  Object.assign(frame.style,{
    position:"fixed",left:"-12000px",top:"0",width:PAGE_WIDTH+"px",height:PAGE_HEIGHT+"px",
    border:"0",opacity:"0",pointerEvents:"none"
  });
  const html="<!doctype html><html><head><meta charset=\"utf-8\">"+CSP
    +"<style>"+BASE_STYLE+"</style><style>"+safeDocument.styles+"</style></head><body>"
    +safeDocument.body+"</body></html>";
  const loaded=new Promise((resolve,reject)=>{
    frame.addEventListener("load",resolve,{once:true});
    frame.addEventListener("error",()=>reject(new Error("The HTML design could not be opened safely.")),{once:true});
  });
  document.body.appendChild(frame);
  frame.srcdoc=html;
  await loaded;
  const doc=frame.contentDocument;
  if(!doc?.body)throw new Error("The HTML design could not be measured.");
  const page=doc.createElement("div");
  page.id="invoice-import-page";
  while(doc.body.firstChild)page.appendChild(doc.body.firstChild);
  doc.body.appendChild(page);
  doc.body.style.cssText="margin:0;padding:0;width:"+PAGE_WIDTH+"px;height:"+PAGE_HEIGHT+"px;overflow:hidden;background:#fff";
  const pageRect=page.getBoundingClientRect();
  return {frame,doc,view:doc.defaultView,page,pageRect};
}

async function convertInvoiceHtml(file){
  if(!file||typeof file.text!=="function")throw new Error("Choose an HTML invoice design first.");
  if(Number(file.size)>MAX_HTML_BYTES)throw new Error("HTML design files must be 1 MB or smaller.");
  const fileName=String(file.name||"").toLowerCase();
  const fileType=String(file.type||"").toLowerCase();
  if(!(fileType==="text/html"||fileName.endsWith(".html")||fileName.endsWith(".htm"))){
    throw new Error("Choose an .html or .htm design file.");
  }
  const source=await file.text();
  if(!source.trim())throw new Error("This HTML file is empty.");
  const safeDocument=sanitizeInvoiceHtmlSource(source);
  let measured;
  try{
    measured=await createMeasurementFrame(safeDocument);
    const {doc,view,page,pageRect}=measured;
    const blocks=[];
    const consumedElements=new Set();
    const add=(candidate)=>{
      if(candidate&&blocks.length<MAX_BLOCKS)blocks.push(candidate);
    };
    const tables=[...page.querySelectorAll("table")]
      .map(table=>{
        const rows=table.rows?.length||0;
        const columns=Math.max(0,...[...table.rows].map(row=>row.cells?.length||0));
        const headingText=[...(table.rows?.[0]?.cells||[])].map(cell=>String(cell.textContent||"")).join(" ").toLowerCase();
        const hasItemHead=/item|product|description|particular|qty|quantity|rate|price|amount|hsn|mtr|design/i.test(headingText);
        return {table,rows,columns,hasItemHead};
      })
      .filter(item=>item.rows>=2&&item.columns>=3&&item.hasItemHead)
      .sort((a,b)=>(b.rows*b.columns)-(a.rows*a.columns));
    const itemTable=tables[0]?.table||null;
    if(itemTable){
      const box=normalizeRect(itemTable.getBoundingClientRect(),pageRect);
      if(box)add(makeBlock("html-items-table","items_table","items","Invoice items",box,toComputedStyle(itemTable,view)));
      itemTable.setAttribute("data-imported-items","true");
      itemTable.querySelectorAll("*").forEach(element=>consumedElements.add(element));
    }
    let imageCount=0,omittedImages=0,matchedFieldCount=0,staticTextCount=0,totalImageCharacters=0;
    const images=[...page.querySelectorAll("img")].filter(image=>!image.closest("[data-imported-items]"));
    images.forEach((image,index)=>{
      const rect=normalizeRect(image.getBoundingClientRect(),pageRect);
      const src=String(image.getAttribute("src")||"");
      if(rect&&/^data:image\\/(?:png|jpeg|webp|gif);base64,/i.test(src)&&src.length<=MAX_DATA_IMAGE_LENGTH&&totalImageCharacters+src.length<=MAX_TOTAL_IMAGE_LENGTH){
        const candidate=makeBlock("html-image-"+index,"image","",image.alt||"Imported image",rect,toComputedStyle(image,view),{imageUrl:src});
        add(candidate);imageCount+=1;totalImageCharacters+=src.length;
      }else omittedImages+=1;
      consumedElements.add(image);
    });
    for(const element of [...page.querySelectorAll("h1,h2,h3,h4,h5,h6,p,div,span,strong,b,em,i,small,label,td,th,li")]){
      if(blocks.length>=MAX_BLOCKS)break;
      if(consumedElements.has(element)||element.closest("[data-imported-items]"))continue;
      const textNodes=getDirectTextNodes(element);
      if(!textNodes.length)continue;
      const style=toComputedStyle(element,view);
      textNodes.forEach((textNode,nodeIndex)=>{
        if(blocks.length>=MAX_BLOCKS||consumedElements.has(element))return;
        const raw=String(textNode.nodeValue||"").replace(/\\s+/g," ").trim();
        if(raw.length<2)return;
        const match=suggestInvoiceField(raw);
        if(match){
          const valueOffset=findValueOffset(raw,match.fieldKey);
          let targetRect=null;
          if(valueOffset!==null){
            const original=String(textNode.nodeValue||"");
            const leading=original.search(/\\S/);
            const valueStart=leading+valueOffset;
            targetRect=rectForTextRange(doc,textNode,valueStart,original.length);
          }
          if(!targetRect)targetRect=siblingValueRect(textNode,element,doc);
          if(targetRect){
            const box=normalizeRect(targetRect,pageRect);
            if(box){
              add(makeBlock("html-field-"+blocks.length,"field",match.fieldKey,FIELD_LABELS[match.fieldKey]||match.label,box,style));
              matchedFieldCount+=1;
              const nextElement=textNode.nextSibling?.nodeType===1?textNode.nextSibling:null;
              if(nextElement)consumedElements.add(nextElement);
              return;
            }
          }
          const labelRect=rectForTextRange(doc,textNode,0,String(textNode.nodeValue||"").length)||element.getBoundingClientRect();
          const right=labelRect.right-pageRect.left;
          const center=(labelRect.top+labelRect.bottom)/2-pageRect.top;
          const width=Math.min(VALUE_WIDTHS[match.fieldKey]||22,Math.max(0,(PAGE_WIDTH-right-12)/PAGE_WIDTH*100));
          if(width>=8){
            const box={
              x:(right+7)/PAGE_WIDTH*100,
              y:Math.max(0,(center-15)/PAGE_HEIGHT*100),
              w:width,
              h:Math.max(2.5,Math.min(6,labelRect.height/PAGE_HEIGHT*100+0.5))
            };
            add(makeBlock("html-field-"+blocks.length,"field",match.fieldKey,FIELD_LABELS[match.fieldKey]||match.label,box,style));
            matchedFieldCount+=1;
          }
          return;
        }
        const fullRect=rectForTextRange(doc,textNode,0,String(textNode.nodeValue||"").length)||element.getBoundingClientRect();
        const box=normalizeRect(fullRect,pageRect);
        if(!box)return;
        const candidate=makeBlock("html-text-"+blocks.length,"text","",raw,box,style,{text:raw,label:""});
        add(candidate);staticTextCount+=1;
      });
    }
    if(!blocks.length)throw new Error("No visible invoice content could be converted. Try saving this design as PDF or image instead.");
    const warnings=[];
    if(blocks.length>=MAX_BLOCKS)warnings.push("The first 80 editable elements were imported; the rest were left out.");
    if(omittedImages)warnings.push(omittedImages+" external or oversized image(s) were skipped. Use an embedded image or import a PDF/image reference to preserve them.");
    if(safeDocument.externalStylesheetCount)warnings.push("External CSS files were skipped for safety. Embed the design styles inside a style section before importing.");
    if(safeDocument.removedScripts)warnings.push("Scripts were removed; only the static HTML design was converted.");
    return {
      blocks,
      pageSize:"A4",
      name:file.name.replace(/\\.(html?|HTML?)$/i,"").slice(0,60)||"Imported HTML design",
      matchedFieldCount,staticTextCount,imageCount,
      warning:warnings.join(" ")
    };
  }finally{
    measured?.frame?.remove();
  }
}

export {convertInvoiceHtml,sanitizeInvoiceHtmlSource};
