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
    const rowBottoms = page.rows
      .map(row => Number(row.bottom))
      .filter(value => Number.isFinite(value) && value > 0);
    if (!rowBottoms.length) return;
    const lastRowBottom = Math.max(...rowBottoms);
    page.blocks.filter(block => block?.type === "totals").forEach(block => {
      const totalsTop = Number(block.bounds?.top);
      if (!Number.isFinite(totalsTop) || totalsTop + 2 >= lastRowBottom) return;
      warnings.push({
        id: "totals-overlap-items-" + page.pageNumber + "-" + (block.id || "totals"),
        severity: "error",
        title: "The totals section overlaps invoice items",
        detail: "The totals section begins before the last item row ends on page " + page.pageNumber + ". Reposition the totals section below the item table and review the print preview.",
        pageNumber: page.pageNumber,
        blockId: block.id,
        blockType: block.type,
        fixable: false
      });
    });
  });

  return warnings;
}
