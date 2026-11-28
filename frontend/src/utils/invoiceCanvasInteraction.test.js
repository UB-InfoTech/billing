import test from "node:test";
import assert from "node:assert/strict";
import {canStartInvoiceBlockDrag,getInvoicePointerDragThreshold} from "./invoiceCanvasInteraction.js";

test("touch selection and page scrolling do not start an element drag by default",()=>{
  assert.equal(canStartInvoiceBlockDrag("touch",false),false);
});

test("touch dragging is available after the user explicitly enables Move elements",()=>{
  assert.equal(canStartInvoiceBlockDrag("touch",true),true);
});

test("mouse and pen dragging remain directly available",()=>{
  assert.equal(canStartInvoiceBlockDrag("mouse",false),true);
  assert.equal(canStartInvoiceBlockDrag("pen",false),true);
  assert.equal(canStartInvoiceBlockDrag(undefined,false),true);
});

test("touch drags use a larger movement threshold to avoid accidental nudges",()=>{
  assert.equal(getInvoicePointerDragThreshold("touch"),5);
});

test("mouse and pen drags remain precise",()=>{
  assert.equal(getInvoicePointerDragThreshold("mouse"),1.5);
  assert.equal(getInvoicePointerDragThreshold("pen"),1.5);
});
