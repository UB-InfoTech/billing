import test from "node:test";
import assert from "node:assert/strict";
import {getInvoiceCanvasScaleSettings} from "./invoiceCanvasScale.js";

test("desktop keeps the natural editing scale instead of shrinking the invoice",()=>{
  assert.deepEqual(
    getInvoiceCanvasScaleSettings(420,794,{isMobile:false,orientation:"portrait"}),
    {fitScale:420/794,readableScale:1}
  );
});

test("mobile portrait keeps readable text and offers fit width as a separate option",()=>{
  const scale=getInvoiceCanvasScaleSettings(360,794,{isMobile:true,orientation:"portrait"});
  assert.equal(scale.fitScale,360/794);
  assert.equal(scale.readableScale,0.76);
  assert.ok(scale.readableScale>scale.fitScale);
});

test("mobile landscape uses a stable readable floor without forcing the full page into a tiny view",()=>{
  const scale=getInvoiceCanvasScaleSettings(360,1123,{isMobile:true,orientation:"landscape"});
  assert.equal(scale.fitScale,360/1123);
  assert.equal(scale.readableScale,0.62);
  assert.ok(scale.readableScale>scale.fitScale);
});

test("wide mobile viewports use the larger natural scale",()=>{
  const scale=getInvoiceCanvasScaleSettings(900,794,{isMobile:true,orientation:"portrait"});
  assert.deepEqual(scale,{fitScale:1,readableScale:1});
});

test("invalid sizes fall back to safe dimensions",()=>{
  assert.deepEqual(
    getInvoiceCanvasScaleSettings(0,0,{isMobile:false}),
    {fitScale:320/794,readableScale:1}
  );
});
