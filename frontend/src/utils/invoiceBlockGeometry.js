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

export { getInvoiceBlockResizePatch, getInvoiceBlockAlignmentPatch };
