/**
 * Conservative pagination hints for the invoice print preview.
 * These checks are advisory only: they never move rows or alter invoice data.
 */
const CLOSING_FIELD_KEYS = new Set(["amount_words", "amount_paid", "balance_due", "bank_details", "terms", "signature"]);

function getBlockBounds(block) {
  const bounds = block?.bounds || {};
  const rect = {
    left: Number(bounds.left),
    top: Number(bounds.top),
    right: Number(bounds.right),
    bottom: Number(bounds.bottom)
  };
  return Object.values(rect).every(Number.isFinite) ? rect : null;
}

function isClosingBlock(block) {
  return block?.type === "totals" ||
    (block?.type === "field" && CLOSING_FIELD_KEYS.has(block.fieldKey));
}

function measuredRowHeightMm(row) {
  const directHeight = Number(row?.height);
  if (Number.isFinite(directHeight) && directHeight > 0) return directHeight * 25.4 / 96;
  const top = Number(row?.top);
  const bottom = Number(row?.bottom);
  return Number.isFinite(top) && Number.isFinite(bottom) && bottom > top
    ? (bottom - top) * 25.4 / 96
    : null;
}

export function analyzeInvoicePagination(pages = []) {
  const source = Array.isArray(pages) ? pages : [];
  const normalized = source.map((page, index) => {
    const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
    const tables = blocks.filter(block => block?.type === "items_table");
    return {
      pageNumber: Number(page?.pageNumber) || index + 1,
      blocks,
      tables,
      closingOnly: Boolean(page?.closingOnly),
      itemCapacityMm: Number.isFinite(Number(page?.itemCapacityMm)) ? Number(page.itemCapacityMm) : null,
      reservedClosingSpaceMm: Math.max(0, Number(page?.reservedClosingSpaceMm) || 0),
      rows: tables.flatMap(table => Array.isArray(table.rows) ? table.rows : [])
    };
  });
  const warnings = [];

  // A single-row page is only considered an orphan when it is genuinely
  // between two populated item pages; first and last pages are valid cases.
  normalized.forEach((page, index) => {
    if (page.rows.length !== 1 || index === 0 || index === normalized.length - 1) return;
    if (!normalized[index - 1].rows.length || !normalized[index + 1].rows.length) return;
    const row = page.rows[0];
    warnings.push({
      id: "single-item-page-" + page.pageNumber,
      severity: "warning",
      title: "A page contains only one invoice item",
      detail: "Page " + page.pageNumber + " contains a single item row between populated item-table pages. Consider adjusting the table height or spacing if the invoice layout allows.",
      pageNumber: page.pageNumber,
      itemNumber: Number(row.itemNumber) || null,
      fixable: false
    });
  });

  normalized.filter(page => page.closingOnly).forEach(page => {
    warnings.push({
      id: "closing-only-page-" + page.pageNumber,
      severity: "warning",
      title: "Closing details need their own page",
      detail: "A totals or closing section overlaps the item-table area. The print layout has kept every item row intact and placed the closing details on a separate final page. Move the closing elements below the item table to reduce the page count.",
      pageNumber: page.pageNumber,
      fixable: false
    });
  });

  // Totals should normally follow the final item row. Do not auto-move them:
  // free-positioned templates may intentionally place summaries elsewhere.
  let finalItemPageIndex = -1;
  normalized.forEach((page, index) => {
    if (page.rows.length) finalItemPageIndex = index;
  });
  if (finalItemPageIndex > 0) {
    normalized.slice(0, finalItemPageIndex).forEach(page => {
      page.blocks.filter(block => block?.type === "totals").forEach(block => {
        warnings.push({
          id: "totals-before-final-items-" + page.pageNumber + "-" + (block.id || "totals"),
          severity: "warning",
          title: "Invoice totals appear before the final item page",
          detail: "The totals section appears on page " + page.pageNumber + " while item rows continue on page " + normalized[finalItemPageIndex].pageNumber + ". Move the totals section after the final item table page so customers see the complete item list before the amount summary.",
          pageNumber: page.pageNumber,
          blockId: block.id,
          blockType: block.type,
          fixable: false
        });
      });
    });
  }

  // Warn when closing areas physically collide. The user remains in control
  // of all element positions; the builder never repositions custom content.
  normalized.forEach(page => {
    const closingBlocks = page.blocks.filter(isClosingBlock).map(block => ({
      block,
      bounds: getBlockBounds(block)
    })).filter(item => item.bounds);
    for (let first = 0; first < closingBlocks.length; first += 1) {
      for (let second = first + 1; second < closingBlocks.length; second += 1) {
        const a = closingBlocks[first];
        const b = closingBlocks[second];
        const overlapWidth = Math.min(a.bounds.right, b.bounds.right) - Math.max(a.bounds.left, b.bounds.left);
        const overlapHeight = Math.min(a.bounds.bottom, b.bounds.bottom) - Math.max(a.bounds.top, b.bounds.top);
        if (overlapWidth <= 2 || overlapHeight <= 2) continue;
        const firstName = a.block.label || a.block.fieldKey?.replace(/_/g, " ") || "Totals";
        const secondName = b.block.label || b.block.fieldKey?.replace(/_/g, " ") || "Closing detail";
        warnings.push({
          id: "closing-block-overlap-" + page.pageNumber + "-" + (a.block.id || first) + "-" + (b.block.id || second),
          severity: "error",
          title: "Invoice closing sections overlap",
          detail: firstName + " overlaps " + secondName + " on page " + page.pageNumber + ". Move one of these elements so the amount and payment details remain readable.",
          pageNumber: page.pageNumber,
          blockId: a.block.id,
          relatedBlockId: b.block.id,
          blockType: a.block.type,
          fixable: false
        });
      }
    }
  });

  // Compare actual rendered row heights, not estimates. If the previous
  // page's last row can fit in the final page's measured spare capacity,
  // highlight a potential opportunity to reduce empty space.
  if (finalItemPageIndex > 0) {
    const finalPage = normalized[finalItemPageIndex];
    let previousItemPageIndex = finalItemPageIndex - 1;
    while (previousItemPageIndex >= 0 && !normalized[previousItemPageIndex].rows.length) {
      previousItemPageIndex -= 1;
    }
    const previousPage = normalized[previousItemPageIndex];
    if (finalPage && previousPage && finalPage.itemCapacityMm !== null && previousPage.rows.length > 1) {
      const finalHeights = finalPage.rows.map(measuredRowHeightMm);
      const previousLastRowHeight = measuredRowHeightMm(previousPage.rows[previousPage.rows.length - 1]);
      if (finalHeights.every(height => Number.isFinite(height)) && Number.isFinite(previousLastRowHeight)) {
        const renderedFinalHeight = finalHeights.reduce((sum, height) => sum + height, 0);
        const unusedCapacityMm = finalPage.itemCapacityMm - renderedFinalHeight;
        if (unusedCapacityMm >= previousLastRowHeight + 1.5) {
          const table = finalPage.tables[0];
          const candidateRow = previousPage.rows[previousPage.rows.length - 1];
          warnings.push({
            id: "final-page-unused-capacity-" + finalPage.pageNumber,
            severity: "warning",
            title: "The final page may have room for another item",
            detail: "Page " + finalPage.pageNumber + " has about " + unusedCapacityMm.toFixed(1) + " mm of measured item space left. The last row on page " + previousPage.pageNumber + " measures " + previousLastRowHeight.toFixed(1) + " mm and may fit here. Review the preview before changing the table height or spacing.",
            pageNumber: finalPage.pageNumber,
            previousItemPageNumber: previousPage.pageNumber,
            itemNumber: Number(candidateRow.itemNumber) || null,
            blockId: table?.id,
            blockType: table?.type || "items_table",
            unusedCapacityMm: Number(unusedCapacityMm.toFixed(2)),
            candidateRowHeightMm: Number(previousLastRowHeight.toFixed(2)),
            fixable: false
          });
        }
      }
    }
  }

  // Also catch a totals block that physically starts before the final item row
  // on the same page. This is a measurement-only warning, never a calculation.
  normalized.forEach(page => {
    const rowRects = page.rows.map(row => ({
      left: Number(row.left), top: Number(row.top),
      right: Number(row.right), bottom: Number(row.bottom)
    })).filter(rect => Object.values(rect).every(Number.isFinite));
    if (!rowRects.length) return;
    page.blocks.filter(block => block?.type === "totals").forEach(block => {
      const totals = block.bounds || {};
      const bounds = {
        left: Number(totals.left), top: Number(totals.top),
        right: Number(totals.right), bottom: Number(totals.bottom)
      };
      if (!Object.values(bounds).every(Number.isFinite)) return;
      const overlapsItem = rowRects.some(row =>
        row.left < bounds.right - 2 && row.right > bounds.left + 2 &&
        row.top < bounds.bottom - 2 && row.bottom > bounds.top + 2
      );
      if (!overlapsItem) return;
      warnings.push({
        id: "totals-overlap-items-" + page.pageNumber + "-" + (block.id || "totals"),
        severity: "error",
        title: "The totals section overlaps invoice items",
        detail: "The totals section physically overlaps an item row on page " + page.pageNumber + ". Reposition the totals section so it does not cover item content, then review the print preview.",
        pageNumber: page.pageNumber,
        blockId: block.id,
        blockType: block.type,
        fixable: false
      });
    });
  });

  return warnings;
}
