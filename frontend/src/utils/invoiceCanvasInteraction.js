function canStartInvoiceBlockDrag(pointerType,touchMoveMode=false){
  return pointerType!=="touch"||touchMoveMode===true;
}

function getInvoicePointerDragThreshold(pointerType){
  return pointerType==="touch"?5:1.5;
}

export {canStartInvoiceBlockDrag,getInvoicePointerDragThreshold};
