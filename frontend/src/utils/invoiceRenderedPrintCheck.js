const RECT_TOLERANCE_PX=2;

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

export function measureRenderedInvoiceDocument(documentRef){
  if(!documentRef?.querySelectorAll)return {pages:[]};
  const sheets=Array.from(documentRef.querySelectorAll(".design-sheet"));
  return {
    pages:sheets.map((sheet,pageIndex)=>{
      const sheetRect=sheet.getBoundingClientRect();
      const blocks=Array.from(sheet.querySelectorAll(".design-block")).map(block=>{
        const bounds=getRect(block,sheetRect);
        const type=block.getAttribute("data-block-type")||"";
        const table=block.querySelector(".design-items");
        const rows=table?Array.from(table.querySelectorAll("tbody tr")).map((row,index)=>{
          const rect=getRect(row,sheetRect);
          return {
            itemNumber:Number(row.getAttribute("data-item-number"))||index+1,
            label:row.getAttribute("data-item-label")||"",
            bottom:rect?.bottom??0
          };
        }):[];
        const images=Array.from(block.querySelectorAll("img")).map(image=>({
          broken:Boolean(image.complete&&image.naturalWidth===0),
          alt:image.getAttribute("alt")||""
        }));
        return {
          id:block.getAttribute("data-block-id")||("page-"+(pageIndex+1)+"-block-"+(blocks?.length||0)),
          type,
          bounds,
          contentHeight:Number(block.scrollHeight)||0,
          clientHeight:Number(block.clientHeight)||0,
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

export function analyzeRenderedInvoiceMetrics(measurements={}){
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
  pages.forEach((page,pageIndex)=>{
    const pageNumber=Number(page.pageNumber)||pageIndex+1;
    const pageWidth=Math.max(0,Number(page.width)||0);
    const pageHeight=Math.max(0,Number(page.height)||0);
    (Array.isArray(page.blocks)?page.blocks:[]).forEach(block=>{
      const bounds=block.bounds||{};
      const blockName=block.label||block.id||"Invoice element";
      if(pageWidth&&pageHeight&&(Number(bounds.left)<-RECT_TOLERANCE_PX||Number(bounds.top)<-RECT_TOLERANCE_PX||Number(bounds.right)>pageWidth+RECT_TOLERANCE_PX||Number(bounds.bottom)>pageHeight+RECT_TOLERANCE_PX)){
        warnings.push({
          id:"page-boundary-"+pageNumber+"-"+block.id,
          severity:"error",
          title:"Element extends beyond the paper",
          detail:blockName+" extends outside page "+pageNumber+". Move it inward or reduce its size.",
          pageNumber,
          blockId:block.id
        });
      }
      if(["field","text","totals"].includes(block.type)&&Number(block.contentHeight)>Number(block.clientHeight)+RECT_TOLERANCE_PX){
        warnings.push({
          id:"clipped-content-"+pageNumber+"-"+block.id,
          severity:"warning",
          title:"Text or totals may be clipped",
          detail:blockName+" needs more vertical space on page "+pageNumber+". Increase its height or reduce the text size.",
          pageNumber,
          blockId:block.id
        });
      }
      (Array.isArray(block.rows)?block.rows:[]).forEach(row=>{
        if(Number(row.bottom)>Number(bounds.bottom)+RECT_TOLERANCE_PX){
          const itemName=String(row.label||"").trim();
          warnings.push({
            id:"row-overflow-"+pageNumber+"-"+block.id+"-"+row.itemNumber,
            severity:"error",
            title:"An item row exceeds the table area",
            detail:"Item "+row.itemNumber+(itemName?" (“"+itemName+"”)":"")+" extends past the item table on page "+pageNumber+". Make the table taller, reduce its text size or widen the description column.",
            pageNumber,
            blockId:block.id,
            itemNumber:row.itemNumber
          });
        }
      });
      (Array.isArray(block.images)?block.images:[]).forEach((image,imageIndex)=>{
        if(image.broken){
          warnings.push({
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
  });
  return {pageCount:pages.length,warnings,hasErrors:warnings.some(warning=>warning.severity==="error")};
}

export function checkRenderedInvoiceDocument(documentRef){
  return analyzeRenderedInvoiceMetrics(measureRenderedInvoiceDocument(documentRef));
}
