const PAGE_DIMENSIONS_MM={
  A4:{width:210,height:297},
  A5:{width:148,height:210},
  Letter:{width:215.9,height:279.4}
};
const HEADER_HEIGHT_MM=8;
const MIN_ROW_HEIGHT_MM=9;
const SAFETY_GAP_MM=3;
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

function buildInvoiceDesignPages(template={},items=[],options={}){
  const visibleBlocks=(Array.isArray(template.blocks)?template.blocks:[]).filter(
    block=>block&&block.visible!==false
  );
  const tableMetrics=getInvoiceTableMetrics(template);
  const itemTable=tableMetrics?.table||null;
  const sourceItems=Array.isArray(items)?items:[];
  const columns=itemTable?getColumns(itemTable,options):[];
  const pageRows=[];
  if(!itemTable||!sourceItems.length){
    pageRows.push(sourceItems.map((item,index)=>({
      item,itemNumber:index+1,rowHeightMm:MIN_ROW_HEIGHT_MM,estimatedLines:1
    })));
  }else{
    let currentRows=[];
    let usedHeight=HEADER_HEIGHT_MM;
    sourceItems.forEach((item,index)=>{
      const estimate=estimateInvoiceItemRow(item,columns,tableMetrics,itemTable,options,index+1);
      const wouldExceed=usedHeight+estimate.rowHeightMm+SAFETY_GAP_MM>tableMetrics.tableHeightMm;
      if(currentRows.length&&wouldExceed){
        pageRows.push(currentRows);
        currentRows=[];
        usedHeight=HEADER_HEIGHT_MM;
      }
      currentRows.push({
        item,
        itemNumber:index+1,
        rowHeightMm:estimate.rowHeightMm,
        estimatedLines:estimate.lineCount,
        exceedsTableArea:HEADER_HEIGHT_MM+estimate.rowHeightMm+SAFETY_GAP_MM>tableMetrics.tableHeightMm
      });
      usedHeight+=estimate.rowHeightMm;
    });
    if(currentRows.length)pageRows.push(currentRows);
  }
  if(!pageRows.length)pageRows.push([]);

  const pageCount=pageRows.length;
  return pageRows.map((rows,pageIndex)=>{
    const first=pageIndex===0;
    const last=pageIndex===pageCount-1;
    let pageBlocks=visibleBlocks;
    if(itemTable&&pageCount>1){
      const tableTop=Number(itemTable.y)||0;
      const tableBottom=tableTop+(Number(itemTable.h)||0);
      pageBlocks=visibleBlocks.filter(block=>{
        if(block.type==="items_table")return true;
        if(block.type==="totals")return last;
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
      rows,
      rowHeightTotalMm:rows.reduce((sum,row)=>sum+row.rowHeightMm,0),
      tableHeightMm:tableMetrics?.tableHeightMm||null,
      blocks:pageBlocks
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
