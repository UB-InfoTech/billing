const RESIZE_DIRECTIONS = new Set(["nw", "n", "ne", "e", "se", "s", "sw", "w"]);

const toFiniteNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Place a block against one page edge or in the centre of one axis.
 * The element's size and its other axis are kept unchanged.
 */
function getInvoiceBlockAlignmentPatch(block, alignment) {
  if (!block) return null;

  const width = clamp(toFiniteNumber(block.w, 0), 0, 100);
  const height = clamp(toFiniteNumber(block.h, 0), 0, 100);

  if (alignment === "left") return { x: 0 };
  if (alignment === "center") return { x: (100 - width) / 2 };
  if (alignment === "right") return { x: 100 - width };
  if (alignment === "top") return { y: 0 };
  if (alignment === "middle") return { y: (100 - height) / 2 };
  if (alignment === "bottom") return { y: 100 - height };
  return null;
}

/**
 * Return a safe percentage-based geometry patch for resizing one invoice block.
 * The opposite edge stays fixed when resizing from the north or west.
 */
function getInvoiceBlockResizePatch(block, handle, deltaX = 0, deltaY = 0) {
  if (!block || !RESIZE_DIRECTIONS.has(handle)) return null;

  const minWidth = 3;
  const minHeight = 2;
  const x = clamp(toFiniteNumber(block.x, 0), 0, 100 - minWidth);
  const y = clamp(toFiniteNumber(block.y, 0), 0, 100 - minHeight);
  const width = clamp(toFiniteNumber(block.w, minWidth), minWidth, 100 - x);
  const height = clamp(toFiniteNumber(block.h, minHeight), minHeight, 100 - y);
  const dx = toFiniteNumber(deltaX, 0);
  const dy = toFiniteNumber(deltaY, 0);
  const right = x + width;
  const bottom = y + height;

  let nextX = x;
  let nextY = y;
  let nextWidth = width;
  let nextHeight = height;

  if (handle.includes("w")) {
    nextX = clamp(x + dx, 0, right - minWidth);
    nextWidth = right - nextX;
  } else if (handle.includes("e")) {
    nextWidth = clamp(width + dx, minWidth, 100 - x);
  }

  if (handle.includes("n")) {
    nextY = clamp(y + dy, 0, bottom - minHeight);
    nextHeight = bottom - nextY;
  } else if (handle.includes("s")) {
    nextHeight = clamp(height + dy, minHeight, 100 - y);
  }

  return { x: nextX, y: nextY, w: nextWidth, h: nextHeight };
}


/**
 * Align a group by its collective outer edges or collective centre line.
 * Returns one position patch per selected block; sizes remain unchanged.
 */
function getInvoiceGroupAlignmentPatches(blocks, alignment) {
  if (!Array.isArray(blocks) || blocks.length < 2) return [];
  const items = blocks.filter(block => block && block.id).map(block => ({
    id: block.id,
    x: toFiniteNumber(block.x, 0),
    y: toFiniteNumber(block.y, 0),
    w: Math.max(0, toFiniteNumber(block.w, 0)),
    h: Math.max(0, toFiniteNumber(block.h, 0))
  }));
  if (items.length < 2) return [];

  if (["left", "center", "right"].includes(alignment)) {
    const left = Math.min(...items.map(item => item.x));
    const right = Math.max(...items.map(item => item.x + item.w));
    return items.map(item => ({
      id: item.id,
      x: alignment === "left" ? left
        : alignment === "center" ? (left + right - item.w) / 2
          : right - item.w
    }));
  }
  if (["top", "middle", "bottom"].includes(alignment)) {
    const top = Math.min(...items.map(item => item.y));
    const bottom = Math.max(...items.map(item => item.y + item.h));
    return items.map(item => ({
      id: item.id,
      y: alignment === "top" ? top
        : alignment === "middle" ? (top + bottom - item.h) / 2
          : bottom - item.h
    }));
  }
  return [];
}

/**
 * Evenly distribute at least three blocks by the clear gap between them.
 * The first and last blocks stay fixed; overlapping layouts are left unchanged.
 */
function getInvoiceGroupDistributionPatches(blocks, axis = "horizontal") {
  if (!Array.isArray(blocks) || blocks.length < 3) return [];
  if (axis !== "horizontal" && axis !== "vertical") return [];

  const horizontal = axis === "horizontal";
  const items = blocks.filter(block => block && block.id).map((block, index) => ({
    id: block.id,
    start: toFiniteNumber(horizontal ? block.x : block.y, 0),
    size: Math.max(0, toFiniteNumber(horizontal ? block.w : block.h, 0)),
    index
  })).sort((a, b) => a.start - b.start || a.index - b.index);
  if (items.length < 3) return [];

  const start = items[0].start;
  const end = items[items.length - 1].start + items[items.length - 1].size;
  const totalSize = items.reduce((sum, item) => sum + item.size, 0);
  const gap = (end - start - totalSize) / (items.length - 1);
  if (!Number.isFinite(gap) || gap < -0.000001) return [];

  let cursor = start;
  return items.map(item => {
    const patch = horizontal ? { id: item.id, x: cursor } : { id: item.id, y: cursor };
    cursor += item.size + gap;
    return patch;
  });
}

/**
 * Move a selected group by one shared delta while keeping its outer bounds on-page.
 */
function getInvoiceGroupMovePatches(blocks, deltaX = 0, deltaY = 0) {
  if (!Array.isArray(blocks) || !blocks.length) return [];
  const items = blocks.filter(block => block && block.id).map(block => ({
    id: block.id,
    x: toFiniteNumber(block.x, 0),
    y: toFiniteNumber(block.y, 0),
    w: Math.max(0, toFiniteNumber(block.w, 0)),
    h: Math.max(0, toFiniteNumber(block.h, 0))
  }));
  if (!items.length) return [];

  const left = Math.min(...items.map(item => item.x));
  const top = Math.min(...items.map(item => item.y));
  const right = Math.max(...items.map(item => item.x + item.w));
  const bottom = Math.max(...items.map(item => item.y + item.h));
  const dx = clamp(toFiniteNumber(deltaX, 0), -left, 100 - right);
  const dy = clamp(toFiniteNumber(deltaY, 0), -top, 100 - bottom);

  return items.map(item => ({ id: item.id, x: item.x + dx, y: item.y + dy }));
}

/**
 * Find visible invoice elements intersected by a percentage-based canvas selection.
 * Edge-only contact is not treated as a selection.
 */
function getInvoiceMarqueeSelection(blocks, selection) {
  if (!Array.isArray(blocks) || !selection) return [];

  const x = toFiniteNumber(selection.x, NaN);
  const y = toFiniteNumber(selection.y, NaN);
  const width = toFiniteNumber(selection.w, NaN);
  const height = toFiniteNumber(selection.h, NaN);
  if (![x, y, width, height].every(Number.isFinite) || width === 0 || height === 0) return [];

  const left = Math.min(x, x + width);
  const right = Math.max(x, x + width);
  const top = Math.min(y, y + height);
  const bottom = Math.max(y, y + height);

  return blocks.filter(block => {
    if (!block || !block.id || block.visible === false) return false;
    const blockX = toFiniteNumber(block.x, NaN);
    const blockY = toFiniteNumber(block.y, NaN);
    const blockWidth = toFiniteNumber(block.w, NaN);
    const blockHeight = toFiniteNumber(block.h, NaN);
    if (![blockX, blockY, blockWidth, blockHeight].every(Number.isFinite)) return false;
    if (blockWidth <= 0 || blockHeight <= 0) return false;

    return blockX < right
      && blockX + blockWidth > left
      && blockY < bottom
      && blockY + blockHeight > top;
  }).map(block => block.id);
}


/**
 * Keep the selected-element toolbar readable at every canvas zoom level
 * while keeping it inside the visible page.
 */
function getInvoiceContextToolbarPosition(block, options = {}) {
  if (!block) return null;

  const pageWidth = toFiniteNumber(options.pageWidth, 794);
  const pageHeight = toFiniteNumber(options.pageHeight, 1123);
  const canvasScale = Math.max(0.1, toFiniteNumber(options.scale, 1));
  const toolbarWidth = clamp(toFiniteNumber(options.toolbarWidth, 252), 160, 420);
  const toolbarHeight = clamp(toFiniteNumber(options.toolbarHeight, 44), 36, 100);
  const gap = clamp(toFiniteNumber(options.gap, 8), 0, 24);
  const margin = clamp(toFiniteNumber(options.margin, 4), 0, 20);

  if (pageWidth <= 0 || pageHeight <= 0) return null;

  const visibleWidth = Math.min(toolbarWidth, Math.max(80, pageWidth * canvasScale - margin * 2));
  const localWidth = visibleWidth / canvasScale;
  const localHeight = toolbarHeight / canvasScale;
  const localGap = gap / canvasScale;
  const localMargin = margin / canvasScale;
  const x = clamp(toFiniteNumber(block.x, 0), 0, 100);
  const y = clamp(toFiniteNumber(block.y, 0), 0, 100);
  const height = clamp(toFiniteNumber(block.h, 0), 0, 100);
  const blockTop = y * pageHeight / 100;
  const blockBottom = (y + height) * pageHeight / 100;
  const spaceAbove = blockTop - localMargin;
  const spaceBelow = pageHeight - blockBottom - localMargin;
  const placement = spaceAbove >= localHeight + localGap || spaceAbove >= spaceBelow
    ? "above"
    : "below";

  const maxLeft = Math.max(localMargin, pageWidth - localWidth - localMargin);
  const left = clamp(x * pageWidth / 100, localMargin, maxLeft);
  const maxTop = Math.max(localMargin, pageHeight - localHeight - localMargin);
  const requestedTop = placement === "above"
    ? blockTop - localHeight - localGap
    : blockBottom + localGap;
  const top = clamp(requestedTop, localMargin, maxTop);

  return {
    left,
    top,
    width: localWidth,
    scale: 1 / canvasScale,
    placement
  };
}

export { getInvoiceBlockResizePatch, getInvoiceBlockAlignmentPatch, getInvoiceContextToolbarPosition, getInvoiceGroupAlignmentPatches, getInvoiceGroupDistributionPatches, getInvoiceGroupMovePatches, getInvoiceMarqueeSelection };
