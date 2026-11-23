/**
 * Conservative pagination hints for the invoice print preview.
 * This is advisory only: it never moves rows or alters invoice data.
 */
export function analyzeInvoicePagination(pages = []) {
  const warnings = [];
  const normalized = (Array.isArray(pages) ? pages : []).map((page, index) => ({
    pageNumber: Number(page?.pageNumber) || index + 1,
    rows: (Array.isArray(page?.blocks) ? page.blocks : [])
      .filter(block => block?.type === "items_table")
      .flatMap(block => Array.isArray(block.rows) ? block.rows : [])
  }));
  normalized.forEach((page, index) => {
    if (page.rows.length !== 1 || normalized.length < 2) return;
    const previousHasItems = normalized[index - 1]?.rows.length > 0;
    const nextHasItems = normalized[index + 1]?.rows.length > 0;
    if (!previousHasItems || !nextHasItems) return;
    const row = page.rows[0];
    warnings.push({
      id: "single-item-page-" + page.pageNumber,
      severity: "warning",
      title: "A page contains only one invoice item",
      detail: "Page " + page.pageNumber + " contains a single item row between item-table pages. Consider adjusting the table height or spacing to avoid an isolated row, if the invoice layout allows.",
      pageNumber: page.pageNumber,
      itemNumber: Number(row.itemNumber) || null,
      fixable: false
    });
  });
  return warnings;
}
