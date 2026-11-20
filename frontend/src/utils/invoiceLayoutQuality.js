export function analyzeInvoiceLayout(blocks=[],defaultColumns=[]){const visible=blocks.filter(b=>b&&b.visible!==false),issues=[];visible.forEach(b=>{const label=b.label||b.type||"Element";if(b.x<0||b.y<0||b.x+b.w>100||b.y+b.h>100)issues.push({severity:"error",title:"Element outside page",detail:label+" extends beyond the printable page.",fixable:true});if(b.w<3||b.h<2)issues.push({severity:"warning",title:"Element may be too small",detail:label+" may be hard to read when printed.",fixable:false});if(b.type==="items_table"){const cols=(b.columns||defaultColumns).filter(c=>c.visible!==false);const sum=cols.reduce((s,c)=>s+Number(c.width||0),0);if(cols.length&&sum>100)issues.push({severity:"warning",title:"Item table columns exceed 100%",detail:"Visible column widths may overflow the table.",fixable:true});}});for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){const a=visible[i],b=visible[j];if(["shape","divider"].includes(a.type)||["shape","divider"].includes(b.type))continue;const ox=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),oy=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);if(ox>1&&oy>1&&ox*oy>Math.min(a.w*a.h,b.w*b.h)*.18)issues.push({severity:"warning",title:"Possible element overlap",detail:(a.label||a.type)+" overlaps "+(b.label||b.type)+". Confirm in print preview.",fixable:false});}return issues;}
export function applySafeInvoiceLayoutFixes(blocks=[],defaultColumns=[]){
 let changed=false;
 const next=blocks.map(block=>{
  if(!block||block.visible===false)return block;
  const b={...block},width=Math.max(3,Math.min(100,Number(b.w)||3)),height=Math.max(2,Math.min(100,Number(b.h)||2));
  const x=Math.max(0,Math.min(Number(b.x)||0,100-width)),y=Math.max(0,Math.min(Number(b.y)||0,100-height));
  if(width!==b.w||height!==b.h||x!==b.x||y!==b.y){Object.assign(b,{x,y,w:width,h:height});changed=true;}
  if(b.type==="items_table"){
   const source=Array.isArray(b.columns)?b.columns:defaultColumns,visible=source.filter(column=>column.visible!==false);
   const total=visible.reduce((sum,column)=>sum+Math.max(3,Number(column.width)||3),0);
   if(visible.length&&total>100){
    const extraTotal=visible.reduce((sum,column)=>sum+Math.max(0,Number(column.width||0)-3),0),distributable=100-3*visible.length;
    b.columns=source.map(column=>column.visible===false?column:{...column,width:3+(extraTotal?Math.max(0,Number(column.width||0)-3)/extraTotal:1/visible.length)*distributable});
    changed=true;
   }
  }
  return b;
 });
 return {blocks:next,changed};
}
