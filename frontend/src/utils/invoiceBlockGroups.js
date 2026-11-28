function getInvoiceBlockGroupMemberIds(blocks, groupId, includeHidden = false) {
  if (!Array.isArray(blocks) || typeof groupId !== "string" || !groupId.trim()) return [];
  return blocks
    .filter(block => block && block.groupId === groupId && (includeHidden || block.visible !== false))
    .map(block => block.id)
    .filter(Boolean);
}

function assignInvoiceBlockGroup(blocks, blockIds, groupId, groupName = "Saved group") {
  if (!Array.isArray(blocks) || !Array.isArray(blockIds)) return blocks;
  const ids = new Set(blockIds.filter(id => typeof id === "string" && id.trim()));
  const normalizedId = typeof groupId === "string" ? groupId.trim() : "";
  const normalizedName = String(groupName || "Saved group").trim().slice(0, 40) || "Saved group";
  if (ids.size < 2 || !normalizedId) return blocks;

  return blocks.map(block => ids.has(block.id)
    ? { ...block, groupId: normalizedId, groupName: normalizedName }
    : block
  );
}

function expandInvoiceBlockGroupSelection(blocks, selectedBlockIds) {
  if (!Array.isArray(blocks) || !Array.isArray(selectedBlockIds) || !selectedBlockIds.length) return [];
  const selectedIds = new Set(selectedBlockIds);
  const groupIds = new Set(
    blocks
      .filter(block => block && selectedIds.has(block.id) && block.groupId)
      .map(block => block.groupId)
  );
  return blocks
    .filter(block => block && (selectedIds.has(block.id) || (block.groupId && groupIds.has(block.groupId))))
    .map(block => block.id);
}

function ungroupInvoiceBlocks(blocks, selectedBlockIds) {
  if (!Array.isArray(blocks) || !Array.isArray(selectedBlockIds)) {
    return { blocks: Array.isArray(blocks) ? blocks : [], affectedIds: [] };
  }
  const selectedIds = new Set(selectedBlockIds);
  const groupIds = new Set(
    blocks
      .filter(block => block && selectedIds.has(block.id) && block.groupId)
      .map(block => block.groupId)
  );
  if (!groupIds.size) return { blocks, affectedIds: [] };

  const affectedIds = [];
  const nextBlocks = blocks.map(block => {
    if (!block || !groupIds.has(block.groupId)) return block;
    const { groupId, groupName, ...rest } = block;
    affectedIds.push(block.id);
    return rest;
  });
  return { blocks: nextBlocks, affectedIds };
}

export { getInvoiceBlockGroupMemberIds, assignInvoiceBlockGroup, expandInvoiceBlockGroupSelection, ungroupInvoiceBlocks };
