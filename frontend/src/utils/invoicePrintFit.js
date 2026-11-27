const PAGE_DIMENSIONS_MM={A4:{width:210,height:297},A5:{width:148,height:210},Letter:{width:215.9,height:279.4}};
const safeMm=value=>Math.max(0,Math.min(25,Number.isFinite(Number(value))?Number(value):0));
export function getInvoicePrintGeometry(pageSize="A4",orientation="portrait",printMargins={}){
 const base=PAGE_DIMENSIONS_MM[pageSize]||PAGE_DIMENSIONS_MM.A4,landscape=orientation==="landscape";
 const widthMm=landscape?base.height:base.width,heightMm=landscape?base.width:base.height;
 const margins={top:safeMm(printMargins.top),right:safeMm(printMargins.right),bottom:safeMm(printMargins.bottom),left:safeMm(printMargins.left)};
 return {widthMm,heightMm,margins,contentWidthMm:Math.max(1,widthMm-margins.left-margins.right),contentHeightMm:Math.max(1,heightMm-margins.top-margins.bottom)};
}
const FULL_WIDTH_SCRIPT=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Devanagari}\p{Script=Gujarati}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Sinhala}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const MEDIUM_WIDTH_SCRIPT=/[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Cyrillic}\p{Script=Greek}]/u;
const charUnit=char=>{
 if(/\p{Mark}/u.test(char)||char==="\u200d"||char==="\ufe0e"||char==="\ufe0f"||/\p{Emoji_Modifier}/u.test(char))return 0;
 if(/\p{Extended_Pictographic}/u.test(char))return 1;
 if(/\p{Regional_Indicator}/u.test(char))return 0.5;
 if(/\s/u.test(char))return 0.3;
 if(/[ilI.,'’!|:;]/u.test(char))return 0.28;
 if(/[MW@%₹#&]/u.test(char))return 0.82;
 if(FULL_WIDTH_SCRIPT.test(char))return 0.95;
 if(MEDIUM_WIDTH_SCRIPT.test(char))return 0.78;
 return 0.52;
};
function estimateLineCount(value,maxUnits,letterSpacingUnits=0){
 let total=0;
 String(value??"").split(/\r?\n/u).forEach(paragraph=>{
  const words=paragraph.trim().split(/\s+/u).filter(Boolean);
  if(!words.length){total+=1;return;}
  let used=0;
  words.forEach(word=>{
   const units=Array.from(word).reduce((sum,char)=>sum+Math.max(0,charUnit(char)+letterSpacingUnits),0),gap=used?0.3:0;
   if(used&&used+gap+units>maxUnits){total+=1;used=0;}
   if(units>maxUnits){const lines=Math.ceil(units/maxUnits);total+=Math.max(0,lines-1);used=units-(lines-1)*maxUnits;}
   else used+=(used?0.3:0)+units;
  });
  total+=1;
 });
 return Math.max(1,total);
}
function normalizeTextTransform(value,transform){
 const text=String(value??"");
 if(transform==="uppercase")return text.toLocaleUpperCase();
 if(transform==="lowercase")return text.toLocaleLowerCase();
 if(transform==="capitalize")return text.replace(/(^|[\s\p{P}])(\p{L})/gu,(_match,prefix,letter)=>prefix+letter.toLocaleUpperCase());
 return text;
}
function measureTextFit(block,value,geometry,fontSize){
 const widthPx=geometry.contentWidthMm*Math.max(0,Number(block.w)||0)/100*96/25.4-2*(Number(block.padding)||0);
 const heightPx=geometry.contentHeightMm*Math.max(0,Number(block.h)||0)/100*96/25.4-2*(Number(block.padding)||0);
 const lineHeight=clamp(Number(block.lineHeight)||1.25,1,2.5);
 const letterSpacing=Number.isFinite(Number(block.letterSpacing))?Number(block.letterSpacing):0;
 const maxUnits=Math.max(0.5,(widthPx/Math.max(1,fontSize))*0.96);
 const availableLines=Math.max(0,(heightPx/(Math.max(1,fontSize)*lineHeight))*0.98);
 const requiredLines=estimateLineCount(value,maxUnits,letterSpacing/Math.max(1,fontSize));
 return {requiredLines,availableLines,fits:requiredLines<=availableLines+0.05};
}
export function estimateInvoiceTextOverflow(blocks=[],values={},options={}){
 const geometry=getInvoicePrintGeometry(options.pageSize,options.orientation,options.printMargins),warnings=[];
 (Array.isArray(blocks)?blocks:[]).forEach(block=>{
  if(!block||block.visible===false||!["field","text"].includes(block.type))return;
  let value=block.type==="text"?(block.text||block.label):(values[block.fieldKey]??"");
  if(value===null||value===undefined||String(value).trim()==="")return;
  if(block.type==="field"&&block.label&&block.showLabel!==false)value=block.label+": "+value;
  value=normalizeTextTransform(value,block.textTransform);
  const fontSize=Math.max(6,Math.min(48,Number(block.fontSize)||10));
  const current=measureTextFit(block,value,geometry,fontSize);
  if(current.requiredLines<=current.availableLines+0.25)return;
  let suggestedFontSize=null;
  for(let candidate=Math.floor((fontSize-0.25)*4)/4;candidate>=6;candidate=Math.round((candidate-0.25)*100)/100){
   if(measureTextFit(block,value,geometry,candidate).fits){
    suggestedFontSize=Number(candidate.toFixed(2));
    break;
   }
  }
  const label=block.label||block.fieldKey||"Text";
  const suggestion=suggestedFontSize
   ?" A text size of "+suggestedFontSize+" px is estimated to fit; apply it and recheck the actual print preview."
   :" Even at the 6 pt minimum, the estimated text does not fit. Increase the box or shorten the content.";
  warnings.push({
   id:"text-overflow-"+(block.id||block.fieldKey||"block"),
   severity:"warning",
   title:"Text may overflow its box",
   detail:label+" is estimated to need "+current.requiredLines+" lines; its box fits about "+current.availableLines.toFixed(1)+"."+suggestion,
   fixable:false,
   fixAction:suggestedFontSize?"fit-text":undefined,
   suggestedFontSize,
   blockId:block.id
  });
 });
 return warnings;
}
const PRINT_SAFE_MARGIN_MM=4;
export function getInvoiceMarginWarnings(pageSize,orientation,printMargins={}){
 const geometry=getInvoicePrintGeometry(pageSize,orientation,printMargins);
 const keys=["top","right","bottom","left"];
 const invalid=keys.filter(key=>printMargins[key]!==undefined&&(!Number.isFinite(Number(printMargins[key]))||Number(printMargins[key])<0||Number(printMargins[key])>25));
 const warnings=[];
 if(!Object.prototype.hasOwnProperty.call(PAGE_DIMENSIONS_MM,pageSize)){
  warnings.push({severity:"warning",id:"unsupported-paper-size",title:"Paper size is not supported",detail:"The selected paper size is not A4, A5 or Letter. The preview uses A4 dimensions until a supported size is selected.",fixable:false});
 }
 if(!["portrait","landscape"].includes(orientation)){
  warnings.push({severity:"warning",id:"unsupported-page-orientation",title:"Page orientation is not supported",detail:"Choose Portrait or Landscape so the preview and printed page use the same orientation.",fixable:false});
 }
 if(invalid.length){
  const normalizedMargins=Object.fromEntries(keys.map(key=>[key,safeMm(printMargins[key])]));
  warnings.push({severity:"warning",id:"invalid-print-margin",title:"One or more margin values are outside the allowed range",detail:"The "+invalid.join(", ")+" margin values must be between 0 and 25 mm. Apply the normalized values to make the saved settings and measured preview agree.",fixable:false,fixAction:"normalize-print-margins",normalizedMargins});
 }
 const belowSafe=keys.filter(key=>geometry.margins[key]<PRINT_SAFE_MARGIN_MM);
 if(belowSafe.length){
  const labels={top:"Top",right:"Right",bottom:"Bottom",left:"Left"};
  warnings.push({severity:"warning",id:"printer-safe-margin",title:"Some margins are below 4 mm",detail:belowSafe.map(key=>labels[key]).join(", ")+" margin"+(belowSafe.length===1?" is":"s are")+" below a common printer-safe distance. Content near these edges may be clipped on printers that cannot print borderlessly.",fixable:false,fixAction:"set-printer-safe-margins",recommendedMargins:{top:4,right:4,bottom:4,left:4}});
 }
 if(geometry.contentWidthMm/geometry.widthMm<0.68||geometry.contentHeightMm/geometry.heightMm<0.68){
  warnings.push({severity:"warning",id:"large-print-margins",title:"Print margins are very large",detail:"The printable area is unusually small. Reduce the margins or check the selected paper size.",fixable:false});
 }
 return warnings;
}
