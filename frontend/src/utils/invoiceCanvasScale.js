function getInvoiceCanvasScaleSettings(availableWidth,pageWidth,{isMobile=false,orientation="portrait"}={}) {
  const width=Number(availableWidth);
  const page=Number(pageWidth);
  const safeWidth=Number.isFinite(width)&&width>0?width:320;
  const safePage=Number.isFinite(page)&&page>0?page:794;
  const fitScale=Math.max(0.25,Math.min(1,safeWidth/safePage));
  const readableFloor=orientation==="landscape"?0.62:0.76;
  const readableScale=isMobile?Math.max(fitScale,readableFloor):1;
  return {fitScale,readableScale};
}

export {getInvoiceCanvasScaleSettings};
