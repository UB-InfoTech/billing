const RECT_TOLERANCE_PX=2;
const PAGE_DIMENSIONS_MM={
  A4:{width:210,height:297},
  A5:{width:148,height:210},
  Letter:{width:215.9,height:279.4}
};

function getRect(element,pageRect){
  const rect=element?.getBoundingClientRect?.();
  if(!rect||!pageRect)return null;
  return {
    left:rect.left-pageRect.left,
    top:rect.top-pageRect.top,
    right:rect.right-pageRect.left,
    bottom:rect.bottom-pageRect.top,
    width:rect.width,
    height:rect.height
  };
}

function getElementStyle(documentRef,element){
  try{
    return documentRef?.defaultView?.getComputedStyle?.(element)||null;
  }catch{
    return null;
  }
}

function getCellOverflowAxes(cells){
  const axes=new Set();
  cells.forEach(cell=>{
    if(Number(cell.scrollWidth)>Number(cell.clientWidth)+RECT_TOLERANCE_PX)axes.add("width");
    if(Number(cell.scrollHeight)>Number(cell.clientHeight)+RECT_TOLERANCE_PX)axes.add("height");
  });
  return Array.from(axes);
}

export function measureRenderedInvoiceDocument(documentRef){
  if(!documentRef?.querySelectorAll)return {pages:[]};
  const sheets=Array.from(documentRef.querySelectorAll(".design-sheet"));
  return {
    pages:sheets.map((sheet,pageIndex)=>{
      const sheetRect=sheet.getBoundingClientRect();
      const blocks=Array.from(sheet.querySelectorAll(".design-block")).map((block,blockIndex)=>{
        const bounds=getRect(block,sheetRect);
        const type=block.getAttribute("data-block-type")||"";
        const table=block.querySelector(".design-items");
        const blankTable=block.querySelector(".design-blank-table");
        const blankTableElement=blankTable?.querySelector?.("table");
        const blankTableMetrics=blankTable?{
          wrapper:{
            scrollWidth:Number(blankTable.scrollWidth)||0,
            clientWidth:Number(blankTable.clientWidth)||0,
            scrollHeight:Number(blankTable.scrollHeight)||0,
            clientHeight:Number(blankTable.clientHeight)||0
          },
          table:blankTableElement?{
            scrollWidth:Number(blankTableElement.scrollWidth)||0,
            clientWidth:Number(blankTableElement.clientWidth)||0,
            scrollHeight:Number(blankTableElement.scrollHeight)||0,
            clientHeight:Number(blankTableElement.clientHeight)||0
          }:null
        }:null;
        const header=table?.querySelector?.("thead");
        const headerStyle=header?getElementStyle(documentRef,header):null;
        const rows=table?Array.from(table.querySelectorAll("tbody tr")).map((row,index)=>{
          const rect=getRect(row,sheetRect);
          const rowStyle=getElementStyle(documentRef,row);
          const cells=Array.from(row.querySelectorAll?.("th,td")||[]);
          return {
            itemNumber:Number(row.getAttribute("data-item-number"))||index+1,
            label:row.getAttribute("data-item-label")||"",
            geometryAvailable:Boolean(rect&&rect.width>0&&rect.height>0),
            left:rect?.left??null,
            top:rect?.top??null,
            right:rect?.right??null,
            bottom:rect?.bottom??null,
            height:rect?.height??null,
            breakInside:String(rowStyle?.breakInside||"").toLowerCase(),
            pageBreakInside:String(rowStyle?.pageBreakInside||"").toLowerCase(),
            cellOverflowAxes:getCellOverflowAxes(cells),
            cellCount:cells.length
          };
        }):[];
        const images=Array.from(block.querySelectorAll("img")).map(image=>({
          broken:Boolean(image.complete&&image.naturalWidth===0),
          alt:image.getAttribute("alt")||""
        }));
        return {
          id:block.getAttribute("data-block-id")||("page-"+(pageIndex+1)+"-block-"+(blockIndex+1)),
          type,
          bounds,
          tablePresent:type==="items_table"?Boolean(table):undefined,
          headerDisplay:header?String(headerStyle?.display||"").toLowerCase():"",
          contentHeight:Number(block.scrollHeight)||0,
          clientHeight:Number(block.clientHeight)||0,
          contentWidth:Number(block.scrollWidth)||0,
          clientWidth:Number(block.clientWidth)||0,
          headerPresent:table?Boolean(header):undefined,
          headerVisible:table?Boolean(header?.getBoundingClientRect?.().height>0):undefined,
          headerLabels:header?Array.from(header.querySelectorAll?.("th")||[]).map(cell=>String(cell.textContent||"").replace(/\s+/g," ").trim().toLowerCase()):[],
          blankTableMetrics,
          rows,
          images
        };
      });
      return {
        pageNumber:pageIndex+1,
        width:Number(sheet.clientWidth)||sheetRect.width,
        height:Number(sheet.clientHeight)||sheetRect.height,
        blocks
      };
    })
  };
}

function addWarning(warnings,warning){
  if(!warnings.some(item=>item.id===warning.id))warnings.push(warning);
}

function auditInvoiceItemRowGeometry(table,pageNumber,warnings){
  const rows=(Array.isArray(table.rows)?table.rows:[]).map((row,index)=>({
    ...row,
    itemNumber:Number(row.itemNumber)||index+1,
    top:Number(row.top),
    bottom:Number(row.bottom),
    left:Number(row.left),
    right:Number(row.right)
  }));
  const bounds=table.bounds||{};
  rows.forEach((row,index)=>{
    if(row.geometryAvailable===false)return;
    if(Number.isFinite(row.left)&&Number.isFinite(row.right)&&
      Number.isFinite(Number(bounds.left))&&Number.isFinite(Number(bounds.right))&&
      (row.left<Number(bounds.left)-RECT_TOLERANCE_PX||row.right>Number(bounds.right)+RECT_TOLERANCE_PX)){
      addWarning(warnings,{
        id:"item-row-width-"+pageNumber+"-"+table.id+"-"+row.itemNumber,
        severity:"error",
        title:"An item row exceeds the table width",
        detail:"Item "+row.itemNumber+" extends beyond the item table's left or right edge on page "+pageNumber+". Review the table width and visible column widths.",
        pageNumber,
        blockId:table.id,
        blockType:table.type,
        itemNumber:row.itemNumber
      });
    }
    if(index===0)return;
    const previous=rows[index-1];
    if(![row.top,row.bottom,previous.top,previous.bottom].every(Number.isFinite))return;
    const overlaps=row.top<previous.bottom-RECT_TOLERANCE_PX&&row.bottom>previous.top+RECT_TOLERANCE_PX;
    if(overlaps){
      addWarning(warnings,{
        id:"item-row-overlap-"+pageNumber+"-"+table.id+"-"+previous.itemNumber+"-"+row.itemNumber,
        severity:"error",
        title:"Invoice item rows overlap",
        detail:"Items "+previous.itemNumber+" and "+row.itemNumber+" overlap on page "+pageNumber+". Check row sizing and the item-table print layout.",
        pageNumber,
        blockId:table.id,
        blockType:table.type,
        itemNumber:row.itemNumber,
        previousItemNumber:previous.itemNumber
      });
    }else if(row.top<previous.top-RECT_TOLERANCE_PX){
      addWarning(warnings,{
        id:"item-row-order-"+pageNumber+"-"+table.id+"-"+previous.itemNumber+"-"+row.itemNumber,
        severity:"warning",
        title:"Invoice item rows are out of visual order",
        detail:"Item "+row.itemNumber+" appears above item "+previous.itemNumber+" on page "+pageNumber+". Check the table's row layout before printing.",
        pageNumber,
        blockId:table.id,
        blockType:table.type,
        itemNumber:row.itemNumber,
        previousItemNumber:previous.itemNumber
      });
    }
  });
}

function expectedPageDimensions(pageSize,orientation){
  const size=PAGE_DIMENSIONS_MM[pageSize];
  if(!size)return null;
  const landscape=orientation==="landscape";
  const widthMm=landscape?size.height:size.width;
  const heightMm=landscape?size.width:size.height;
  return {widthMm,heightMm,widthPx:widthMm*96/25.4,heightPx:heightMm*96/25.4};
}

export function analyzeRenderedInvoiceMetrics(measurements={},expectedPage={}){
  const pages=Array.isArray(measurements.pages)?measurements.pages:[];
  const warnings=[];
  if(!pages.length){
    warnings.push({
      id:"missing-pages",
      severity:"warning",
      title:"Invoice pages could not be measured",
      detail:"The preview loaded, but no custom invoice page was found. Check the selected design and preview again."
    });
  }
  const pageSpec=expectedPage&&Object.keys(expectedPage).length?expectedPage:measurements.expectedPage||{};
  const expected=expectedPageDimensions(pageSpec.pageSize,pageSpec.orientation||"portrait");
  const printMargins=pageSpec.printMargins||{};
  const marginAuditEnabled=["top","right","bottom","left"].some(key=>printMargins[key]!==undefined);
  const firstPage=pages[0];
  pages.forEach((page,pageIndex)=>{
    const pageNumber=Number(page.pageNumber)||pageIndex+1;
    const pageWidth=Math.max(0,Number(page.width)||0);
    const pageHeight=Math.max(0,Number(page.height)||0);
    if(expected&&pageWidth&&pageHeight){
      const widthDeviation=Math.abs(pageWidth-expected.widthPx)/expected.widthPx;
      const heightDeviation=Math.abs(pageHeight-expected.heightPx)/expected.heightPx;
      if(widthDeviation>0.08||heightDeviation>0.08){
        addWarning(warnings,{
          id:"page-size-mismatch-"+pageNumber,
          severity:"warning",
          title:"Paper size or orientation does not match",
          detail:"Page "+pageNumber+" measures approximately "+(pageWidth*25.4/96).toFixed(1)+" × "+(pageHeight*25.4/96).toFixed(1)+" mm, but the design is set to "+pageSpec.pageSize+" "+(pageSpec.orientation||"portrait")+". Check paper and orientation in the print dialog.",
          pageNumber
        });
      }
    }
    if(pageIndex>0&&firstPage){
      const firstWidth=Math.max(0,Number(firstPage.width)||0);
      const firstHeight=Math.max(0,Number(firstPage.height)||0);
      if(firstWidth&&firstHeight&&(Math.abs(pageWidth-firstWidth)/firstWidth>0.025||Math.abs(pageHeight-firstHeight)/firstHeight>0.025)){
        addWarning(warnings,{
          id:"inconsistent-page-size-"+pageNumber,
          severity:"warning",
          title:"Pages have different dimensions",
          detail:"Page "+pageNumber+" is a different size from page 1. Confirm the paper setting before printing.",
          pageNumber
        });
      }
    }
    const pageBlocks=Array.isArray(page.blocks)?page.blocks:[];
    const itemTables=pageBlocks.filter(block=>block.type==="items_table");
    const safeMarginPx=marginAuditEnabled?{
      top:Math.max(4,Number(printMargins.top)||0)*96/25.4,
      right:Math.max(4,Number(printMargins.right)||0)*96/25.4,
      bottom:Math.max(4,Number(printMargins.bottom)||0)*96/25.4,
      left:Math.max(4,Number(printMargins.left)||0)*96/25.4
    }:null;
    pageBlocks.forEach(block=>{
      const bounds=block.bounds||{};
      const blockName=block.label||block.id||"Invoice element";
      if(pageWidth&&pageHeight&&bounds&&
        (Number(bounds.left)<-RECT_TOLERANCE_PX||Number(bounds.top)<-RECT_TOLERANCE_PX||
         Number(bounds.right)>pageWidth+RECT_TOLERANCE_PX||Number(bounds.bottom)>pageHeight+RECT_TOLERANCE_PX)){
        addWarning(warnings,{
          id:"page-boundary-"+pageNumber+"-"+block.id,
          severity:"error",
          title:"Element extends beyond the paper",
          detail:blockName+" extends outside page "+pageNumber+". Move it inward or reduce its size.",
          pageNumber,
          blockId:block.id
        });
      }
      if(safeMarginPx&&pageWidth&&pageHeight&&bounds&&!["shape","divider"].includes(block.type)){
        const edges=[];
        if(Number(bounds.left)<safeMarginPx.left-RECT_TOLERANCE_PX)edges.push("left");
        if(Number(bounds.top)<safeMarginPx.top-RECT_TOLERANCE_PX)edges.push("top");
        if(Number(bounds.right)>pageWidth-safeMarginPx.right+RECT_TOLERANCE_PX)edges.push("right");
        if(Number(bounds.bottom)>pageHeight-safeMarginPx.bottom+RECT_TOLERANCE_PX)edges.push("bottom");
        if(edges.length){
          addWarning(warnings,{
            id:"print-margin-overflow-"+pageNumber+"-"+block.id,
            severity:"warning",
            title:"Element overlaps the printer-safe margin",
            detail:blockName+" enters the "+edges.join(", ")+" edge area on page "+pageNumber+". Move it inward or use the recommended 4 mm margins.",
            pageNumber,
            blockId:block.id,
            blockType:block.type,
            edges
          });
        }
      }
      const overflowsVertically=Number(block.contentHeight)>Number(block.clientHeight)+RECT_TOLERANCE_PX;
      const overflowsHorizontally=Number(block.contentWidth)>Number(block.clientWidth)+RECT_TOLERANCE_PX;
      if(["field","text","totals"].includes(block.type)&&(overflowsVertically||overflowsHorizontally)){
        addWarning(warnings,{
          id:"clipped-content-"+pageNumber+"-"+block.id,
          severity:"warning",
          title:"Text or totals may be clipped",
          detail:blockName+" does not fit its box on page "+pageNumber+". Increase its size or reduce the text size.",
          pageNumber,
          blockId:block.id,
          blockType:block.type
        });
      }
      if(block.type==="blank_table"){
        const metrics=block.blankTableMetrics||{};
        const wrapper=metrics.wrapper||{};
        const tableMetrics=metrics.table||{};
        const wrapperWidthOverflow=Number(wrapper.scrollWidth)>Number(wrapper.clientWidth)+RECT_TOLERANCE_PX;
        const wrapperHeightOverflow=Number(wrapper.scrollHeight)>Number(wrapper.clientHeight)+RECT_TOLERANCE_PX;
        const tableWidthOverflow=Number(tableMetrics.scrollWidth)>Number(tableMetrics.clientWidth)+RECT_TOLERANCE_PX;
        const tableHeightOverflow=Number(tableMetrics.scrollHeight)>Number(tableMetrics.clientHeight)+RECT_TOLERANCE_PX;
        if(overflowsVertically||overflowsHorizontally||wrapperWidthOverflow||wrapperHeightOverflow||tableWidthOverflow||tableHeightOverflow){
          const axes=[];
          if(overflowsHorizontally||wrapperWidthOverflow||tableWidthOverflow)axes.push("width");
          if(overflowsVertically||wrapperHeightOverflow||tableHeightOverflow)axes.push("height");
          addWarning(warnings,{
            id:"blank-table-overflow-"+pageNumber+"-"+block.id,
            severity:"warning",
            title:"Blank table content may be clipped",
            detail:"The blank table exceeds its allotted "+(axes.length?axes.join(" and "):"space")+" on page "+pageNumber+". Reduce the text size, increase the table box or remove unused rows.",
            pageNumber,
            blockId:block.id,
            blockType:block.type
          });
        }
      }
      if(block.type==="items_table"&&block.tablePresent===false){
        addWarning(warnings,{
          id:"item-table-unmeasured-"+pageNumber+"-"+block.id,
          severity:"error",
          title:"Item table could not be measured",
          detail:"The item table on page "+pageNumber+" was not found in the rendered preview. Reopen the preview before printing.",
          pageNumber,
          blockId:block.id,
          blockType:block.type
        });
      }
      if(block.type==="items_table"&&block.headerDisplay&&block.headerDisplay!=="table-header-group"){
        addWarning(warnings,{
          id:"table-header-repeat-"+pageNumber+"-"+block.id,
          severity:"warning",
          title:"Item headings may not repeat on printed pages",
          detail:"The item-table heading on page "+pageNumber+" is not configured as a repeating table header. Keep the heading row in the table header group.",
          pageNumber,
          blockId:block.id,
          blockType:block.type
        });
      }
      if(block.type==="items_table"&&overflowsHorizontally){
        addWarning(warnings,{
          id:"table-width-overflow-"+pageNumber+"-"+block.id,
          severity:"warning",
          title:"Item table may be too wide",
          detail:"The item table extends beyond its allotted width on page "+pageNumber+". Review column widths or the page orientation.",
          pageNumber,
          blockId:block.id,
          blockType:block.type
        });
      }
      if(block.type==="items_table"&&(block.headerPresent===false||block.headerVisible===false)){
        addWarning(warnings,{
          id:"table-header-missing-"+pageNumber+"-"+block.id,
          severity:"warning",
          title:block.headerPresent===false?"Item table heading is missing":"Item table heading is not visible",
          detail:(block.headerPresent===false?"The item table has no heading row on page ":"The item table heading is hidden on page ")+pageNumber+". Check the table layout.",
          pageNumber,
          blockId:block.id
        });
      }
      (Array.isArray(block.rows)?block.rows:[]).forEach(row=>{
        const rowHeight=Number(row.height)||Math.max(0,Number(row.bottom)-Number(row.top));
        const usablePageHeight=pageHeight-(safeMarginPx?(safeMarginPx.top+safeMarginPx.bottom):0);
        if(pageHeight&&rowHeight>usablePageHeight+RECT_TOLERANCE_PX){
          addWarning(warnings,{
            id:"oversized-item-row-"+pageNumber+"-"+block.id+"-"+row.itemNumber,
            severity:"error",
            title:"An item row cannot fit on a page",
            detail:"Item "+row.itemNumber+(row.label?" (\u201c"+row.label+"\u201d)":"")+" is taller than the usable page area. Shorten its content, reduce its row text size or split the description across separate fields before printing.",
            pageNumber,
            blockId:block.id,
            blockType:block.type,
            itemNumber:row.itemNumber,
            rowHeight,
            usablePageHeight
          });
        }
        if(Array.isArray(row.cellOverflowAxes)&&row.cellOverflowAxes.length){
          addWarning(warnings,{
            id:"item-cell-overflow-"+pageNumber+"-"+block.id+"-"+row.itemNumber,
            severity:"error",
            title:"An item cell is clipped",
            detail:"Item "+row.itemNumber+" has cell content overflowing its "+row.cellOverflowAxes.join(" and ")+" on page "+pageNumber+". Widen the affected column or shorten the cell text.",
            pageNumber,
            blockId:block.id,
            blockType:block.type,
            itemNumber:row.itemNumber,
            axes:row.cellOverflowAxes
          });
        }
        const breakRules=[row.breakInside,row.pageBreakInside].filter(Boolean);
        if(breakRules.length&&!breakRules.some(value=>value==="avoid"||value==="avoid-page"||value.includes("avoid"))){
          addWarning(warnings,{
            id:"item-row-break-"+pageNumber+"-"+block.id+"-"+row.itemNumber,
            severity:"warning",
            title:"An item row may split across printed pages",
            detail:"Item "+row.itemNumber+" does not have a keep-together print rule. Keep break-inside: avoid on item rows so a line item stays on one page.",
            pageNumber,
            blockId:block.id,
            blockType:block.type,
            itemNumber:row.itemNumber
          });
        }
        if(row.geometryAvailable===false){
          addWarning(warnings,{
            id:"item-row-unmeasured-"+pageNumber+"-"+block.id+"-"+row.itemNumber,
            severity:"warning",
            title:"An item row could not be measured",
            detail:"Item "+row.itemNumber+" has no measurable row bounds in the preview. Reopen the actual print preview before printing.",
            pageNumber,
            blockId:block.id,
            blockType:block.type,
            itemNumber:row.itemNumber
          });
          return;
        }
        if(bounds&&Number(row.bottom)>Number(bounds.bottom)+RECT_TOLERANCE_PX){
          const itemName=String(row.label||"").trim();
          addWarning(warnings,{
            id:"row-overflow-"+pageNumber+"-"+block.id+"-"+row.itemNumber,
            severity:"error",
            title:"An item row exceeds the table area",
            detail:"Item "+row.itemNumber+(itemName?" (“"+itemName+"”)":"")+" extends past the item table on page "+pageNumber+". Make the table taller, reduce its text size or widen the description column.",
            pageNumber,
            blockId:block.id,
            blockType:block.type,
            itemNumber:row.itemNumber
          });
        }
        if(safeMarginPx&&pageHeight&&(Number(row.top)<safeMarginPx.top-RECT_TOLERANCE_PX||Number(row.bottom)>pageHeight-safeMarginPx.bottom+RECT_TOLERANCE_PX)){
          const marginEdges=[];
          if(Number(row.top)<safeMarginPx.top-RECT_TOLERANCE_PX)marginEdges.push("top");
          if(Number(row.bottom)>pageHeight-safeMarginPx.bottom+RECT_TOLERANCE_PX)marginEdges.push("bottom");
          addWarning(warnings,{
            id:"item-row-margin-"+pageNumber+"-"+block.id+"-"+row.itemNumber,
            severity:"warning",
            title:"An item row enters the printer-safe margin",
            detail:"Item "+row.itemNumber+" is too close to the "+marginEdges.join(" or ")+" edge on page "+pageNumber+". Adjust the table or page margins.",
            pageNumber,
            blockId:block.id,
            blockType:block.type,
            itemNumber:row.itemNumber,
            edges:marginEdges
          });
        }
        if(pageHeight&&Number(row.bottom)>pageHeight+RECT_TOLERANCE_PX){
          addWarning(warnings,{
            id:"row-page-overflow-"+pageNumber+"-"+block.id+"-"+row.itemNumber,
            severity:"error",
            title:"An item row extends beyond the page",
            detail:"Item "+row.itemNumber+" extends beyond the paper on page "+pageNumber+". Adjust the table or page layout.",
            pageNumber,
            blockId:block.id,
            blockType:block.type,
            itemNumber:row.itemNumber
          });
        }
      });
      (Array.isArray(block.images)?block.images:[]).forEach((image,imageIndex)=>{
        if(image.broken){
          addWarning(warnings,{
            id:"broken-image-"+pageNumber+"-"+block.id+"-"+imageIndex,
            severity:"warning",
            title:"An image could not be loaded",
            detail:(image.alt||blockName)+" is missing from page "+pageNumber+". Re-add the image or restore its source file.",
            pageNumber,
            blockId:block.id
          });
        }
      });
    });
    itemTables.forEach(table=>auditInvoiceItemRowGeometry(table,pageNumber,warnings));
    if(itemTables.length>1){
      addWarning(warnings,{
        id:"multiple-item-tables-"+pageNumber,
        severity:"warning",
        title:"More than one item table appears on this page",
        detail:"Multiple item-table elements are visible on page "+pageNumber+". Check that items are not duplicated.",
        pageNumber
      });
    }
  });

  const tablesWithHeaders=pages.flatMap((page,pageIndex)=>
    (Array.isArray(page.blocks)?page.blocks:[])
      .filter(block=>block.type==="items_table"&&Array.isArray(block.headerLabels)&&block.headerLabels.length>0)
      .map(block=>({pageIndex,pageNumber:Number(page.pageNumber)||pageIndex+1,block,labels:block.headerLabels}))
  );
  const firstTableHeader=tablesWithHeaders[0];
  if(firstTableHeader){
    tablesWithHeaders.slice(1).forEach(table=>{
      if(table.pageIndex<=firstTableHeader.pageIndex)return;
      if(table.labels.length===firstTableHeader.labels.length&&table.labels.every((label,index)=>label===firstTableHeader.labels[index]))return;
      addWarning(warnings,{
        id:"continuation-heading-mismatch-"+table.pageNumber+"-"+table.block.id,
        severity:"warning",
        title:"Continuation-page headings do not match",
        detail:"The item-table column headings on page "+table.pageNumber+" differ from the first item-table page. Check that continuation pages repeat the same columns in the same order.",
        pageNumber:table.pageNumber,
        blockId:table.block.id,
        blockType:table.block.type
      });
    });
  }

  const anyItemTable=pages.some(page=>(Array.isArray(page.blocks)?page.blocks:[]).some(block=>block.type==="items_table"));
  if(anyItemTable){
    const seen=new Set();
    let nextExpected=1;
    pages.forEach((page,pageIndex)=>{
      const pageNumber=Number(page.pageNumber)||pageIndex+1;
      const tables=(Array.isArray(page.blocks)?page.blocks:[]).filter(block=>block.type==="items_table");
      tables.forEach(table=>{
        const rows=Array.isArray(table.rows)?table.rows:[];
        if(!rows.length&&pages.some(candidate=>(candidate.blocks||[]).some(block=>block.type==="items_table"&&(block.rows||[]).length))){
          addWarning(warnings,{
            id:"empty-item-table-page-"+pageNumber+"-"+table.id,
            severity:"warning",
            title:"An item-table page is empty",
            detail:"The item table on page "+pageNumber+" has no item rows. Check the page-break layout.",
            pageNumber,
            blockId:table.id
          });
        }
        rows.forEach(row=>{
          const itemNumber=Number(row.itemNumber);
          if(!Number.isFinite(itemNumber)||itemNumber<=0)return;
          if(seen.has(itemNumber)){
            addWarning(warnings,{
              id:"duplicate-item-number-"+pageNumber+"-"+table.id+"-"+itemNumber,
              severity:"error",
              title:"An invoice item is repeated",
              detail:"Item "+itemNumber+" appears more than once across the printed pages. Check pagination before printing.",
              pageNumber,
              blockId:table.id,
              itemNumber
            });
            return;
          }
          if(itemNumber!==nextExpected){
            addWarning(warnings,{
              id:"item-sequence-"+pageNumber+"-"+table.id+"-"+itemNumber,
              severity:"warning",
              title:"Item numbering skips or changes order",
              detail:"The next expected item is "+nextExpected+", but item "+itemNumber+" appears on page "+pageNumber+". Review the multipage table.",
              pageNumber,
              blockId:table.id,
              itemNumber
            });
          }
          seen.add(itemNumber);
          nextExpected=itemNumber+1;
        });
      });
    });
  }
  return {pageCount:pages.length,warnings,hasErrors:warnings.some(warning=>warning.severity==="error")};
}

export function checkRenderedInvoiceDocument(documentRef,expectedPage={}){
  return analyzeRenderedInvoiceMetrics(measureRenderedInvoiceDocument(documentRef),expectedPage);
}
