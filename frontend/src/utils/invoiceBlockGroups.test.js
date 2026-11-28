import test from "node:test";
import assert from "node:assert/strict";
import {
  getInvoiceBlockGroupMemberIds,
  assignInvoiceBlockGroup,
  expandInvoiceBlockGroupSelection,
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
