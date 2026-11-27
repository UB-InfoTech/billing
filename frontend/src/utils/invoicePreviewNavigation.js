export function buildInvoicePageNavigation(pageLayouts = [], warnings = []) {
  const pages = Array.isArray(pageLayouts) ? pageLayouts : [];
  const issues = Array.isArray(warnings) ? warnings : [];

  return pages.map((page, index) => {
    const pageNumber = Number(page?.pageNumber) > 0 ? Number(page.pageNumber) : index + 1;
    const pageIssues = issues.filter(issue => Number(issue?.pageNumber) === pageNumber);
    const errorCount = pageIssues.filter(issue => issue?.severity === "error").length;
    const warningCount = pageIssues.length - errorCount;

    const itemCapacityMm = page?.itemCapacityMm === null || page?.itemCapacityMm === undefined
      ? null : Number(page.itemCapacityMm);
    const renderedItemHeightMm = page?.renderedItemHeightMm === null || page?.renderedItemHeightMm === undefined
      ? null : Number(page.renderedItemHeightMm);
    const itemSpaceUsedPercent = page?.itemSpaceUsedPercent === null || page?.itemSpaceUsedPercent === undefined
      ? null : Number(page.itemSpaceUsedPercent);

    return {
      pageNumber,
      itemCount: Math.max(0, Number(page?.itemCount) || 0),
      closingOnly: Boolean(page?.closingOnly),
      reservedClosingSpaceMm: Math.max(0, Number(page?.reservedClosingSpaceMm) || 0),
      itemCapacityMm: Number.isFinite(itemCapacityMm) ? itemCapacityMm : null,
      renderedItemHeightMm: Number.isFinite(renderedItemHeightMm) ? renderedItemHeightMm : null,
      itemSpaceUsedPercent: Number.isFinite(itemSpaceUsedPercent) ? itemSpaceUsedPercent : null,
      errorCount,
      warningCount,
      issueCount: pageIssues.length
    };
  });
}
