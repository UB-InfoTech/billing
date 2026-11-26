/**
 * Conservative pagination hints for the invoice print preview.
 * These checks are advisory only: they never move rows or alter invoice data.
 */
export function analyzeInvoicePagination(pages = []) {
  const source = Array.isArray(pages) ? pages : [];
  const normalized = source.map((page, index) => {
    const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
    const tables = blocks.filter(block => block?.type === "items_table");
    return {
      pageNumber: Number(page?.pageNumber) || index + 1,
      blocks,
      closingOnly: Boolean(page?.closingOnly),
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
