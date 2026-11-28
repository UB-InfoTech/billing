import test from "node:test";
import assert from "node:assert/strict";
import {
  getInvoiceBlockGroupMemberIds,
  assignInvoiceBlockGroup,
  expandInvoiceBlockGroupSelection,
  moveInvoiceLayerStack,
  ungroupInvoiceBlocks
} from "./invoiceBlockGroups.js";

const baseBlocks = [
  { id: "name", type: "field", x: 10, y: 10 },
  { id: "address", type: "field", x: 10, y: 20 },
  { id: "logo", type: "logo", x: 80, y: 5 },
  { id: "hidden", type: "field", visible: false, x: 5, y: 80 }
];

test("assigns persistent group metadata only to the selected elements", () => {
  const grouped = assignInvoiceBlockGroup(baseBlocks, ["name", "address"], "group-1", "Header");
  assert.deepEqual(grouped[0], { ...baseBlocks[0], groupId: "group-1", groupName: "Header" });
  assert.deepEqual(grouped[1], { ...baseBlocks[1], groupId: "group-1", groupName: "Header" });
  assert.equal(grouped[2], baseBlocks[2]);
  assert.equal(grouped[3], baseBlocks[3]);
  assert.equal(baseBlocks[0].groupId, undefined);
});

test("group assignment refuses fewer than two elements or a missing group id", () => {
  assert.equal(assignInvoiceBlockGroup(baseBlocks, ["name"], "group-1", "Header"), baseBlocks);
  assert.equal(assignInvoiceBlockGroup(baseBlocks, ["name", "address"], "", "Header"), baseBlocks);
  const defaultNamed = assignInvoiceBlockGroup(baseBlocks, ["name", "address"], "group-1", "  ");
  assert.equal(defaultNamed[0].groupName, "Saved group");
});

test("group member lookup excludes hidden elements unless explicitly requested", () => {
  const grouped = assignInvoiceBlockGroup(baseBlocks, ["name", "address", "hidden"], "group-1", "Header");
  assert.deepEqual(getInvoiceBlockGroupMemberIds(grouped, "group-1"), ["name", "address"]);
  assert.deepEqual(getInvoiceBlockGroupMemberIds(grouped, "group-1", true), ["name", "address", "hidden"]);
  assert.deepEqual(getInvoiceBlockGroupMemberIds(grouped, "missing"), []);
});

test("ungrouping one selected member releases every member of that saved group", () => {
  const grouped = assignInvoiceBlockGroup(baseBlocks, ["name", "address"], "group-1", "Header");
  const otherGroup = assignInvoiceBlockGroup(grouped, ["logo", "hidden"], "group-2", "Footer");
  const result = ungroupInvoiceBlocks(otherGroup, ["name"]);
  assert.deepEqual(result.affectedIds, ["name", "address"]);
  assert.equal(result.blocks[0].groupId, undefined);
  assert.equal(result.blocks[1].groupName, undefined);
  assert.equal(result.blocks[2].groupId, "group-2");
  assert.equal(result.blocks[3].groupId, "group-2");
});

test("ungrouping an ordinary element leaves the design unchanged", () => {
  const result = ungroupInvoiceBlocks(baseBlocks, ["logo"]);
  assert.equal(result.blocks, baseBlocks);
  assert.deepEqual(result.affectedIds, []);
});


test("selection expands to include every member of any saved group it touches", () => {
  const firstGroup = assignInvoiceBlockGroup(baseBlocks, ["name", "address", "hidden"], "group-1", "Header");
  const secondGroup = assignInvoiceBlockGroup(firstGroup, ["logo"], "group-2", "Brand");
  assert.deepEqual(
    expandInvoiceBlockGroupSelection(secondGroup, ["name"]),
    ["name", "address", "hidden"]
  );
  assert.deepEqual(
    expandInvoiceBlockGroupSelection(secondGroup, ["logo", "address"]),
    ["name", "address", "logo", "hidden"]
  );
});

test("selection expansion preserves ordinary selections and ignores invalid ids", () => {
  assert.deepEqual(expandInvoiceBlockGroupSelection(baseBlocks, ["logo", "missing"]), ["logo"]);
  assert.deepEqual(expandInvoiceBlockGroupSelection(baseBlocks, []), []);
});


test("moves an individual layer to the front or back side of another element", () => {
  const stack = [
    { id: "back" },
    { id: "moving" },
    { id: "target" },
    { id: "front" }
  ];
  const forward = moveInvoiceLayerStack(stack, ["moving"], ["target"], "above");
  assert.equal(forward.changed, true);
  assert.deepEqual(forward.blocks.map(block => block.id), ["back", "target", "moving", "front"]);

  const backward = moveInvoiceLayerStack(stack, ["moving"], ["target"], "below");
  assert.equal(backward.changed, true);
  assert.deepEqual(backward.blocks.map(block => block.id), ["back", "moving", "target", "front"]);
});

test("moves every member of a saved group together without changing its internal stack order", () => {
  const stack = [
    { id: "back" },
    { id: "group-low", groupId: "group-1" },
    { id: "middle" },
    { id: "group-high", groupId: "group-1", visible: false },
    { id: "front" }
  ];
  const moved = moveInvoiceLayerStack(
    stack,
    ["group-low", "group-high"],
    ["front"],
    "above"
  );
  assert.equal(moved.changed, true);
  assert.deepEqual(
    moved.blocks.map(block => block.id),
    ["back", "middle", "front", "group-low", "group-high"]
  );
  assert.equal(moved.blocks[3].groupId, moved.blocks[4].groupId);
});

test("moves an element above or below a target group as a whole", () => {
  const stack = [
    { id: "back" },
    { id: "group-low", groupId: "group-1" },
    { id: "middle" },
    { id: "group-high", groupId: "group-1" },
    { id: "moving" }
  ];
  const below = moveInvoiceLayerStack(stack, ["moving"], ["group-low", "group-high"], "below");
  assert.deepEqual(below.blocks.map(block => block.id), ["back", "moving", "group-low", "middle", "group-high"]);

  const above = moveInvoiceLayerStack(stack, ["moving"], ["group-low", "group-high"], "above");
  assert.deepEqual(above.blocks.map(block => block.id), ["back", "group-low", "middle", "group-high", "moving"]);
});

test("layer movement safely ignores self-drops and invalid targets", () => {
  const stack = [{ id: "one" }, { id: "two" }];
  assert.deepEqual(moveInvoiceLayerStack(stack, ["one"], ["one"], "above"), { blocks: stack, changed: false });
  assert.deepEqual(moveInvoiceLayerStack(stack, ["one"], ["missing"], "below"), { blocks: stack, changed: false });
  assert.deepEqual(moveInvoiceLayerStack(stack, ["missing"], ["two"], "above"), { blocks: stack, changed: false });
  assert.deepEqual(moveInvoiceLayerStack(stack, ["one"], ["two"], "sideways"), { blocks: stack, changed: false });
});
