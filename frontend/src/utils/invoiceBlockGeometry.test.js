import test from "node:test";
import assert from "node:assert/strict";
import { getInvoiceBlockResizePatch, getInvoiceBlockAlignmentPatch, getInvoiceContextToolbarPosition, getInvoiceGroupAlignmentPatches, getInvoiceGroupDistributionPatches, getInvoiceGroupMovePatches, getInvoiceGroupResizePatches, getInvoiceGroupSnapMove, getInvoiceMarqueeSelection } from "./invoiceBlockGeometry.js";

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

const positionedBlock = { x: 20, y: 25, w: 30, h: 20 };

test("page alignment positions an element without changing its size or other axis", () => {
  assert.deepEqual(getInvoiceBlockAlignmentPatch(positionedBlock, "left"), { x: 0 });
  assert.deepEqual(getInvoiceBlockAlignmentPatch(positionedBlock, "center"), { x: 35 });
  assert.deepEqual(getInvoiceBlockAlignmentPatch(positionedBlock, "right"), { x: 70 });
  assert.deepEqual(getInvoiceBlockAlignmentPatch(positionedBlock, "top"), { y: 0 });
  assert.deepEqual(getInvoiceBlockAlignmentPatch(positionedBlock, "middle"), { y: 40 });
  assert.deepEqual(getInvoiceBlockAlignmentPatch(positionedBlock, "bottom"), { y: 80 });
});

test("page alignment safely handles elements as large as the available page", () => {
  assert.deepEqual(
    getInvoiceBlockAlignmentPatch({ x: 12, y: 8, w: 100, h: 100 }, "right"),
    { x: 0 }
  );
  assert.deepEqual(
    getInvoiceBlockAlignmentPatch({ x: 12, y: 8, w: 20, h: 100 }, "bottom"),
    { y: 0 }
  );
});

test("unsupported page alignments and missing elements return no change", () => {
  assert.equal(getInvoiceBlockAlignmentPatch(positionedBlock, "diagonal"), null);
  assert.equal(getInvoiceBlockAlignmentPatch(null, "center"), null);
});

const arrangedBlocks = [
  { id: "a", x: 10, y: 12, w: 10, h: 8 },
  { id: "b", x: 35, y: 30, w: 20, h: 10 },
  { id: "c", x: 70, y: 45, w: 15, h: 12 }
];

test("group alignment shares collective edges and centre lines without changing sizes", () => {
  assert.deepEqual(
    getInvoiceGroupAlignmentPatches(arrangedBlocks, "left"),
    [{ id: "a", x: 10 }, { id: "b", x: 10 }, { id: "c", x: 10 }]
  );
  assert.deepEqual(
    getInvoiceGroupAlignmentPatches(arrangedBlocks, "right"),
    [{ id: "a", x: 75 }, { id: "b", x: 65 }, { id: "c", x: 70 }]
  );
  assert.deepEqual(
    getInvoiceGroupAlignmentPatches(arrangedBlocks, "middle"),
    [{ id: "a", y: 30.5 }, { id: "b", y: 29.5 }, { id: "c", y: 28.5 }]
  );
  assert.deepEqual(getInvoiceGroupAlignmentPatches(arrangedBlocks, "diagonal"), []);
});

test("group distribution uses equal clear gaps and keeps the outer elements fixed", () => {
  assert.deepEqual(
    getInvoiceGroupDistributionPatches(arrangedBlocks, "horizontal"),
    [{ id: "a", x: 10 }, { id: "b", x: 35 }, { id: "c", x: 70 }]
  );
  assert.deepEqual(
    getInvoiceGroupDistributionPatches(arrangedBlocks, "vertical"),
    [{ id: "a", y: 12 }, { id: "b", y: 27.5 }, { id: "c", y: 45 }]
  );
});

test("group distribution refuses too few or overlapping blocks", () => {
  assert.deepEqual(getInvoiceGroupDistributionPatches(arrangedBlocks.slice(0, 2), "horizontal"), []);
  assert.deepEqual(getInvoiceGroupDistributionPatches([
    { id: "a", x: 0, w: 25 }, { id: "b", x: 10, w: 25 }, { id: "c", x: 20, w: 25 }
  ], "horizontal"), []);
});

test("group movement preserves relative spacing and clamps the group to page bounds", () => {
  assert.deepEqual(
    getInvoiceGroupMovePatches(arrangedBlocks, 5, -4),
    [
      { id: "a", x: 15, y: 8 },
      { id: "b", x: 40, y: 26 },
      { id: "c", x: 75, y: 41 }
    ]
  );
  assert.deepEqual(
    getInvoiceGroupMovePatches([
      { id: "a", x: 8, y: 10, w: 30, h: 20 },
      { id: "b", x: 60, y: 40, w: 35, h: 30 }
    ], 20, 20),
    [
      { id: "a", x: 13, y: 30 },
      { id: "b", x: 65, y: 60 }
    ]
  );
});


const marqueeBlocks = [
  { id: "left", x: 10, y: 10, w: 12, h: 12 },
  { id: "overlap", x: 20, y: 18, w: 12, h: 12 },
  { id: "edge-touch", x: 32, y: 12, w: 10, h: 10 },
  { id: "hidden", x: 18, y: 15, w: 10, h: 10, visible: false },
  { id: "outside", x: 60, y: 60, w: 10, h: 10 }
];

test("marquee selection finds visible elements that overlap the selection area", () => {
  assert.deepEqual(
    getInvoiceMarqueeSelection(marqueeBlocks, { x: 15, y: 12, w: 17, h: 18 }),
    ["left", "overlap"]
  );
});

test("marquee selection works in either drag direction and ignores edge-only contact", () => {
  assert.deepEqual(
    getInvoiceMarqueeSelection(marqueeBlocks, { x: 32, y: 30, w: -17, h: -18 }),
    ["left", "overlap"]
  );
  assert.deepEqual(
    getInvoiceMarqueeSelection(marqueeBlocks, { x: 22, y: 10, w: 10, h: 20 }),
    ["overlap"]
  );
});

test("marquee selection ignores zero-area, invalid and hidden elements", () => {
  assert.deepEqual(getInvoiceMarqueeSelection(marqueeBlocks, { x: 10, y: 10, w: 0, h: 20 }), []);
  assert.deepEqual(getInvoiceMarqueeSelection(marqueeBlocks, { x: 10, y: 10, w: 20, h: 0 }), []);
  assert.deepEqual(getInvoiceMarqueeSelection([
    { id: "bad-size", x: 10, y: 10, w: 0, h: 5 },
    { id: "bad-position", x: "nope", y: 10, w: 5, h: 5 }
  ], { x: 0, y: 0, w: 100, h: 100 }), []);
});


test("context toolbar stays within the page and remains readable at mobile canvas zoom", () => {
  const position = getInvoiceContextToolbarPosition(
    { x: 92, y: 1, w: 6, h: 5 },
    { pageWidth: 794, pageHeight: 1123, scale: 0.5 }
  );

  assert.equal(position.placement, "below");
  assert.equal(position.scale, 2);
  assert.ok(position.left >= 0);
  assert.ok(position.left + position.width <= 794);
  assert.ok(position.top > 0);
});

test("context toolbar moves above elements near the bottom edge", () => {
  const position = getInvoiceContextToolbarPosition(
    { x: 20, y: 94, w: 30, h: 5 },
    { pageWidth: 794, pageHeight: 1123, scale: 0.75 }
  );

  assert.equal(position.placement, "above");
  assert.ok(position.top + 44 / 0.75 <= 1123);
});

test("context toolbar returns null for missing blocks or invalid page dimensions", () => {
  assert.equal(getInvoiceContextToolbarPosition(null), null);
  assert.equal(getInvoiceContextToolbarPosition({ x: 0, y: 0 }, { pageWidth: 0 }), null);
});


test("context toolbar anchors to the full visible multi-selection bounds", () => {
  const selection = [
    { id: "first", x: 12, y: 1, w: 15, h: 8 },
    { id: "second", x: 72, y: 35, w: 18, h: 12 },
    { id: "hidden", x: 0, y: 92, w: 12, h: 5, visible: false }
  ];
  const position = getInvoiceContextToolbarPosition(selection, {
    pageWidth: 794,
    pageHeight: 1123,
    scale: 0.6,
    toolbarWidth: 280
  });

  assert.equal(position.left, 12 * 794 / 100);
  assert.equal(position.placement, "below");
  assert.ok(position.top >= (35 + 12) * 1123 / 100);
});

test("context toolbar returns null when a multi-selection has no visible elements", () => {
  assert.equal(getInvoiceContextToolbarPosition([
    { id: "hidden-a", visible: false },
    { id: "hidden-b", visible: false }
  ]), null);
});


const resizableSelection = [
  { id: "title", x: 10, y: 10, w: 20, h: 8 },
  { id: "logo", x: 40, y: 20, w: 10, h: 12 }
];

test("multi-resize scales every selected element together from the opposite corner", () => {
  const patches = getInvoiceGroupResizePatches(resizableSelection, "se", 10, 8);
  assert.equal(patches.length, 2);
  assert.equal(patches[0].x, 10);
  assert.equal(patches[0].y, 10);
  assert.equal(patches[0].w, 25);
  assert.ok(Math.abs(patches[0].h - (8 * 30 / 22)) < 0.000001);
  assert.equal(patches[1].x, 47.5);
  assert.ok(Math.abs(patches[1].y - (10 + 10 * 30 / 22)) < 0.000001);
});

test("multi-resize keeps opposite edges fixed and enforces minimum element sizes", () => {
  const patches = getInvoiceGroupResizePatches(resizableSelection, "nw", 100, 100);
  assert.equal(patches.length, 2);
  assert.ok(Math.abs(Math.max(...patches.map(item => item.x + item.w)) - 50) < 0.000001);
  assert.ok(Math.abs(Math.max(...patches.map(item => item.y + item.h)) - 32) < 0.000001);
  assert.ok(patches.every(item => item.w >= 3 && item.h >= 2));
});

test("multi-resize keeps the selection within page bounds", () => {
  const patches = getInvoiceGroupResizePatches(resizableSelection, "se", 100, 100);
  assert.ok(patches.every(item => item.x >= 0 && item.y >= 0));
  assert.ok(patches.every(item => item.x + item.w <= 100.000001));
  assert.ok(patches.every(item => item.y + item.h <= 100.000001));
});

test("multi-resize ignores invalid handles and incomplete selections", () => {
  assert.deepEqual(getInvoiceGroupResizePatches(resizableSelection.slice(0, 1), "se", 5, 5), []);
  assert.deepEqual(getInvoiceGroupResizePatches(resizableSelection, "move", 5, 5), []);
});

test("group movement snaps the outer selection to nearby unselected elements", () => {
  const selection = [
    { id: "a", x: 10, y: 10, w: 12, h: 8 },
    { id: "b", x: 25, y: 20, w: 5, h: 8 }
  ];
  const external = [...selection, { id: "target", x: 36, y: 10, w: 10, h: 10 }];
  const snapped = getInvoiceGroupSnapMove(selection, external, 5, 0);
  assert.equal(snapped.deltaX, 6);
  assert.deepEqual(snapped.guides.vertical, [36]);
  assert.deepEqual(snapped.guides.horizontal, [10]);
});

test("group snapping ignores selected, hidden and invalid external elements", () => {
  const selection = [
    { id: "a", x: 10, y: 10, w: 10, h: 10 },
    { id: "b", x: 30, y: 30, w: 10, h: 10 }
  ];
  const snapped = getInvoiceGroupSnapMove(selection, [
    ...selection,
    { id: "hidden", x: 15, y: 15, w: 10, h: 10, visible: false },
    { id: "invalid", x: "bad", y: 15, w: 10, h: 10 }
  ], 0.5, 0.5);
  assert.equal(snapped.deltaX, 0.5);
  assert.equal(snapped.deltaY, 0.5);
  assert.deepEqual(snapped.guides, { vertical: [], horizontal: [] });
});
