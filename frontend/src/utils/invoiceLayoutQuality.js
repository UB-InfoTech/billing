const numberOr=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const labelFor=block=>block?.label||block?.type||"Element";

function normalizeVisibleColumns(columns){
 const visible=columns.filter(column=>column.visible!==false);
 if(!visible.length)return columns;
 const distributable=100-3*visible.length;
 const extraTotal=visible.reduce((sum,column)=>sum+Math.max(0,numberOr(column.width,3)-3),0);
 const normalized=visible.map(column=>({
  ...column,
  width:3+(extraTotal?Math.max(0,numberOr(column.width,3)-3)/extraTotal*distributable:distributable/visible.length)
 }));
 let index=0;
 return columns.map(column=>column.visible===false?column:normalized[index++]);
}

export function analyzeInvoiceLayout(blocks=[],defaultColumns=[]){
 const visible=(Array.isArray(blocks)?blocks:[]).filter(block=>block&&block.visible!==false);
 const issues=[];
 visible.forEach(block=>{
  const label=labelFor(block);
  const x=Number(block.x),y=Number(block.y),w=Number(block.w),h=Number(block.h);
  if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0){
   issues.push({severity:"error",title:"Element has invalid dimensions",detail:label+" has missing or invalid position or size values.",fixable:true,blockId:block.id});
  }else if(x<0||y<0||x+w>100||y+h>100){
   issues.push({severity:"error",title:"Element outside page",detail:label+" extends beyond the printable page.",fixable:true,blockId:block.id});
  }
  if(Number.isFinite(w)&&Number.isFinite(h)&&(w<3||h<2)){
   issues.push({severity:"warning",title:"Element may be too small",detail:label+" may be hard to read when printed.",fixable:true,blockId:block.id});
  }
  if(block.type==="items_table"){
   const source=Array.isArray(block.columns)?block.columns:defaultColumns;
   const columns=(Array.isArray(source)?source:[]).filter(column=>column&&column.visible!==false);
   const sum=columns.reduce((total,column)=>total+Math.max(0,numberOr(column.width,0)),0);
   if(columns.length&&Math.abs(sum-100)>1){
    issues.push({severity:"warning",title:sum>100?"Item table columns exceed 100%":"Item table columns leave unused width",detail:sum>100?"Visible column widths total "+sum.toFixed(1)+"%. They may overflow the table.":"Visible column widths total "+sum.toFixed(1)+"%. The table may not use its full width.",fixable:true,blockId:block.id});
   }
  }
 });
 for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){
  const a=visible[i],b=visible[j];
  if(["shape","divider"].includes(a.type)||["shape","divider"].includes(b.type))continue;
  const ax=numberOr(a.x),ay=numberOr(a.y),aw=numberOr(a.w),ah=numberOr(a.h);
  const bx=numberOr(b.x),by=numberOr(b.y),bw=numberOr(b.w),bh=numberOr(b.h);
  if(![ax,ay,aw,ah,bx,by,bw,bh].every(Number.isFinite))continue;
  const ox=Math.min(ax+aw,bx+bw)-Math.max(ax,bx),oy=Math.min(ay+ah,by+bh)-Math.max(ay,by);
  if(ox>1&&oy>1&&ox*oy>Math.min(aw*ah,bw*bh)*.18){
   issues.push({severity:"warning",title:"Possible element overlap",detail:labelFor(a)+" overlaps "+labelFor(b)+". Confirm in print preview.",fixable:false});
  }
 }
 return issues;
}


export function reduceInvoiceBlockFontSize(blocks=[],blockId,step=1){
 const reduction=clamp(numberOr(step,1),0.25,4);
 let changed=false;
 const next=(Array.isArray(blocks)?blocks:[]).map(block=>{
  if(!block||block.id!==blockId)return block;
  const current=clamp(numberOr(block.fontSize,10),6,48);
  const nextSize=Math.max(6,Math.round((current-reduction)*10)/10);
  if(nextSize>=current)return block;
  changed=true;
  return {...block,fontSize:nextSize};
 });
 return {blocks:next,changed};
}

export function applySafeInvoiceLayoutFixes(blocks=[],defaultColumns=[]){
 let changed=false;
 const next=(Array.isArray(blocks)?blocks:[]).map(block=>{
  if(!block||block.visible===false)return block;
  const b={...block};
  const width=clamp(numberOr(b.w,3),3,100),height=clamp(numberOr(b.h,2),2,100);
  const x=clamp(numberOr(b.x,0),0,100-width),y=clamp(numberOr(b.y,0),0,100-height);
  if(width!==b.w||height!==b.h||x!==b.x||y!==b.y){Object.assign(b,{x,y,w:width,h:height});changed=true;}
  if(b.type==="items_table"){
   const source=Array.isArray(b.columns)?b.columns:defaultColumns;
   const visible=(Array.isArray(source)?source:[]).filter(column=>column&&column.visible!==false);
   const total=visible.reduce((sum,column)=>sum+Math.max(0,numberOr(column.width,3)),0);
   if(visible.length&&Math.abs(total-100)>1){
    b.columns=normalizeVisibleColumns(Array.isArray(source)?source:[]);changed=true;
   }
  }
  return b;
 });
 return {blocks:next,changed};
}


function hasLayoutCollision(candidate, blocks, excludedId) {
 const left=Number(candidate.x),top=Number(candidate.y),right=left+Number(candidate.w),bottom=top+Number(candidate.h);
 return (Array.isArray(blocks)?blocks:[]).some(other=>{
  if(!other||other.id===excludedId||other.visible===false||["shape","divider"].includes(other.type))return false;
  const x=Number(other.x),y=Number(other.y),w=Number(other.w),h=Number(other.h);
  if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)return false;
  return Math.min(right,x+w)-Math.max(left,x)>0.5&&Math.min(bottom,y+h)-Math.max(top,y)>0.5;
 });
}

function sameNumber(a,b) {
 return Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&Math.abs(Number(a)-Number(b))<0.001;
}

function normalizeColumnsForSuggestion(columns) {
 const visibleIndexes=columns.map((column,index)=>column&&column.visible!==false?index:-1).filter(index=>index>=0);
 const total=visibleIndexes.reduce((sum,index)=>sum+Number(columns[index].width),0);
 if(!visibleIndexes.length||!Number.isFinite(total)||total<=0)return null;
 const result=columns.slice().map(column=>column);
 let allocated=0;
 visibleIndexes.forEach((index,position)=>{
  const column=columns[index];
  const width=position===visibleIndexes.length-1?100-allocated:Number((Number(column.width)/total*100).toFixed(4));
  if(position!==visibleIndexes.length-1)allocated+=width;
  result[index]={...column,width};
 });
 return result;
}

/**
 * Produce only reversible, non-financial layout suggestions.
 * Position changes are offered only if the corrected rectangle stays on-page
 * and does not collide with another visible content element.
 */
export function buildInvoiceLayoutOptimizationSuggestions(blocks=[],defaultColumns=[],textWarnings=[]) {
 const source=Array.isArray(blocks)?blocks:[];
 const planned=source.slice();
 const suggestions=[];

 source.forEach((block,index)=>{
  if(!block||block.visible===false||!block.id)return;
  const x=Number(block.x),y=Number(block.y),w=Number(block.w),h=Number(block.h);
  if([x,y,w,h].every(Number.isFinite)&&w>0&&h>0&&w<=100&&h<=100){
   const nextX=clamp(x,0,100-w),nextY=clamp(y,0,100-h);
   if(!sameNumber(x,nextX)||!sameNumber(y,nextY)){
    const candidate={...block,x:nextX,y:nextY};
    if(!hasLayoutCollision(candidate,planned,block.id)){
     suggestions.push({
      id:"position-"+block.id,
      action:"move-inside-page",
      blockId:block.id,
      title:"Bring "+labelFor(block)+" inside the page",
      detail:"Adjust its position without changing its size. The suggested position does not overlap another visible content element.",
      expected:{x:block.x,y:block.y,w:block.w,h:block.h},
      next:{x:nextX,y:nextY}
     });
     planned[index]=candidate;
    }
   }
  }

  if(block.type==="items_table"){
   const columns=Array.isArray(block.columns)?block.columns:defaultColumns;
   const visible=columns.filter(column=>column&&column.visible!==false);
   const widthsAreValid=visible.length&&visible.every(column=>Number.isFinite(Number(column.width))&&Number(column.width)>0);
   const total=widthsAreValid?visible.reduce((sum,column)=>sum+Number(column.width),0):0;
   if(widthsAreValid&&total>0&&Math.abs(total-100)>1){
    const nextColumns=normalizeColumnsForSuggestion(columns);
    if(nextColumns){
     suggestions.push({
      id:"columns-"+block.id,
      action:"normalize-item-columns",
      blockId:block.id,
      title:"Fit visible item columns to the table width",
      detail:"Redistribute the visible column widths proportionally to total 100%. Hidden columns and column order stay unchanged.",
      expectedColumns:columns.map(column=>column?{...column}:column),
      nextColumns
     });
    }
   }
  }
 });

 (Array.isArray(textWarnings)?textWarnings:[]).forEach(issue=>{
  if(issue?.fixAction!=="fit-text"||!issue.blockId)return;
  const block=source.find(item=>item?.id===issue.blockId);
  const current=Number(block?.fontSize||10),suggested=Number(issue.suggestedFontSize);
  if(!block||block.visible===false||!["field","text"].includes(block.type)||
    !Number.isFinite(current)||!Number.isFinite(suggested)||suggested<6||suggested>=current)return;
  suggestions.push({
   id:"font-"+block.id,
   action:"fit-text",
   blockId:block.id,
   title:"Fit text in "+labelFor(block),
   detail:"Reduce its font size to "+suggested+" px, the estimated size that fits the current box. Recheck the actual print preview.",
   expectedFontSize:block.fontSize??10,
   nextFontSize:suggested
  });
 });

 return suggestions;
}

/**
 * Build a reversible width preview for a single measured item-column wrapping issue.
 * The suggestion is deliberately limited to tables whose visible widths already
 * total 100%, so it never silently normalizes unrelated column settings.
 */
export function buildInvoiceColumnOptimizationPreview(block,issue,defaultColumns=[]) {
 if(!block||block.type!=="items_table"||!block.id||
   !issue?.columnKey||!Number.isFinite(Number(issue.actualLines))||
   !Number.isFinite(Number(issue.estimatedLines))||
   Number(issue.actualLines)<=Number(issue.estimatedLines)||Number(issue.estimatedLines)<1){
  return null;
 }
 const source=Array.isArray(block.columns)&&block.columns.length?block.columns:(Array.isArray(defaultColumns)?defaultColumns:[]);
 const visibleIndexes=source.map((column,index)=>column&&column.visible!==false?index:-1).filter(index=>index>=0);
 const targetIndex=source.findIndex(column=>column?.key===issue.columnKey);
 if(targetIndex<0||source[targetIndex]?.visible===false||visibleIndexes.length<2)return null;
 const widths=visibleIndexes.map(index=>Number(source[index]?.width));
 if(!widths.every(width=>Number.isFinite(width)&&width>=3))return null;
 const visibleTotal=widths.reduce((sum,width)=>sum+width,0);
 if(Math.abs(visibleTotal-100)>1)return null;

 const currentWidth=Number(source[targetIndex].width);
 const lineRatio=Number(issue.actualLines)/Number(issue.estimatedLines);
 const desiredWidth=Math.min(70,Math.max(currentWidth+1,currentWidth*lineRatio));
 const donorIndexes=visibleIndexes.filter(index=>index!==targetIndex&&Number(source[index].width)>3.001);
 const totalDonorSlack=donorIndexes.reduce((sum,index)=>sum+Number(source[index].width)-3,0);
 const availableIncrease=Math.min(desiredWidth-currentWidth,totalDonorSlack);
 if(!Number.isFinite(availableIncrease)||availableIncrease<1)return null;

 const nextColumns=source.map(column=>column?{...column}:column);
 let remaining=Number(availableIncrease.toFixed(2));
 let allocated=0;
 donorIndexes.forEach((index,position)=>{
  const slack=Number(source[index].width)-3;
  const reduction=position===donorIndexes.length-1
    ?remaining
    :Math.min(slack,Number((availableIncrease*slack/totalDonorSlack).toFixed(2)));
  const nextWidth=Math.max(3,Number((Number(source[index].width)-reduction).toFixed(2)));
  const actualReduction=Number((Number(source[index].width)-nextWidth).toFixed(2));
  nextColumns[index]={...source[index],width:nextWidth};
  allocated=Number((allocated+actualReduction).toFixed(2));
  remaining=Number((availableIncrease-allocated).toFixed(2));
 });
 const targetNextWidth=Number((currentWidth+allocated).toFixed(2));
 if(targetNextWidth<=currentWidth||targetNextWidth>70)return null;
 nextColumns[targetIndex]={...source[targetIndex],width:targetNextWidth};

 const visibleWidthAfter=visibleIndexes.reduce((sum,index)=>sum+Number(nextColumns[index].width),0);
 const correction=Number((100-visibleWidthAfter).toFixed(2));
 if(Math.abs(correction)>0.001){
  const lastDonor=donorIndexes[donorIndexes.length-1];
  if(lastDonor===undefined||Number(nextColumns[lastDonor].width)+correction<3)return null;
  nextColumns[lastDonor]={...nextColumns[lastDonor],width:Number((Number(nextColumns[lastDonor].width)+correction).toFixed(2))};
 }
 const finalTotal=visibleIndexes.reduce((sum,index)=>sum+Number(nextColumns[index].width),0);
 if(Math.abs(finalTotal-100)>0.01||visibleIndexes.some(index=>Number(nextColumns[index].width)<3))return null;

 const changedColumns=visibleIndexes
  .filter(index=>!sameNumber(source[index].width,nextColumns[index].width))
  .map(index=>({
   key:String(source[index].key||""),
   label:String(source[index].label||source[index].key||"Item detail"),
   beforeWidth:Number(source[index].width),
   afterWidth:Number(nextColumns[index].width),
   change:Number((Number(nextColumns[index].width)-Number(source[index].width)).toFixed(2))
  }));
 if(!changedColumns.some(column=>column.key===issue.columnKey&&column.change>0))return null;

 const suggestion={
  id:"optimize-column-"+block.id+"-"+issue.columnKey,
  action:"optimize-item-column",
  blockId:block.id,
  targetColumnKey:issue.columnKey,
  title:"Give "+(source[targetIndex].label||issue.columnLabel||"this column")+" more room",
  detail:"Increase this column from "+currentWidth.toFixed(1)+"% to "+targetNextWidth.toFixed(1)+"%, sharing the width reduction across other visible columns. Hidden columns and column order stay unchanged.",
  expectedColumns:source.map(column=>column?{...column}:column),
  nextColumns
 };
 return {
  suggestion,
  targetColumnKey:issue.columnKey,
  targetColumnLabel:String(source[targetIndex].label||issue.columnLabel||"Item detail"),
  beforeColumns:source.map(column=>column?{...column}:column),
  afterColumns:nextColumns.map(column=>column?{...column}:column),
  changedColumns,
  currentTargetWidth:currentWidth,
  suggestedTargetWidth:targetNextWidth,
  visibleTotalBefore:Number(visibleTotal.toFixed(2)),
  visibleTotalAfter:Number(finalTotal.toFixed(2))
 };
}

/**
 * Apply one suggestion only while its original values still match.
 * This prevents stale suggestions from overwriting newer user edits.
 */

export function applyInvoiceLayoutOptimizationSuggestion(blocks=[],suggestion,defaultColumns=[]) {
 const source=Array.isArray(blocks)?blocks:[];
 if(!suggestion?.blockId)return {blocks:source,changed:false,reason:"Suggestion is incomplete."};
 const index=source.findIndex(block=>block?.id===suggestion.blockId);
 if(index<0)return {blocks:source,changed:false,reason:"The element no longer exists."};
 const current=source[index];
 let patch=null;

 if(suggestion.action==="move-inside-page"){
  const expected=suggestion.expected||{},next=suggestion.next||{};
  if(!["x","y","w","h"].every(key=>sameNumber(current[key],expected[key]))||
    !sameNumber(current.visible===false?0:1,1)||
    ![next.x,next.y].every(value=>Number.isFinite(Number(value)))||
    Number(next.x)<0||Number(next.y)<0||Number(next.x)+Number(current.w)>100||Number(next.y)+Number(current.h)>100){
   return {blocks:source,changed:false,reason:"The element changed after this suggestion was created."};
  }
  const candidate={...current,x:Number(next.x),y:Number(next.y)};
  if(hasLayoutCollision(candidate,source,current.id))return {blocks:source,changed:false,reason:"The suggested position now overlaps another element."};
  patch={x:Number(next.x),y:Number(next.y)};
 }else if(suggestion.action==="normalize-item-columns"){
  if(current.type!=="items_table")return {blocks:source,changed:false,reason:"This is no longer an item table."};
  const columns=Array.isArray(current.columns)?current.columns:defaultColumns;
  const expected=suggestion.expectedColumns||[];
  if(columns.length!==expected.length||columns.some((column,columnIndex)=>{
   const original=expected[columnIndex];
   return !column||!original||column.key!==original.key||column.visible!==original.visible||!sameNumber(column.width,original.width);
  }))return {blocks:source,changed:false,reason:"The item columns changed after this suggestion was created."};
  if(!Array.isArray(suggestion.nextColumns)||suggestion.nextColumns.length!==columns.length)return {blocks:source,changed:false,reason:"The suggested column layout is invalid."};
  patch={columns:suggestion.nextColumns.map((column,columnIndex)=>column?.visible===false?columns[columnIndex]:{...columns[columnIndex],width:Number(column.width)})};
 }else if(suggestion.action==="optimize-item-column"){
  if(current.type!=="items_table")return {blocks:source,changed:false,reason:"This is no longer an item table."};
  const columns=Array.isArray(current.columns)&&current.columns.length?current.columns:defaultColumns;
  const expected=suggestion.expectedColumns||[];
  if(!Array.isArray(columns)||columns.length!==expected.length||columns.some((column,columnIndex)=>{
   const original=expected[columnIndex];
   return !column||!original||column.key!==original.key||column.visible!==original.visible||!sameNumber(column.width,original.width);
  }))return {blocks:source,changed:false,reason:"The item columns changed after this preview was created."};
  const nextColumns=suggestion.nextColumns;
  if(!Array.isArray(nextColumns)||nextColumns.length!==columns.length||
    nextColumns.some((column,columnIndex)=>!column||column.key!==columns[columnIndex]?.key||
      column.visible!==columns[columnIndex]?.visible||
      !Number.isFinite(Number(column.width))||
      (column.visible!==false&&Number(column.width)<3))) {
   return {blocks:source,changed:false,reason:"The suggested column widths are invalid."};
  }
  const visibleTotal=nextColumns.filter(column=>column.visible!==false).reduce((sum,column)=>sum+Number(column.width),0);
  if(Math.abs(visibleTotal-100)>0.01)return {blocks:source,changed:false,reason:"The suggested visible columns do not fit the table width."};
  patch={columns:nextColumns.map((column,columnIndex)=>({
   ...columns[columnIndex],
   width:column.visible===false?columns[columnIndex].width:Number(column.width)
  }))};
 }else if(suggestion.action==="fit-text"){
  const currentSize=Number(current.fontSize||10);
  if(current.visible===false||!["field","text"].includes(current.type)||!sameNumber(currentSize,suggestion.expectedFontSize)||
    !Number.isFinite(Number(suggestion.nextFontSize))||Number(suggestion.nextFontSize)<6||Number(suggestion.nextFontSize)>=currentSize){
   return {blocks:source,changed:false,reason:"The text element changed after this suggestion was created."};
  }
  patch={fontSize:Number(suggestion.nextFontSize)};
 }else{
  return {blocks:source,changed:false,reason:"This suggestion type is not supported."};
 }

 const next=source.slice();
 next[index]={...current,...patch};
 return {blocks:next,changed:true,reason:"Suggestion applied."};
}

export function applyInvoiceLayoutOptimizationPlan(blocks=[],suggestions=[],defaultColumns=[]) {
 let next=Array.isArray(blocks)?blocks:[];
 let applied=0;
 (Array.isArray(suggestions)?suggestions:[]).forEach(suggestion=>{
  const result=applyInvoiceLayoutOptimizationSuggestion(next,suggestion,defaultColumns);
  if(result.changed){next=result.blocks;applied+=1;}
 });
 return {blocks:next,changed:applied>0,appliedCount:applied,skippedCount:Math.max(0,(Array.isArray(suggestions)?suggestions.length:0)-applied)};
}
