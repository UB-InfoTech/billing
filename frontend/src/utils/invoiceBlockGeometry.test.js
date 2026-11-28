import test from "node:test";
import assert from "node:assert/strict";
import { getInvoiceBlockResizePatch } from "./invoiceBlockGeometry.js";

const block = { x: 20, y: 25, w: 30, h: 20 };

test("east and south handles resize only the matching dimensions", () => {
  assert.deepEqual(getInvoiceBlockResizePatch(block, "e", 8, 5), {
    x: 20, y: 25, w: 38, h: 20
  });
  assert.deepEqual(getInvoiceBlockResizePatch(block, "s", 8, 5), {
    x: 20, y: 25, w: 30, h: 25
  });
});

test("west and north handles move the origin while keeping the opposite edge fixed", () => {
  assert.deepEqual(getInvoiceBlockResizePatch(block, "w", 8, 0), {
    x: 28, y: 25, w: 22, h: 20
  });
  assert.deepEqual(getInvoiceBlockResizePatch(block, "n", 0, 5), {
    x: 20, y: 30, w: 30, h: 15
  });
});

test("corner handles resize both axes together", () => {
  assert.deepEqual(getInvoiceBlockResizePatch(block, "nw", 4, 3), {
    x: 24, y: 28, w: 26, h: 17
  });
  assert.deepEqual(getInvoiceBlockResizePatch(block, "se", 4, 3), {
    x: 20, y: 25, w: 34, h: 23
  });
});

test("resize handles keep every edge inside the page", () => {
  assert.deepEqual(getInvoiceBlockResizePatch(
    { x: 4, y: 5, w: 20, h: 20 }, "nw", -20, -20
  ), { x: 0, y: 0, w: 24, h: 25 });
  assert.deepEqual(getInvoiceBlockResizePatch(
    { x: 75, y: 80, w: 20, h: 18 }, "se", 30, 30
  ), { x: 75, y: 80, w: 25, h: 20 });
});

test("resize handles enforce minimum sizes without moving the fixed edge", () => {
  assert.deepEqual(getInvoiceBlockResizePatch(block, "w", 100, 0), {
    x: 47, y: 25, w: 3, h: 20
  });
  assert.deepEqual(getInvoiceBlockResizePatch(block, "n", 0, 100), {
    x: 20, y: 43, w: 30, h: 2
  });
  assert.deepEqual(getInvoiceBlockResizePatch(block, "e", -100, -100), {
    x: 20, y: 25, w: 3, h: 20
  });
});

test("invalid resize handles return no change", () => {
  assert.equal(getInvoiceBlockResizePatch(block, "middle", 5, 5), null);
  assert.equal(getInvoiceBlockResizePatch(null, "se", 5, 5), null);
});
