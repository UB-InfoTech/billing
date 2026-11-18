import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import {extractOcrLines} from "./invoiceOcrMapping.js";

const TESSERACT_WORKER_URL="https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js";
const TESSERACT_CORE_URL="https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0";
const TESSDATA_URL="https://tessdata.projectnaptha.com/4.0.0_fast";
const MAX_FILE_BYTES=12*1024*1024;

function sendProgress(onProgress,stage,progress){
  if(typeof onProgress!=="function")return;
  onProgress({
    stage:String(stage||"Preparing OCR"),
    progress:Number.isFinite(Number(progress))?Math.max(0,Math.min(1,Number(progress))):0
  });
}

function createCanvas(width,height){
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.ceil(width));
  canvas.height=Math.max(1,Math.ceil(height));
  const context=canvas.getContext("2d",{willReadFrequently:true});
  if(!context)throw new Error("This browser could not prepare the invoice page for text recognition.");
  context.fillStyle="#fff";
  context.fillRect(0,0,canvas.width,canvas.height);
  return {canvas,context};
}

async function prepareImage(file){
  if(typeof createImageBitmap!=="function"){
    throw new Error("Image reading is not available in this browser. Guided field placement is still available.");
  }
  const bitmap=await createImageBitmap(file);
  try{
    if(bitmap.width*bitmap.height>80000000){
      throw new Error("This image is too large to scan safely. Resize it and import it again.");
    }
    const scale=Math.min(2,1800/bitmap.width,2400/bitmap.height);
    const width=Math.max(1,Math.round(bitmap.width*scale));
    const height=Math.max(1,Math.round(bitmap.height*scale));
    const {canvas,context}=createCanvas(width,height);
    context.drawImage(bitmap,0,0,width,height);
    return {canvas,width,height,source:"image",pageCount:1};
  }finally{
    bitmap.close?.();
  }
}

async function preparePdf(file){
  pdfjsLib.GlobalWorkerOptions.workerSrc=pdfWorkerUrl;
  const bytes=new Uint8Array(await file.arrayBuffer());
  const task=pdfjsLib.getDocument({data:bytes,useSystemFonts:true,isEvalSupported:false});
  const document=await task.promise;
  try{
    if(!document.numPages)throw new Error("This PDF has no readable pages.");
    const page=await document.getPage(1);
    const baseViewport=page.getViewport({scale:1});
    const scale=Math.min(2,1800/baseViewport.width,2400/baseViewport.height);
    const viewport=page.getViewport({scale});
    const {canvas,context}=createCanvas(viewport.width,viewport.height);
    await page.render({canvasContext:context,viewport}).promise;
    return {canvas,width:canvas.width,height:canvas.height,source:"pdf",pageCount:document.numPages};
  }finally{
    await document.destroy();
  }
}

async function scanImportedInvoiceText(file,onProgress){
  if(!file||typeof file.arrayBuffer!=="function")throw new Error("Choose an invoice image or PDF first.");
  if(Number(file.size)>MAX_FILE_BYTES)throw new Error("Invoice design files must be 12 MB or smaller.");
  const name=String(file.name||"").toLowerCase();
  const type=String(file.type||"").toLowerCase();
  const isPdf=type==="application/pdf"||name.endsWith(".pdf");
  if(!isPdf&&!type.startsWith("image/")){
    throw new Error("Text recognition supports PDF, JPG, PNG and WebP files.");
  }
  sendProgress(onProgress,"Preparing first page",0.02);
  const prepared=isPdf?await preparePdf(file):await prepareImage(file);
  let worker=null;
  try{
    const {createWorker}=await import("tesseract.js");
    sendProgress(onProgress,"Loading English recognition engine",0.05);
    worker=await createWorker("eng",1,{
      workerPath:TESSERACT_WORKER_URL,
      corePath:TESSERACT_CORE_URL,
      langPath:TESSDATA_URL,
      logger:message=>{
        sendProgress(onProgress,message?.status||"Reading invoice text",0.08+Number(message?.progress||0)*0.9);
      }
    });
    const result=await worker.recognize(prepared.canvas,{rotateAuto:true},{blocks:true});
    sendProgress(onProgress,"Organising detected text",1);
    const lines=extractOcrLines(result?.data,prepared.width,prepared.height);
    return {source:prepared.source,page:1,pageCount:prepared.pageCount,width:prepared.width,height:prepared.height,lines};
  }finally{
    if(worker)await worker.terminate().catch(()=>{});
    prepared.canvas.width=0;
    prepared.canvas.height=0;
  }
}

export {scanImportedInvoiceText};
