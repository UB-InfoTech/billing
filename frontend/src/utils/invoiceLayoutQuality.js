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
