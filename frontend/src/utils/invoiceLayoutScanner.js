const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

function groupPositions(values,tolerance=0.35){
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
  const groups=[];
  sorted.forEach(value=>{
    const last=groups[groups.length-1];
    if(last&&value-last.values[last.values.length-1]<=tolerance)last.values.push(value);
    else groups.push({values:[value]});
  });
  return groups.map(group=>group.values.reduce((sum,value)=>sum+value,0)/group.values.length);
}

function findTableRegion(horizontalLines=[],verticalLines=[]){
  const horizontal=groupPositions(horizontalLines,0.45);
  const vertical=groupPositions(verticalLines,0.45).filter(value=>value>=2&&value<=98);
  let best=null;
  for(let start=0;start<horizontal.length-2;start+=1){
    const top=horizontal[start];
    if(top<16||top>84)continue;
    for(let end=start+2;end<horizontal.length;end+=1){
      const bottom=horizontal[end];
      const height=bottom-top;
      if(height<7||height>62)continue;
      const gaps=horizontal.slice(start+1,end+1).map((value,index)=>value-horizontal[start+index]);
      const average=gaps.reduce((sum,value)=>sum+value,0)/gaps.length;
      if(average<0.65||average>12)continue;
      const variance=gaps.reduce((sum,value)=>sum+Math.pow(value-average,2),0)/gaps.length;
      const variation=Math.sqrt(variance)/average;
      if(variation>0.55)continue;
      const score=gaps.length*3-variation*4-Math.abs(top-42)*0.025;
      if(!best||score>best.score){
        const columns=vertical.filter(value=>value>3&&value<97);
        const left=columns.length>=2?Math.min(...columns):4;
        const right=columns.length>=2?Math.max(...columns):96;
        best={score,region:{
          x:clamp(left,2,90),
          y:clamp(top,8,90),
          w:clamp(right-left,10,96),
          h:clamp(height,7,70)
        },rows:gaps.length+1};
      }
    }
  }
  return best?{...best.region,rows:best.rows}:null;
}

function analyzeInvoicePixels({width,height,data}={}){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<10||height<10||!data||data.length<width*height*4){
    throw new Error("The imported image could not be scanned.");
  }
  const horizontal=[];
  const vertical=[];
  const xStart=Math.floor(width*0.025);
  const xEnd=Math.ceil(width*0.975);
  const yStart=Math.floor(height*0.02);
  const yEnd=Math.ceil(height*0.98);
  const isInk=(offset)=>{
    const red=data[offset],green=data[offset+1],blue=data[offset+2];
    const max=Math.max(red,green,blue),min=Math.min(red,green,blue);
    return max<185&&(max-min)<70;
  };
  for(let y=yStart;y<yEnd;y+=1){
    let count=0;
    for(let x=xStart;x<xEnd;x+=1)if(isInk((y*width+x)*4))count+=1;
    if(count/(xEnd-xStart)>=0.36)horizontal.push(y/height*100);
  }
  for(let x=xStart;x<xEnd;x+=1){
    let count=0;
    for(let y=yStart;y<yEnd;y+=1)if(isInk((y*width+x)*4))count+=1;
    if(count/(yEnd-yStart)>=0.18)vertical.push(x/width*100);
  }
  return {
    source:"image",
    page:{width,height},
    horizontalRuleCount:groupPositions(horizontal,0.35).length,
    verticalRuleCount:groupPositions(vertical,0.35).length,
    table:findTableRegion(horizontal,vertical)
  };
}

function collectPdfRules(content,pageBox){
  const horizontal=[];
  const vertical=[];
  const [left,bottom,right,top]=pageBox;
  const width=right-left,height=top-bottom;
  if(width<=0||height<=0)return {horizontal,vertical};
  const toX=value=>(Number(value)-left)/width*100;
  const toY=value=>(top-Number(value))/height*100;
  const number="[-+]?(?:\\d+\\.?\\d*|\\.\\d+)";
  const linePattern=new RegExp("("+number+")\\s+("+number+")\\s+m\\s+("+number+")\\s+("+number+")\\s+l","g");
  let match;
  while((match=linePattern.exec(content))){
    const x1=Number(match[1]),y1=Number(match[2]),x2=Number(match[3]),y2=Number(match[4]);
    if(Math.abs(y1-y2)<0.8&&Math.abs(x2-x1)>width*0.18)horizontal.push(toY((y1+y2)/2));
    if(Math.abs(x1-x2)<0.8&&Math.abs(y2-y1)>height*0.12)vertical.push(toX((x1+x2)/2));
  }
  const rectPattern=new RegExp("("+number+")\\s+("+number+")\\s+("+number+")\\s+("+number+")\\s+re","g");
  while((match=rectPattern.exec(content))){
    const x=Number(match[1]),y=Number(match[2]),w=Number(match[3]),h=Number(match[4]);
    if(w>width*0.18)horizontal.push(toY(y),toY(y+h));
    if(h>height*0.12)vertical.push(toX(x),toX(x+w));
  }
  return {horizontal,vertical};
}

async function scanPdfFile(file){
  const bytes=new Uint8Array(await file.arrayBuffer());
  const documentText=new TextDecoder("latin1").decode(bytes);
  const boxMatch=documentText.match(/\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/);
  if(!boxMatch)throw new Error("The PDF page size could not be read. You can still use guided field placement.");
  const pageBox=boxMatch.slice(1).map(Number);
  const horizontal=[],vertical=[];
  let streamPosition=0;
  while((streamPosition=documentText.indexOf("stream",streamPosition))!==-1){
    let start=streamPosition+6;
    if(documentText[start]==="\r"&&documentText[start+1]==="\n")start+=2;
    else if(documentText[start]==="\n"||documentText[start]==="\r")start+=1;
    const end=documentText.indexOf("endstream",start);
    if(end<0)break;
    const header=documentText.slice(Math.max(0,streamPosition-500),streamPosition);
    let streamText="";
    if(/FlateDecode/.test(header)){
      try{
        if(typeof DecompressionStream!=="undefined"){
          const compressed=bytes.slice(start,end);
          const decoded=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer();
          streamText=new TextDecoder("latin1").decode(decoded);
        }
      }catch(error){
        // Unsupported compressed streams are skipped; the locked PDF remains usable.
      }
    }else{
      streamText=documentText.slice(start,end);
    }
    if(streamText){
      const rules=collectPdfRules(streamText,pageBox);
      horizontal.push(...rules.horizontal);
      vertical.push(...rules.vertical);
    }
    streamPosition=end+9;
  }
  const pageWidth=Math.abs(pageBox[2]-pageBox[0]);
  const pageHeight=Math.abs(pageBox[3]-pageBox[1]);
  return {
    source:"pdf",
    page:{width:pageWidth,height:pageHeight},
    horizontalRuleCount:groupPositions(horizontal,0.35).length,
    verticalRuleCount:groupPositions(vertical,0.35).length,
    table:findTableRegion(horizontal,vertical)
  };
}

async function scanImportedInvoiceLayout(file){
  const fileType=String(file?.type||"").toLowerCase();
  const name=String(file?.name||"").toLowerCase();
  if(fileType==="application/pdf"||name.endsWith(".pdf"))return scanPdfFile(file);
  if(!fileType.startsWith("image/"))throw new Error("Choose a PDF or image to scan.");
  if(typeof createImageBitmap!=="function")throw new Error("Image scanning is not available in this browser. You can still use guided field placement.");
  const bitmap=await createImageBitmap(file);
  try{
    const scale=Math.min(1,900/bitmap.width,1250/bitmap.height);
    const width=Math.max(10,Math.round(bitmap.width*scale));
    const height=Math.max(10,Math.round(bitmap.height*scale));
    const canvas=document.createElement("canvas");
    canvas.width=width;
    canvas.height=height;
    const context=canvas.getContext("2d",{willReadFrequently:true});
    if(!context)throw new Error("Image scanning is not available in this browser.");
    context.fillStyle="#fff";
    context.fillRect(0,0,width,height);
    context.drawImage(bitmap,0,0,width,height);
    return analyzeInvoicePixels({width,height,data:context.getImageData(0,0,width,height).data});
  }finally{
    bitmap.close?.();
  }
}

function buildInvoiceSmartLayout(scan){
  const table=scan?.table||{x:5,y:40,w:90,h:35};
  const tableX=clamp(table.x,3,85);
  const tableY=clamp(table.y,28,72);
  const tableWidth=clamp(table.w,15,96-tableX);
  const tableHeight=clamp(Math.max(table.h,25),22,45);
  const bottom=clamp(tableY+tableHeight+2,68,84);
  const blocks=[
    {type:"field",fieldKey:"company_name",label:"Business name",x:5,y:4,w:56,h:6},
    {type:"field",fieldKey:"company_address",label:"Business address",x:5,y:11,w:56,h:6},
    {type:"field",fieldKey:"company_gstin",label:"Business GSTIN",x:5,y:18,w:55,h:3},
    {type:"logo",fieldKey:"logo",label:"Business logo",x:82,y:4,w:12,h:11},
    {type:"field",fieldKey:"invoice_title",label:"Invoice title",x:64,y:4,w:31,h:5,align:"right",bold:true,fontSize:13},
    {type:"field",fieldKey:"invoice_no",label:"Invoice number",x:64,y:11,w:31,h:4,align:"right"},
    {type:"field",fieldKey:"customer_name",label:"Customer name",x:5,y:24,w:46,h:5,bold:true},
    {type:"field",fieldKey:"customer_address",label:"Customer address",x:5,y:30,w:46,h:8},
    {type:"field",fieldKey:"invoice_date",label:"Invoice date",x:58,y:24,w:37,h:4,align:"right"},
    {type:"field",fieldKey:"due_date",label:"Due date",x:58,y:29,w:37,h:4,align:"right"},
    {type:"items_table",fieldKey:"items",label:"Invoice items",x:tableX,y:tableY,w:tableWidth,h:tableHeight,fontSize:8},
    {type:"totals",fieldKey:"totals",label:"Invoice totals",x:64,y:bottom,w:31,h:14,align:"right",fontSize:9},
    {type:"field",fieldKey:"terms",label:"Terms and conditions",x:5,y:bottom,w:54,h:12},
    {type:"field",fieldKey:"signature",label:"Authorised signatory",x:63,y:94,w:32,h:4,align:"right",bold:true}
  ];
  return {blocks,tableDetected:Boolean(scan?.table)};
}

export {analyzeInvoicePixels,buildInvoiceSmartLayout,findTableRegion,scanImportedInvoiceLayout};
