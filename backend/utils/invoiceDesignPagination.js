const PAGE_HEIGHT_MM={A4:297,A5:210,Letter:279.4};
const HEADER_HEIGHT_MM=8;
const ROW_HEIGHT_MM=9;
const SAFETY_GAP_MM=3;

function getInvoiceRowsPerPage(template={}){
  const pageSize=PAGE_HEIGHT_MM[template.pageSize]?template.pageSize:"A4";
  const orientation=template.orientation==="landscape"?"landscape":"portrait";
  const pageHeight=orientation==="landscape"
    ?(pageSize==="A4"?210:pageSize==="A5"?148:215.9)
    :PAGE_HEIGHT_MM[pageSize];
  const table=(Array.isArray(template.blocks)?template.blocks:[]).find(
    block=>block&&block.type==="items_table"&&block.visible!==false
  );
  if(!table)return 60;
  const tableHeight=pageHeight*Math.min(100,Math.max(2,Number(table.h)||2))/100;
  return Math.max(1,Math.min(60,Math.floor((tableHeight-HEADER_HEIGHT_MM-SAFETY_GAP_MM)/ROW_HEIGHT_MM)));
}

function buildInvoiceDesignPages(template={},items=[]){
  const visibleBlocks=(Array.isArray(template.blocks)?template.blocks:[]).filter(
    block=>block&&block.visible!==false
  );
  const itemTable=visibleBlocks.find(block=>block.type==="items_table");
  const sourceItems=Array.isArray(items)?items:[];
  const capacity=itemTable?getInvoiceRowsPerPage(template):Math.max(1,sourceItems.length);
  const chunks=[];
  if(!sourceItems.length)chunks.push([]);
  else{
    for(let index=0;index<sourceItems.length;index+=capacity){
      chunks.push(sourceItems.slice(index,index+capacity));
    }
  }

  const pageCount=chunks.length;
  return chunks.map((rows,pageIndex)=>{
    const first=pageIndex===0;
    const last=pageIndex===pageCount-1;
    let pageBlocks=visibleBlocks;
    if(itemTable&&pageCount>1){
      const tableTop=Number(itemTable.y)||0;
      const tableBottom=tableTop+(Number(itemTable.h)||0);
      pageBlocks=visibleBlocks.filter(block=>{
        if(block.type==="items_table")return true;
        const top=Number(block.y)||0;
        const bottom=top+(Number(block.h)||0);
        const isHeader=bottom<=tableTop+0.5;
        const isFooter=top>=tableBottom-0.5;
        if(isHeader)return true;
        if(isFooter)return last;
        return first;
      });
    }
    return {
      pageNumber:pageIndex+1,
      totalPages:pageCount,
      rows:rows.map((item,index)=>({item,itemNumber:pageIndex*capacity+index+1})),
      blocks:pageBlocks
    };
  });
}

module.exports={buildInvoiceDesignPages,getInvoiceRowsPerPage};
