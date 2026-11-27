export function buildInvoicePageNavigation(pageLayouts = [], warnings = []) {
  const pages = Array.isArray(pageLayouts) ? pageLayouts : [];
  const issues = Array.isArray(warnings) ? warnings : [];

  return pages.map((page, index) => {
    const pageNumber = Number(page?.pageNumber) > 0 ? Number(page.pageNumber) : index + 1;
    const pageIssues = issues.filter(issue => Number(issue?.pageNumber) === pageNumber);
    const errorCount = pageIssues.filter(issue => issue?.severity === "error").length;
    const warningCount = pageIssues.length - errorCount;

    return {
      pageNumber,
      itemCount: Math.max(0, Number(page?.itemCount) || 0),
      closingOnly: Boolean(page?.closingOnly),
      reservedClosingSpaceMm: Math.max(0, Number(page?.reservedClosingSpaceMm) || 0),
      itemCapacityMm: Number.isFinite(Number(page?.itemCapacityMm)) ? Number(page.itemCapacityMm) : null,
      renderedItemHeightMm: Number.isFinite(Number(page?.renderedItemHeightMm)) ? Number(page.renderedItemHeightMm) : null,
      itemSpaceUsedPercent: Number.isFinite(Number(page?.itemSpaceUsedPercent)) ? Number(page.itemSpaceUsedPercent) : null,
      errorCount,
      warningCount,
      issueCount: pageIssues.length
    };
  });
}
