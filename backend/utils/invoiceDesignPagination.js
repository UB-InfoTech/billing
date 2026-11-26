const PAGE_DIMENSIONS_MM={
  A4:{width:210,height:297},
  A5:{width:148,height:210},
  Letter:{width:215.9,height:279.4}
};
const HEADER_HEIGHT_MM=8;
const MIN_ROW_HEIGHT_MM=9;
const SAFETY_GAP_MM=3;
const CLOSING_FIELD_KEYS=new Set(["amount_words","amount_paid","balance_due","bank_details","terms","signature"]);
const DEFAULT_ITEM_COLUMNS=[
  {key:"sr",label:"Sr",width:5,visible:true,order:0},
  {key:"description",label:"Desc.",width:17,visible:true,order:1},
  {key:"designNumber",label:"Design No.",width:13,visible:true,order:2},
  {key:"hsnCode",label:"HSN",width:9,visible:true,order:3},
  {key:"quantity",label:"Qty",width:8,visible:true,order:4},
  {key:"qtyUnit",label:"Unit",width:5,visible:true,order:5},
  {key:"cut",label:"Cut",width:7,visible:true,order:6},
  {key:"MTR",label:"MTR",width:7,visible:true,order:7},
  {key:"unitPrice",label:"Rate",width:8,visible:true,order:8},
  {key:"amount",label:"Amount",width:8,visible:true,order:9},
  {key:"discount",label:"Disc.",width:7,visible:true,order:10},
  {key:"taxable",label:"Taxable",width:12,visible:true,order:11}
];

function clamp(value,min,max,fallback){
  const number=Number(value);
  return Number.isFinite(number)?Math.min(max,Math.max(min,number)):fallback;
}

function getInvoicePageMetrics(template={}){
  const base=PAGE_DIMENSIONS_MM[template.pageSize]||PAGE_DIMENSIONS_MM.A4;
  const landscape=template.orientation==="landscape";
  const pageWidth=landscape?base.height:base.width;
  const pageHeight=landscape?base.width:base.height;
  const margins=template.printMargins||{};
  const top=clamp(margins.top,0,25,0);
  const right=clamp(margins.right,0,25,0);
  const bottom=clamp(margins.bottom,0,25,0);
  const left=clamp(margins.left,0,25,0);
  return {
    pageWidth,
    pageHeight,
    contentWidth:Math.max(1,pageWidth-left-right),
    contentHeight:Math.max(1,pageHeight-top-bottom)
  };
}

function getInvoiceTableMetrics(template={}){
  const blocks=Array.isArray(template.blocks)?template.blocks:[];
  const table=blocks.find(block=>block&&block.type==="items_table"&&block.visible!==false);
  if(!table)return null;
  const page=getInvoicePageMetrics(template);
  return {
    table,
    tableWidthMm:page.contentWidth*clamp(table.w,2,100,2)/100,
    tableHeightMm:page.contentHeight*clamp(table.h,2,100,2)/100,
    printableWidthMm:page.contentWidth,
    printableHeightMm:page.contentHeight
  };
}

function getColumns(table,options={}){
  const configured=Array.isArray(options.itemColumns)&&options.itemColumns.length
    ?options.itemColumns
    :DEFAULT_ITEM_COLUMNS;
  const blockColumns=Array.isArray(table?.columns)&&table.columns.length
    ?table.columns.filter(column=>column.visible!==false)
    :[];
  const source=blockColumns.length?blockColumns:configured.filter(column=>column.visible!==false);
  return source.slice().sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0));
}

function getInvoiceItemCellValue(item,column,discountRate=0,itemNumber=0){
  const unit=item?.qtyUnit||"PCS";
  const enteredQty=unit==="MTR"?Number(item?.MTR||0):Number(item?.quantity||0);
  const shortQty=Math.max(0,Number(item?.shortPcs||0));
  const billableQty=Math.max(0,enteredQty-shortQty);
  const amount=billableQty*Number(item?.unitPrice||0);
  const taxable=amount*(1-Number(discountRate||0)/100);
  switch(column?.key){
    case "sr":return itemNumber;
    case "description":return item?.orderName||"";
    case "designNumber":return item?.designNumber||"";
    case "hsnCode":return item?.hsnCode||"";
    case "quantity":return unit==="MTR"?(item?.quantity||0):billableQty;
    case "qtyUnit":return unit;
    case "cut":return item?.cut||0;
    case "MTR":return unit==="MTR"?billableQty:(item?.MTR||0);
    case "shortPcs":return shortQty;
    case "unitPrice":return Number(item?.unitPrice||0).toFixed(2);
    case "amount":return Number(amount||0).toFixed(2);
    case "discount":return Number(discountRate||0).toFixed(2)+"%";
    case "taxable":return Number(taxable||0).toFixed(2);
    default:return item?.[column?.key]??"";
  }
}

const FULL_WIDTH_SCRIPT=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Devanagari}\p{Script=Gujarati}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Sinhala}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const MEDIUM_WIDTH_SCRIPT=/[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Cyrillic}\p{Script=Greek}]/u;
function characterWidthUnits(character){
  if(/\p{Mark}/u.test(character)||character==="\u200d"||character==="\ufe0e"||character==="\ufe0f"||/\p{Emoji_Modifier}/u.test(character))return 0;
  if(/\p{Extended_Pictographic}/u.test(character))return 1;
  if(/\p{Regional_Indicator}/u.test(character))return 0.5;
  if(/\s/u.test(character))return 0.3;
  if(/[ilI.,'’!|:;]/u.test(character))return 0.28;
  if(/[MW@%₹#&]/u.test(character))return 0.82;
  if(FULL_WIDTH_SCRIPT.test(character))return 0.95;
  if(MEDIUM_WIDTH_SCRIPT.test(character))return 0.78;
  return 0.52;
}

function estimateWrappedLineCount(value,availableUnits){
  const maxUnits=Math.max(1,Number(availableUnits)||1);
  let lineCount=0;
  String(value??"").split(/\r?\n/u).forEach(paragraph=>{
    const words=paragraph.trim().split(/\s+/u).filter(Boolean);
    if(!words.length){lineCount+=1;return;}
    let used=0;
    words.forEach(word=>{
      const wordUnits=Array.from(word).reduce((sum,character)=>sum+characterWidthUnits(character),0);
      if(used>0&&used+0.3+wordUnits>maxUnits){lineCount+=1;used=0;}
      if(wordUnits>maxUnits){
        const wrappedLines=Math.ceil(wordUnits/maxUnits);
        lineCount+=Math.max(0,wrappedLines-1);
        used=wordUnits-(wrappedLines-1)*maxUnits;
      }else{
        used+=(used>0?0.3:0)+wordUnits;
      }
    });
    lineCount+=1;
  });
  return Math.max(1,lineCount);
}

function estimateInvoiceItemRow(item,columns,metrics,table,options={},itemNumber=0){
  const fontSize=clamp(table.fontSize,6,48,8);
  const paddingPx=clamp(table.tableCellPadding,1,10,4);
  const paddingMm=paddingPx*25.4/96;
  const lineHeightMm=fontSize*1.2*25.4/96;
  const borderMm=Math.max(0.5,clamp(table.tableBorderWidth,0,3,1)*25.4/96);
  let maxLines=1;
  columns.forEach(column=>{
    const widthPercent=clamp(column.width,3,100,8);
    const cellWidthMm=metrics.tableWidthMm*widthPercent/100;
    const usableWidthMm=Math.max(2,cellWidthMm-paddingMm*2-borderMm);
    const availableUnits=(usableWidthMm*96/25.4)/fontSize;
    const value=getInvoiceItemCellValue(item,column,options.discountRate,itemNumber);
    const lines=estimateWrappedLineCount(value,availableUnits);
    maxLines=Math.max(maxLines,lines);
  });
  const contentHeightMm=maxLines*lineHeightMm+paddingMm*2+borderMm;
  const rowHeightMm=Math.max(MIN_ROW_HEIGHT_MM,Math.ceil(contentHeightMm*4)/4);
  return {rowHeightMm,lineCount:maxLines};
}

function getInvoiceRowsPerPage(template={}){
  const metrics=getInvoiceTableMetrics(template);
  if(!metrics)return 60;
  return Math.max(1,Math.min(60,Math.floor(
    (metrics.tableHeightMm-HEADER_HEIGHT_MM-SAFETY_GAP_MM)/MIN_ROW_HEIGHT_MM
  )));
}

function isFinalPageOnlyBlock(block,itemTable){
  if(!block||!itemTable)return false;
  if(block.type==="totals")return true;
  const tableBottom=(Number(itemTable.y)||0)+(Number(itemTable.h)||0);
  const top=Number(block.y)||0;
  // These are invoice-closing details, not repeating header fields. Keep them
  // with totals and the signature on the last page even when the user placed
  // them above the item table. Their coordinates remain user-controlled.
  const isClosingField=block.type==="field"&&CLOSING_FIELD_KEYS.has(block.fieldKey);
  return isClosingField||top>=tableBottom-0.5;
}

function getFinalPageClosingLayout(itemTable,blocks,metrics){
  if(!itemTable||!metrics)return {reservedClosingSpaceMm:0,closingBlockIds:[]};
  const tableLeft=Number(itemTable.x)||0;
  const tableRight=tableLeft+(Number(itemTable.w)||0);
  const tableTop=Number(itemTable.y)||0;
  const tableBottom=tableTop+(Number(itemTable.h)||0);
  const tableHeightMm=metrics.tableHeightMm;
  const contentHeightMm=metrics.printableHeightMm;
  const closingBlocks=(Array.isArray(blocks)?blocks:[]).filter(block=>
    block.id!==itemTable.id&&isFinalPageOnlyBlock(block,itemTable)
  );
  let reservedClosingSpaceMm=0;
  closingBlocks.forEach(block=>{
    const left=Number(block.x)||0;
    const right=left+(Number(block.w)||0);
    if(left>=tableRight-0.5||right<=tableLeft+0.5)return;
    const top=Number(block.y)||0;
    const bottom=top+(Number(block.h)||0);
    const overlapStart=Math.max(tableTop,top);
    const overlapEnd=Math.min(tableBottom,bottom);
    if(overlapEnd<=overlapStart)return;
    const startOffsetMm=(overlapStart-tableTop)*contentHeightMm/100;
    const reservedFromStart=Math.min(tableHeightMm,Math.max(0,tableHeightMm-startOffsetMm+SAFETY_GAP_MM));
    reservedClosingSpaceMm=Math.max(reservedClosingSpaceMm,reservedFromStart);
  });
  return {reservedClosingSpaceMm,closingBlockIds:closingBlocks.map(block=>block.id).filter(Boolean)};
}

function balanceFinalPageRows(pages,finalCapacityMm){
  if(!Array.isArray(pages)||pages.length<2)return pages;
  const previous=pages[pages.length-2],last=pages[pages.length-1];
  if(!previous?.length||!last?.length)return pages;
  let previousHeight=previous.reduce((sum,row)=>sum+row.rowHeightMm,0);
  let lastHeight=last.reduce((sum,row)=>sum+row.rowHeightMm,0);
  while(previous.length>1){
    const candidate=previous[previous.length-1];
    const candidateHeight=Number(candidate.rowHeightMm)||MIN_ROW_HEIGHT_MM;
    if(lastHeight+candidateHeight>finalCapacityMm+0.01)break;
    const currentGap=Math.abs(previousHeight-lastHeight);
    const nextGap=Math.abs((previousHeight-candidateHeight)-(lastHeight+candidateHeight));
    if(nextGap>=currentGap)break;
    previous.pop();last.unshift(candidate);
    previousHeight-=candidateHeight;lastHeight+=candidateHeight;
  }
  return pages;
}

function paginateInvoiceRows(rows,normalCapacityMm,finalCapacityMm,hasClosingReservation){
  if(!rows.length)return [[]];
  const pages=[];
  let cursor=0;
  while(cursor<rows.length){
    const remaining=rows.slice(cursor);
    const remainingHeight=remaining.reduce((sum,row)=>sum+row.rowHeightMm,0);
    if(remainingHeight<=finalCapacityMm+0.01){
      pages.push(remaining);cursor=rows.length;break;
    }
    let take=0,usedHeight=0;
    while(cursor+take<rows.length){
      const row=rows[cursor+take],nextHeight=usedHeight+row.rowHeightMm;
      if(nextHeight>normalCapacityMm+0.01){
        if(take===0){row.exceedsTableArea=true;take=1;}
        break;
      }
      usedHeight=nextHeight;take+=1;
    }
    if(take===0){rows[cursor].exceedsTableArea=true;take=1;}
    if(cursor+take===rows.length&&hasClosingReservation){
      let finalStart=rows.length,finalHeight=0;
      while(finalStart>cursor){
        const candidateHeight=Number(rows[finalStart-1].rowHeightMm)||MIN_ROW_HEIGHT_MM;
        if(finalHeight+candidateHeight>finalCapacityMm+0.01)break;
        finalStart-=1;finalHeight+=candidateHeight;
      }
      if(finalStart>cursor&&finalStart<rows.length)take=finalStart-cursor;
      else{pages.push(rows.slice(cursor));cursor=rows.length;pages.push([]);break;}
    }
    pages.push(rows.slice(cursor,cursor+take));cursor+=take;
  }
  if(!pages.length)pages.push([]);
  return balanceFinalPageRows(pages,finalCapacityMm);
}

function buildInvoiceDesignPages(template={},items=[],options={}){
  const visibleBlocks=(Array.isArray(template.blocks)?template.blocks:[]).filter(block=>block&&block.visible!==false);
  const tableMetrics=getInvoiceTableMetrics(template);
  const itemTable=tableMetrics?.table||null;
  const sourceItems=Array.isArray(items)?items:[];
  const columns=itemTable?getColumns(itemTable,options):[];
  const closingLayout=getFinalPageClosingLayout(itemTable,visibleBlocks,tableMetrics);
  const normalCapacityMm=tableMetrics?Math.max(0,tableMetrics.tableHeightMm-HEADER_HEIGHT_MM-SAFETY_GAP_MM):null;
  const finalCapacityMm=tableMetrics?Math.max(0,normalCapacityMm-closingLayout.reservedClosingSpaceMm):null;
  const pageRows=[];
  if(!itemTable||!sourceItems.length){
    pageRows.push(sourceItems.map((item,index)=>({item,itemNumber:index+1,rowHeightMm:MIN_ROW_HEIGHT_MM,estimatedLines:1})));
  }else{
    const estimatedRows=sourceItems.map((item,index)=>{
      const estimate=estimateInvoiceItemRow(item,columns,tableMetrics,itemTable,options,index+1);
      return {
        item,itemNumber:index+1,rowHeightMm:estimate.rowHeightMm,estimatedLines:estimate.lineCount,
        exceedsTableArea:HEADER_HEIGHT_MM+estimate.rowHeightMm+SAFETY_GAP_MM>tableMetrics.tableHeightMm
      };
    });
    pageRows.push(...paginateInvoiceRows(estimatedRows,normalCapacityMm,finalCapacityMm,closingLayout.reservedClosingSpaceMm>0));
  }
  if(!pageRows.length)pageRows.push([]);
  const pageCount=pageRows.length;
  return pageRows.map((rows,pageIndex)=>{
    const first=pageIndex===0,last=pageIndex===pageCount-1;
    let pageBlocks=visibleBlocks;
    if(itemTable&&pageCount>1){
      const tableTop=Number(itemTable.y)||0,tableBottom=tableTop+(Number(itemTable.h)||0);
      pageBlocks=visibleBlocks.filter(block=>{
        if(block.type==="items_table")return rows.length>0||sourceItems.length===0;
        if(isFinalPageOnlyBlock(block,itemTable))return last;
        const top=Number(block.y)||0,bottom=top+(Number(block.h)||0);
        if(bottom<=tableTop+0.5)return true;
        if(top>=tableBottom-0.5)return last;
        return first;
      });
    }
    const closingOnly=Boolean(itemTable&&sourceItems.length&&last&&!rows.length&&closingLayout.closingBlockIds.length);
    return {
      pageNumber:pageIndex+1,totalPages:pageCount,rows,
      rowHeightTotalMm:rows.reduce((sum,row)=>sum+row.rowHeightMm,0),
      tableHeightMm:tableMetrics?.tableHeightMm||null,
      itemCapacityMm:last?finalCapacityMm:normalCapacityMm,
      reservedClosingSpaceMm:last?closingLayout.reservedClosingSpaceMm:0,
      closingBlockIds:last?closingLayout.closingBlockIds:[],
      closingOnly,blocks:pageBlocks
    };
  });
}

module.exports={
  buildInvoiceDesignPages,
  getInvoiceRowsPerPage,
  estimateInvoiceItemRow,
  getInvoiceItemCellValue,
  getInvoiceTableMetrics
};
