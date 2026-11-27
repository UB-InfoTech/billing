import test from "node:test";
import assert from "node:assert/strict";
import { analyzeInvoiceLayout, applySafeInvoiceLayoutFixes, buildInvoiceLayoutOptimizationSuggestions, buildInvoiceRenderedLayoutOptimizationSuggestions, buildInvoiceLayoutOptimizationPlanPreview, buildInvoiceColumnOptimizationPreview, applyInvoiceLayoutOptimizationSuggestion, applyInvoiceLayoutOptimizationPlan } from "./invoiceLayoutQuality.js";
import { INVOICE_DESIGN_PRESETS, createInvoiceDesignTemplate } from "./invoiceTemplateLibrary.js";
import { analyzeInvoicePagination } from "./invoicePaginationHints.js";
import { analyzeRenderedInvoiceMetrics, measureRenderedInvoiceDocument } from "./invoiceRenderedPrintCheck.js";
import {
  estimateInvoiceTextOverflow,
  getInvoiceMarginWarnings,
  getInvoicePrintGeometry
} from "./invoicePrintFit.js";

test("A4 and A5 geometry respects portrait and landscape orientation", () => {
  assert.deepEqual(
    [getInvoicePrintGeometry("A4", "portrait").widthMm, getInvoicePrintGeometry("A4", "portrait").heightMm],
    [210, 297]
  );
  assert.deepEqual(
    [getInvoicePrintGeometry("A4", "landscape").widthMm, getInvoicePrintGeometry("A4", "landscape").heightMm],
    [297, 210]
  );
  assert.deepEqual(
    [getInvoicePrintGeometry("A5", "portrait").widthMm, getInvoicePrintGeometry("A5", "portrait").heightMm],
    [148, 210]
  );
  assert.deepEqual(
    [getInvoicePrintGeometry("A5", "landscape").widthMm, getInvoicePrintGeometry("A5", "landscape").heightMm],
    [210, 148]
  );
});

test("print geometry clamps margins and keeps a positive content area", () => {
  const geometry = getInvoicePrintGeometry("A5", "portrait", {
    top: -4,
    right: 40,
    bottom: 4,
    left: 4
  });
  assert.deepEqual(geometry.margins, { top: 0, right: 25, bottom: 4, left: 4 });
  assert.ok(geometry.contentWidthMm > 0);
  assert.ok(geometry.contentHeightMm > 0);
});

test("printer-safe margin warning includes a one-click recommendation", () => {
  const warning = getInvoiceMarginWarnings("A4", "portrait", {
    top: 0,
    right: 2,
    bottom: 4,
    left: 4
  }).find(issue => issue.id === "printer-safe-margin");
  assert.ok(warning);
  assert.equal(warning.fixAction, "set-printer-safe-margins");
  assert.deepEqual(warning.recommendedMargins, { top: 4, right: 4, bottom: 4, left: 4 });
});

test("invalid saved margins expose normalized values without changing the design", () => {
  const warning = getInvoiceMarginWarnings("A5", "portrait", {
    top: -2,
    right: 30,
    bottom: "not-a-number",
    left: 4
  }).find(issue => issue.id === "invalid-print-margin");
  assert.ok(warning);
  assert.equal(warning.fixAction, "normalize-print-margins");
  assert.deepEqual(warning.normalizedMargins, { top: 0, right: 25, bottom: 0, left: 4 });
});

test("text overflow offers the largest estimated font size that fits", () => {
  const block = {
    id: "business-address",
    type: "text",
    label: "Business address",
    text: "A very long customer address with multiple descriptive words that should wrap onto several lines",
    x: 0,
    y: 0,
    w: 20,
    h: 4,
    fontSize: 16,
    lineHeight: 1.25,
    letterSpacing: 0,
    padding: 0,
    visible: true
  };
  const [warning] = estimateInvoiceTextOverflow([block], {}, {
    pageSize: "A4",
    orientation: "portrait",
    printMargins: {}
  });
  assert.ok(warning);
  assert.equal(warning.fixAction, "fit-text");
  assert.ok(warning.suggestedFontSize >= 6);
  assert.ok(warning.suggestedFontSize < block.fontSize);
  assert.match(warning.detail, /px is estimated to fit/);
  assert.equal(block.fontSize, 16, "estimation must not mutate the saved design");
});

test("text that cannot fit at the minimum size does not get an unsafe auto-fix", () => {
  const block = {
    id: "long-code",
    type: "text",
    text: "SUPERCALIFRAGILISTICEXPIALIDOCIOUSWITHOUTBREAKS",
    x: 0,
    y: 0,
    w: 2,
    h: 1,
    fontSize: 8,
    padding: 0
  };
  const [warning] = estimateInvoiceTextOverflow([block], {}, {
    pageSize: "A5",
    orientation: "portrait"
  });
  assert.ok(warning);
  assert.equal(warning.suggestedFontSize, null);
  assert.equal(warning.fixAction, undefined);
  assert.match(warning.detail, /Even at the 6 px minimum/);
});

test("hidden and empty text elements do not produce overflow warnings", () => {
  const warnings = estimateInvoiceTextOverflow([
    { id: "hidden", type: "text", text: "Long text", fontSize: 20, w: 1, h: 1, visible: false },
    { id: "empty", type: "text", text: "   ", fontSize: 20, w: 1, h: 1 }
  ], {});
  assert.deepEqual(warnings, []);
});

test("safe layout fixes clamp visible blocks and normalize item columns only", () => {
  const hidden = { id: "hidden", visible: false, x: -10, y: 120, w: 0, h: 0 };
  const source = [
    { id: "outside", type: "field", x: -5, y: 95, w: 20, h: 10 },
    {
      id: "items",
      type: "items_table",
      x: 0,
      y: 0,
      w: 100,
      h: 20,
      columns: [
        { key: "description", width: 70 },
        { key: "amount", width: 70 },
        { key: "hidden", width: 30, visible: false }
      ]
    },
    hidden
  ];
  const result = applySafeInvoiceLayoutFixes(source);
  assert.equal(result.changed, true);
  assert.deepEqual(
    { x: result.blocks[0].x, y: result.blocks[0].y, w: result.blocks[0].w, h: result.blocks[0].h },
    { x: 0, y: 90, w: 20, h: 10 }
  );
  const visibleColumnTotal = result.blocks[1].columns
    .filter(column => column.visible !== false)
    .reduce((sum, column) => sum + column.width, 0);
  assert.ok(Math.abs(visibleColumnTotal - 100) < 0.001);
  assert.equal(result.blocks[2], hidden, "hidden blocks must remain untouched");
  assert.equal(source[0].x, -5, "the original design must not be mutated");
});

test("missing page capacity is not treated as a measured zero", () => {
  const warnings = analyzeInvoicePagination([
    {
      pageNumber: 1,
      blocks: [{ id: "items-1", type: "items_table", rows: [{ itemNumber: 1, height: 20 }, { itemNumber: 2, height: 20 }] }]
    },
    {
      pageNumber: 2,
      blocks: [{ id: "items-2", type: "items_table", rows: [{ itemNumber: 3, height: 20 }] }]
    }
  ]);
  assert.equal(warnings.some(issue => issue.id === "final-page-unused-capacity-2"), false);
});

test("closing-only pages are clearly identified without altering item rows", () => {
  const warnings = analyzeInvoicePagination([
    { pageNumber: 1, blocks: [{ id: "items", type: "items_table", rows: [{ itemNumber: 1 }] }] },
    { pageNumber: 2, closingOnly: true, blocks: [{ id: "totals", type: "totals", bounds: { left: 0, top: 0, right: 100, bottom: 50 } }] }
  ]);
  assert.ok(warnings.some(issue => issue.id === "closing-only-page-2"));
  assert.equal(warnings.some(issue => issue.severity === "error"), false);
});

test("actual print audit blocks output when a page has no measurable dimensions", () => {
  const audit = analyzeRenderedInvoiceMetrics({
    pages: [{ pageNumber: 1, width: 0, height: 0, blocks: [] }]
  }, { pageSize: "A4", orientation: "portrait" });
  assert.equal(audit.hasErrors, true);
  assert.ok(audit.warnings.some(issue => issue.id === "page-geometry-unmeasured-1"));
});

test("actual print audit catches missing item rows and clipped cells", () => {
  const audit = analyzeRenderedInvoiceMetrics({
    pages: [{
      pageNumber: 1,
      width: 793.7,
      height: 1122.5,
      itemCount: 2,
      itemCapacityMm: 100,
      blocks: [{
        id: "items",
        type: "items_table",
        tablePresent: true,
        headerPresent: true,
        headerVisible: true,
        headerDisplay: "table-header-group",
        bounds: { left: 0, top: 0, right: 700, bottom: 500 },
        rows: [{
          itemNumber: 1,
          geometryAvailable: true,
          left: 0,
          top: 20,
          right: 700,
          bottom: 40,
          height: 20,
          cellOverflowAxes: ["width"],
          breakInside: "auto"
        }]
      }]
    }]
  }, { pageSize: "A4", orientation: "portrait" });
  assert.equal(audit.hasErrors, true);
  assert.ok(audit.warnings.some(issue => issue.id === "page-item-count-mismatch-1"));
  assert.ok(audit.warnings.some(issue => issue.id === "item-cell-overflow-1-items-1"));
  assert.ok(audit.warnings.some(issue => issue.id === "item-row-break-1-items-1"));
});

test("actual preview compares measured item height with the planner estimate and reports page usage", () => {
  const audit = analyzeRenderedInvoiceMetrics({
    pages: [{
      pageNumber: 1,
      width: 793.7,
      height: 1122.5,
      itemCount: 2,
      itemCapacityMm: 100,
      estimatedItemRowHeightMm: 10,
      blocks: [{
        id: "items",
        type: "items_table",
        tablePresent: true,
        headerPresent: true,
        headerVisible: true,
        headerDisplay: "table-header-group",
        bounds: { left: 0, top: 0, right: 700, bottom: 600 },
        rows: [
          { itemNumber: 1, geometryAvailable: true, left: 0, top: 20, right: 700, bottom: 50, height: 30, cellOverflowAxes: [] },
          { itemNumber: 2, geometryAvailable: true, left: 0, top: 50, right: 700, bottom: 80, height: 30, cellOverflowAxes: [] }
        ]
      }]
    }]
  }, { pageSize: "A4", orientation: "portrait" });

  const drift = audit.warnings.find(issue => issue.id === "item-row-height-estimate-drift-1-items");
  assert.ok(drift);
  assert.equal(drift.severity, "warning");
  assert.ok(drift.renderedHeightMm > drift.estimatedHeightMm);
  assert.match(drift.detail, /actual preview measurement takes priority/i);
  assert.equal(audit.pageLayouts[0].renderedItemHeightMm, 15.88);
  assert.equal(audit.pageLayouts[0].itemSpaceUsedPercent, 16);
  assert.equal(audit.pageLayouts[0].itemCapacityMm, 100);
});

test("small planner-to-preview height differences do not create noisy warnings", () => {
  const audit = analyzeRenderedInvoiceMetrics({
    pages: [{
      pageNumber: 1,
      width: 793.7,
      height: 1122.5,
      itemCount: 1,
      itemCapacityMm: 100,
      estimatedItemRowHeightMm: 10,
      blocks: [{
        id: "items",
        type: "items_table",
        bounds: { left: 0, top: 0, right: 700, bottom: 500 },
        rows: [{ itemNumber: 1, geometryAvailable: true, left: 0, top: 10, right: 700, bottom: 47, height: 37, cellOverflowAxes: [] }]
      }]
    }]
  }, { pageSize: "A4", orientation: "portrait" });

  assert.equal(audit.warnings.some(issue => issue.id === "item-row-height-estimate-drift-1-items"), false);
});

test("rendered invoice measurements identify each cell's estimated and actual wrapped lines", () => {
  const makeRect = (width, height, top = 0, left = 0) => ({
    left, top, right: left + width, bottom: top + height, width, height
  });
  const textElement = {
    textContent: "A long fabric description that wraps",
    getBoundingClientRect: () => makeRect(120, 36, 20, 20)
  };
  const cell = {
    scrollWidth: 120, clientWidth: 120, scrollHeight: 36, clientHeight: 36,
    getAttribute: name => ({
      "data-column-key": "description",
      "data-column-label": "Description",
      "data-estimated-lines": "1"
    }[name] ?? null),
    querySelector: () => textElement,
    getBoundingClientRect: () => makeRect(130, 40, 18, 15)
  };
  const row = {
    scrollWidth: 130, clientWidth: 130, scrollHeight: 60, clientHeight: 60,
    getAttribute: name => ({
      "data-item-number": "4",
      "data-item-label": "Printed fabric",
      "data-estimated-height-mm": "9",
      "data-estimated-lines": "1"
    }[name] ?? null),
    getBoundingClientRect: () => makeRect(130, 60, 18, 15),
    querySelectorAll: () => [cell]
  };
  const table = {
    querySelector: () => null,
    querySelectorAll: selector => selector === "tbody tr" ? [row] : []
  };
  const block = {
    scrollWidth: 130, clientWidth: 130, scrollHeight: 100, clientHeight: 100,
    getAttribute: name => ({
      "data-block-id": "items",
      "data-block-type": "items_table",
      "data-block-label": "Items"
    }[name] ?? null),
    getBoundingClientRect: () => makeRect(500, 400, 100, 20),
    querySelector: selector => selector === ".design-items" ? table : null,
    querySelectorAll: () => []
  };
  const sheet = {
    clientWidth: 794, clientHeight: 1123,
    getBoundingClientRect: () => makeRect(794, 1123),
    getAttribute: name => ({
      "data-page-number": "1",
      "data-page-item-count": "1",
      "data-page-item-capacity-mm": "50",
      "data-page-row-height-estimate-mm": "9",
      "data-page-closing-reserved-mm": "0",
      "data-page-closing-only": "false"
    }[name] ?? null),
    querySelectorAll: selector => selector === ".design-block" ? [block] : []
  };
  const documentRef = {
    querySelectorAll: selector => selector === ".design-sheet" ? [sheet] : [],
    defaultView: {
      getComputedStyle: element => element === textElement
        ? { fontSize: "10px", lineHeight: "12px" }
        : { breakInside: "avoid", pageBreakInside: "avoid" }
    }
  };

  const measured = measureRenderedInvoiceDocument(documentRef);
  const measuredCell = measured.pages[0].blocks[0].rows[0].cells[0];
  assert.equal(measured.pages[0].blocks[0].rows[0].estimatedHeightMm, 9);
  assert.equal(measuredCell.columnKey, "description");
  assert.equal(measuredCell.columnLabel, "Description");
  assert.equal(measuredCell.estimatedLines, 1);
  assert.equal(measuredCell.actualLines, 3);
});

test("tall item-row warnings name the row and the column that wrapped more than estimated", () => {
  const audit = analyzeRenderedInvoiceMetrics({
    pages: [{
      pageNumber: 2,
      width: 793.7,
      height: 1122.5,
      itemCount: 1,
      itemCapacityMm: 80,
      estimatedItemRowHeightMm: 9,
      blocks: [{
        id: "items",
        type: "items_table",
        tablePresent: true,
        bounds: { left: 0, top: 0, right: 700, bottom: 600 },
        rows: [{
          itemNumber: 7,
          label: "Printed fabric",
          geometryAvailable: true,
          left: 0, top: 20, right: 700, bottom: 80,
          height: 60,
          estimatedHeightMm: 9,
          breakInside: "avoid",
          cellOverflowAxes: [],
          cells: [{
            columnKey: "description",
            columnLabel: "Description",
            estimatedLines: 1,
            actualLines: 3,
            hasContent: true
          }]
        }]
      }]
    }]
  }, { pageSize: "A4", orientation: "portrait" });

  const issue = audit.warnings.find(item => item.id === "item-row-height-estimate-2-items-7");
  assert.ok(issue);
  assert.equal(issue.title, "An invoice item row is taller than planned");
  assert.equal(issue.itemNumber, 7);
  assert.equal(issue.columnKey, "description");
  assert.equal(issue.columnLabel, "Description");
  assert.equal(issue.estimatedLines, 1);
  assert.equal(issue.actualLines, 3);
  assert.match(issue.detail, /Item 7/);
  assert.match(issue.detail, /Description column wraps to 3 lines instead of the 1 estimated/);
  assert.match(issue.detail, /Widen that column/);
});

test("tall item-row warnings still give a useful fallback when no single cell is responsible", () => {
  const audit = analyzeRenderedInvoiceMetrics({
    pages: [{
      pageNumber: 1,
      width: 793.7,
      height: 1122.5,
      blocks: [{
        id: "items",
        type: "items_table",
        bounds: { left: 0, top: 0, right: 700, bottom: 600 },
        rows: [{
          itemNumber: 2,
          geometryAvailable: true,
          top: 20, bottom: 80, left: 0, right: 700,
          height: 60,
          estimatedHeightMm: 9,
          cells: []
        }]
      }]
    }]
  });
  const issue = audit.warnings.find(item => item.id === "item-row-height-estimate-1-items-2");
  assert.ok(issue);
  assert.equal(issue.columnKey, null);
  assert.match(issue.detail, /font size, line spacing and cell padding/);
});

test("layout analysis reports overlapping elements without proposing an unsafe move", () => {
  const warnings = analyzeInvoiceLayout([
    { id: "one", type: "field", label: "Customer", x: 10, y: 10, w: 30, h: 10 },
    { id: "two", type: "text", label: "Address", x: 20, y: 12, w: 30, h: 10 }
  ]);
  const overlap = warnings.find(issue => issue.title === "Possible element overlap");
  assert.ok(overlap);
  assert.equal(overlap.fixable, false);
});


test("page navigation groups page-specific warnings without counting global warnings", async () => {
  const { buildInvoicePageNavigation } = await import("./invoicePreviewNavigation.js");
  const pages = buildInvoicePageNavigation([
    { pageNumber: 1, itemCount: 8 },
    { pageNumber: 2, itemCount: 2, reservedClosingSpaceMm: 24 },
    { pageNumber: 3, itemCount: 0, closingOnly: true }
  ], [
    { pageNumber: 1, severity: "warning" },
    { pageNumber: 2, severity: "error" },
    { pageNumber: 2, severity: "warning" },
    { severity: "warning", title: "Global preview warning" }
  ]);

  assert.deepEqual(pages, [
    { pageNumber: 1, itemCount: 8, closingOnly: false, reservedClosingSpaceMm: 0, itemCapacityMm: null, renderedItemHeightMm: null, itemSpaceUsedPercent: null, errorCount: 0, warningCount: 1, issueCount: 1 },
    { pageNumber: 2, itemCount: 2, closingOnly: false, reservedClosingSpaceMm: 24, itemCapacityMm: null, renderedItemHeightMm: null, itemSpaceUsedPercent: null, errorCount: 1, warningCount: 1, issueCount: 2 },
    { pageNumber: 3, itemCount: 0, closingOnly: true, reservedClosingSpaceMm: 0, itemCapacityMm: null, renderedItemHeightMm: null, itemSpaceUsedPercent: null, errorCount: 0, warningCount: 0, issueCount: 0 }
  ]);
});

test("page navigation passes through measured row height and capacity without inventing missing values", async () => {
  const { buildInvoicePageNavigation } = await import("./invoicePreviewNavigation.js");
  const pages = buildInvoicePageNavigation([
    { pageNumber: 1, itemCount: 4, itemCapacityMm: 40, renderedItemHeightMm: 30, itemSpaceUsedPercent: 75 },
    { pageNumber: 2, itemCount: 0, closingOnly: true, itemCapacityMm: null, renderedItemHeightMm: null, itemSpaceUsedPercent: null }
  ]);
  assert.deepEqual(pages.map(page => ({
    itemCapacityMm: page.itemCapacityMm,
    renderedItemHeightMm: page.renderedItemHeightMm,
    itemSpaceUsedPercent: page.itemSpaceUsedPercent
  })), [
    { itemCapacityMm: 40, renderedItemHeightMm: 30, itemSpaceUsedPercent: 75 },
    { itemCapacityMm: null, renderedItemHeightMm: null, itemSpaceUsedPercent: null }
  ]);
});

test("page navigation tolerates missing page data and malformed warnings", async () => {
  const { buildInvoicePageNavigation } = await import("./invoicePreviewNavigation.js");
  assert.deepEqual(buildInvoicePageNavigation(null, null), []);
  assert.deepEqual(buildInvoicePageNavigation([{}, { pageNumber: "4", itemCount: -3 }], [null, { pageNumber: 4, severity: "error" }]), [
    { pageNumber: 1, itemCount: 0, closingOnly: false, reservedClosingSpaceMm: 0, itemCapacityMm: null, renderedItemHeightMm: null, itemSpaceUsedPercent: null, errorCount: 0, warningCount: 0, issueCount: 0 },
    { pageNumber: 4, itemCount: 0, closingOnly: false, reservedClosingSpaceMm: 0, itemCapacityMm: null, renderedItemHeightMm: null, itemSpaceUsedPercent: null, errorCount: 1, warningCount: 0, issueCount: 1 }
  ]);
});


test("layout assistant suggests an off-page position correction only when it is collision-free", () => {
  const blocks = [
    { id: "outside", type: "field", label: "Customer", x: 95, y: 10, w: 10, h: 10 },
    { id: "other", type: "field", label: "Date", x: 10, y: 10, w: 20, h: 10 }
  ];
  const [suggestion] = buildInvoiceLayoutOptimizationSuggestions(blocks);
  assert.equal(suggestion.action, "move-inside-page");
  assert.deepEqual(suggestion.next, { x: 90, y: 10 });

  const applied = applyInvoiceLayoutOptimizationSuggestion(blocks, suggestion);
  assert.equal(applied.changed, true);
  assert.deepEqual(
    { x: applied.blocks[0].x, y: applied.blocks[0].y, w: applied.blocks[0].w, h: applied.blocks[0].h },
    { x: 90, y: 10, w: 10, h: 10 }
  );
  assert.equal(blocks[0].x, 95, "the original design remains unchanged");
});

test("layout assistant does not propose a position that would overlap another element", () => {
  const blocks = [
    { id: "outside", type: "field", x: 95, y: 10, w: 10, h: 10 },
    { id: "edge", type: "field", x: 90, y: 10, w: 10, h: 10 }
  ];
  const suggestions = buildInvoiceLayoutOptimizationSuggestions(blocks);
  assert.equal(suggestions.some(issue => issue.action === "move-inside-page"), false);
});

test("layout assistant normalizes visible item columns and preserves hidden columns", () => {
  const hidden = { key: "internal", width: 37, visible: false, label: "Hidden" };
  const blocks = [{
    id: "items",
    type: "items_table",
    x: 0, y: 20, w: 100, h: 40,
    columns: [
      { key: "description", width: 60, label: "Description" },
      { key: "amount", width: 60, label: "Amount" },
      hidden
    ]
  }];
  const [suggestion] = buildInvoiceLayoutOptimizationSuggestions(blocks);
  assert.equal(suggestion.action, "normalize-item-columns");
  const applied = applyInvoiceLayoutOptimizationSuggestion(blocks, suggestion);
  assert.equal(applied.changed, true);
  const updated = applied.blocks[0].columns;
  assert.ok(Math.abs(updated.filter(column => column.visible !== false).reduce((sum, column) => sum + column.width, 0) - 100) < 0.001);
  assert.deepEqual(updated[2], hidden);
  assert.equal(updated[0].key, "description");
  assert.equal(updated[1].key, "amount");
});

test("column optimizer previews a wider diagnostic column while preserving the 100% table width", () => {
  const hidden = { key: "legacy", label: "Hidden detail", width: 23, visible: false, order: 8 };
  const block = {
    id: "items",
    type: "items_table",
    columns: [
      { key: "sr", label: "#", width: 8, order: 0, visible: true },
      { key: "description", label: "Description", width: 18, order: 1, visible: true },
      { key: "designNumber", label: "Design No.", width: 12, order: 2, visible: true },
      { key: "hsnCode", label: "HSN", width: 8, order: 3, visible: true },
      { key: "quantity", label: "Qty", width: 8, order: 4, visible: true },
      { key: "unitPrice", label: "Rate", width: 18, order: 5, visible: true },
      { key: "amount", label: "Amount", width: 28, order: 6, visible: true },
      hidden
    ]
  };
  const issue = {
    blockId: "items",
    columnKey: "description",
    columnLabel: "Description",
    estimatedLines: 1,
    actualLines: 3
  };
  const preview = buildInvoiceColumnOptimizationPreview(block, issue);
  assert.ok(preview);
  assert.equal(preview.suggestion.action, "optimize-item-column");
  assert.equal(preview.currentTargetWidth, 18);
  assert.equal(preview.suggestedTargetWidth, 54);
  assert.equal(preview.visibleTotalBefore, 100);
  assert.equal(preview.visibleTotalAfter, 100);
  assert.deepEqual(preview.beforeColumns.map(column=>column.key),block.columns.map(column=>column.key));
  assert.deepEqual(preview.afterColumns[7],hidden);
  assert.ok(preview.afterColumns.filter(column=>column.visible!==false).every(column=>column.width>=3));
  assert.ok(preview.changedColumns.some(column=>column.key==="description"&&column.change>0));
  assert.ok(preview.changedColumns.filter(column=>column.key!=="description").every(column=>column.change<=0));
  assert.equal(block.columns[1].width,18,"preview generation does not mutate the saved table");
});

test("column optimizer refuses unsafe or ambiguous width layouts", () => {
  const base = {
    id: "items",
    type: "items_table",
    columns: [
      { key: "description", label: "Description", width: 50, visible: true },
      { key: "amount", label: "Amount", width: 50, visible: true }
    ]
  };
  const issue = { columnKey: "description", estimatedLines: 1, actualLines: 2 };
  assert.equal(buildInvoiceColumnOptimizationPreview(base,{...issue,actualLines:1}),null);
  assert.equal(buildInvoiceColumnOptimizationPreview(base,{...issue,columnKey:"missing"}),null);
  assert.equal(buildInvoiceColumnOptimizationPreview({...base,columns:[
    {key:"description",width:40,visible:true},
    {key:"amount",width:40,visible:true}
  ]},issue),null,"non-100% layouts must be normalized before optimization");
  assert.equal(buildInvoiceColumnOptimizationPreview({...base,columns:[
    {key:"description",width:97,visible:true},
    {key:"amount",width:3,visible:true}
  ]},issue),null,"there must be enough width to redistribute safely");
});

test("applying a column preview is reversible, preserves hidden columns and rejects stale widths", () => {
  const block = {
    id: "items",
    type: "items_table",
    columns: [
      { key: "description", label: "Description", width: 30, visible: true, order: 0 },
      { key: "designNumber", label: "Design No.", width: 30, visible: true, order: 1 },
      { key: "amount", label: "Amount", width: 40, visible: true, order: 2 },
      { key: "hidden", label: "Hidden", width: 17, visible: false, order: 3 }
    ]
  };
  const issue = { columnKey: "description", columnLabel: "Description", estimatedLines: 1, actualLines: 2 };
  const preview = buildInvoiceColumnOptimizationPreview(block,issue);
  assert.ok(preview);
  const applied = applyInvoiceLayoutOptimizationSuggestion([block],preview.suggestion);
  assert.equal(applied.changed,true);
  const updated = applied.blocks[0].columns;
  assert.ok(updated[0].width>block.columns[0].width);
  assert.deepEqual(updated[3],block.columns[3]);
  assert.equal(updated.reduce((sum,column)=>sum+(column.visible===false?0:column.width),0),100);
  assert.equal(block.columns[0].width,30,"the original block remains unchanged");

  const stale = [{...block,columns:block.columns.map((column,index)=>index===0?{...column,width:31}:column)}];
  const rejected = applyInvoiceLayoutOptimizationSuggestion(stale,preview.suggestion);
  assert.equal(rejected.changed,false);
  assert.match(rejected.reason,/changed after this preview/);
  assert.equal(stale[0].columns[0].width,31);
});

test("layout assistant offers text fitting for visible text blocks and ignores hidden or non-text elements", () => {
  const blocks = [
    { id: "address", type: "text", text: "Long address", fontSize: 16, visible: true },
    { id: "hidden", type: "text", text: "Hidden", fontSize: 16, visible: false },
    { id: "logo", type: "logo", fieldKey: "logo", fontSize: 12, visible: true }
  ];
  const suggestions = buildInvoiceLayoutOptimizationSuggestions(blocks, [], [
    { fixAction: "fit-text", blockId: "address", suggestedFontSize: 9 },
    { fixAction: "fit-text", blockId: "hidden", suggestedFontSize: 9 },
    { fixAction: "fit-text", blockId: "logo", suggestedFontSize: 9 }
  ]);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].action, "fit-text");
  const applied = applyInvoiceLayoutOptimizationSuggestion(blocks, suggestions[0]);
  assert.equal(applied.changed, true);
  assert.equal(applied.blocks[0].fontSize, 9);
  assert.equal(blocks[0].fontSize, 16);
});

test("stale layout suggestions do not overwrite newer element edits", () => {
  const blocks = [{ id: "outside", type: "field", x: 95, y: 10, w: 10, h: 10 }];
  const [suggestion] = buildInvoiceLayoutOptimizationSuggestions(blocks);
  const edited = [{ ...blocks[0], x: 80 }];
  const result = applyInvoiceLayoutOptimizationSuggestion(edited, suggestion);
  assert.equal(result.changed, false);
  assert.match(result.reason, /changed after this suggestion/);
  assert.equal(result.blocks[0].x, 80);
});

test("applying the optimization plan changes layout only and keeps financial fields untouched", () => {
  const blocks = [
    { id: "outside", type: "field", x: 95, y: 10, w: 10, h: 10, amount: 1200, tax: 18, due: 500 },
    { id: "items", type: "items_table", x: 0, y: 20, w: 100, h: 40, columns: [{ key: "description", width: 70 }, { key: "amount", width: 70 }] }
  ];
  const suggestions = buildInvoiceLayoutOptimizationSuggestions(blocks);
  const result = applyInvoiceLayoutOptimizationPlan(blocks, suggestions);
  assert.equal(result.changed, true);
  assert.equal(result.appliedCount, 2);
  assert.equal(result.blocks[0].amount, 1200);
  assert.equal(result.blocks[0].tax, 18);
  assert.equal(result.blocks[0].due, 500);
  assert.equal(blocks[0].x, 95);
});


test("combined layout review previews positions, text size and table columns without mutating the design", () => {
  const hidden = { key: "internal", label: "Hidden", width: 18, visible: false };
  const blocks = [
    { id: "customer", type: "field", label: "Customer", x: 95, y: 10, w: 10, h: 10, fontSize: 12, amount: 900, tax: 18 },
    {
      id: "items",
      type: "items_table",
      label: "Invoice items",
      x: 0, y: 20, w: 100, h: 40,
      columns: [
        { key: "description", label: "Description", width: 60 },
        { key: "amount", label: "Amount", width: 60 },
        hidden
      ]
    }
  ];
  const suggestions = buildInvoiceLayoutOptimizationSuggestions(blocks, [], [
    { fixAction: "fit-text", blockId: "customer", suggestedFontSize: 9 }
  ]);
  const preview = buildInvoiceLayoutOptimizationPlanPreview(blocks, suggestions);

  assert.ok(preview);
  assert.equal(preview.appliedCount, 3);
  assert.equal(preview.skippedCount, 0);
  assert.equal(preview.changes.length, 3);
  assert.equal(preview.blocks[0].x, 90);
  assert.equal(preview.blocks[0].fontSize, 9);
  assert.equal(preview.blocks[0].amount, 900);
  assert.equal(preview.blocks[0].tax, 18);
  assert.equal(preview.blocks[1].columns.filter(column => column.visible !== false).reduce((sum, column) => sum + column.width, 0), 100);
  assert.deepEqual(preview.blocks[1].columns[2], hidden);
  assert.match(preview.changes.find(change => change.action === "move-inside-page").summary, /95\.0%, 10\.0% to 90\.0%, 10\.0%/);
  assert.match(preview.changes.find(change => change.action === "fit-text").summary, /12\.0 px → 9\.0 px/);
  assert.match(preview.changes.find(change => change.action === "normalize-item-columns").summary, /Description 60\.0% → 50\.0%/);
  assert.equal(blocks[0].x, 95);
  assert.equal(blocks[0].fontSize, 12);
  assert.equal(blocks[1].columns[0].width, 60);
  assert.equal(preview.baseSnapshot, JSON.stringify(blocks));
});

test("combined layout review counts stale suggestions as skipped and leaves source blocks unchanged", () => {
  const blocks = [{ id: "customer", type: "field", label: "Customer", x: 95, y: 10, w: 10, h: 10 }];
  const suggestions = buildInvoiceLayoutOptimizationSuggestions(blocks);
  suggestions.push({
    id: "stale-font",
    action: "fit-text",
    blockId: "customer",
    title: "Fit text in Customer",
    expectedFontSize: 99,
    nextFontSize: 8
  });
  const preview = buildInvoiceLayoutOptimizationPlanPreview(blocks, suggestions);
  assert.equal(preview.appliedCount, 1);
  assert.equal(preview.skippedCount, 1);
  assert.equal(preview.changes.length, 1);
  assert.equal(preview.blocks[0].x, 90);
  assert.equal(preview.blocks[0].fontSize, undefined);
  assert.equal(blocks[0].x, 95);
});

test("combined layout review returns no plan when no suggestions are supplied", () => {
  assert.equal(buildInvoiceLayoutOptimizationPlanPreview([], []), null);
});


test("rendered layout optimizer widens a measured wrapping column and expands the table only into clear space", () => {
  const blocks = [
    {
      id: "items",
      type: "items_table",
      x: 5, y: 20, w: 90, h: 40, fontSize: 8,
      columns: [
        { key: "description", label: "Description", width: 20, visible: true },
        { key: "amount", label: "Amount", width: 80, visible: true }
      ]
    },
    { id: "totals", type: "totals", x: 60, y: 70, w: 35, h: 20 }
  ];
  const suggestions = buildInvoiceRenderedLayoutOptimizationSuggestions(blocks, [
    {
      id: "row-height",
      title: "An invoice item row is taller than planned",
      blockId: "items",
      columnKey: "description",
      columnLabel: "Description",
      estimatedLines: 1,
      actualLines: 2
    },
    {
      id: "capacity",
      title: "Invoice items exceed their allocated page space",
      blockId: "items"
    }
  ]);

  assert.equal(suggestions.length, 2);
  assert.equal(suggestions[0].action, "optimize-item-column");
  assert.equal(suggestions[1].action, "increase-item-table-height");
  assert.equal(suggestions[1].nextHeight, 48.5);

  const preview = buildInvoiceLayoutOptimizationPlanPreview(blocks, suggestions);
  assert.equal(preview.appliedCount, 2);
  assert.equal(preview.blocks[0].h, 48.5);
  assert.ok(preview.blocks[0].columns[0].width > 20);
  assert.equal(preview.blocks[0].columns.reduce((sum, column) => sum + column.width, 0), 100);
  assert.equal(preview.blocks[1].y, 70);
  assert.equal(blocks[0].h, 40);
  assert.equal(blocks[0].columns[0].width, 20);
  assert.match(preview.changes.find(change => change.action === "increase-item-table-height").summary, /40\.0% → 48\.5%/);
});

test("rendered layout optimizer reduces table font only when no safe column width change exists", () => {
  const table = {
    id: "items",
    type: "items_table",
    x: 0, y: 10, w: 100, h: 40, fontSize: 8,
    columns: [
      { key: "description", label: "Description", width: 97, visible: true },
      { key: "amount", label: "Amount", width: 3, visible: true }
    ]
  };
  const warnings = [{
    id: "row-height",
    title: "An invoice item row is taller than planned",
    blockId: "items",
    columnKey: "description",
    columnLabel: "Description",
    estimatedLines: 1,
    actualLines: 2
  }];
  const reservedSpaceBlocks = [
    table,
    { id: "footer", type: "text", x: 0, y: 52, w: 100, h: 10 }
  ];
  const suggestions = buildInvoiceRenderedLayoutOptimizationSuggestions(reservedSpaceBlocks, warnings);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].action, "fit-item-table-text");
  const applied = applyInvoiceLayoutOptimizationSuggestion(reservedSpaceBlocks, suggestions[0]);
  assert.equal(applied.changed, true);
  assert.equal(applied.blocks[0].fontSize, 7);
  assert.equal(table.fontSize, 8);
});

test("rendered layout optimizer moves totals only to a clear, on-page position after the item table", () => {
  const blocks = [
    { id: "items", type: "items_table", x: 0, y: 20, w: 100, h: 40 },
    { id: "totals", type: "totals", x: 65, y: 45, w: 30, h: 15 }
  ];
  const suggestions = buildInvoiceRenderedLayoutOptimizationSuggestions(blocks, [{
    id: "totals-overlap",
    title: "The totals section overlaps invoice items",
    blockId: "totals"
  }]);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].action, "move-totals-after-items");
  assert.equal(suggestions[0].nextY, 61.5);

  const applied = applyInvoiceLayoutOptimizationSuggestion(blocks, suggestions[0]);
  assert.equal(applied.changed, true);
  assert.equal(applied.blocks[1].y, 61.5);
  assert.equal(blocks[1].y, 45);

  const stale = [{ ...blocks[0], h: 42 }, blocks[1]];
  const rejected = applyInvoiceLayoutOptimizationSuggestion(stale, suggestions[0]);
  assert.equal(rejected.changed, false);
  assert.match(rejected.reason, /placement changed/);
});

test("rendered layout optimizer never grows the item table into another element or moves totals off the page", () => {
  const crowded = [
    { id: "items", type: "items_table", x: 0, y: 20, w: 100, h: 40 },
    { id: "notes", type: "text", x: 0, y: 62, w: 100, h: 15 },
    { id: "totals", type: "totals", x: 65, y: 80, w: 30, h: 15 }
  ];
  const heightSuggestions = buildInvoiceRenderedLayoutOptimizationSuggestions(crowded, [{
    id: "capacity",
    title: "Invoice items exceed their allocated page space",
    blockId: "items"
  }]);
  assert.equal(heightSuggestions.some(item => item.action === "increase-item-table-height"), false);

  const totalsTooLow = [
    { id: "items", type: "items_table", x: 0, y: 20, w: 100, h: 65 },
    { id: "totals", type: "totals", x: 65, y: 80, w: 30, h: 20 }
  ];
  const totalsSuggestions = buildInvoiceRenderedLayoutOptimizationSuggestions(totalsTooLow, [{
    id: "totals-overlap",
    title: "The totals section overlaps invoice items",
    blockId: "totals"
  }]);
  assert.equal(totalsSuggestions.some(item => item.action === "move-totals-after-items"), false);
});

test("combined rendered layout plan keeps invoice financial values untouched", () => {
  const blocks = [
    {
      id: "items", type: "items_table", x: 0, y: 10, w: 100, h: 45,
      fontSize: 8, amount: 2400, tax: 18, due: 500,
      columns: [
        { key: "description", label: "Description", width: 25, visible: true },
        { key: "amount", label: "Amount", width: 75, visible: true }
      ]
    },
    { id: "totals", type: "totals", x: 65, y: 50, w: 30, h: 15, grandTotal: 2400 }
  ];
  const suggestions = buildInvoiceRenderedLayoutOptimizationSuggestions(blocks, [{
    id: "row-height",
    title: "An invoice item row is taller than planned",
    blockId: "items",
    columnKey: "description",
    estimatedLines: 1,
    actualLines: 2
  }]);
  const preview = buildInvoiceLayoutOptimizationPlanPreview(blocks, suggestions);
  assert.equal(preview.blocks[0].amount, 2400);
  assert.equal(preview.blocks[0].tax, 18);
  assert.equal(preview.blocks[0].due, 500);
  assert.equal(preview.blocks[1].grandTotal, 2400);
  assert.equal(blocks[0].fontSize, 8);
  assert.equal(blocks[0].columns[0].width, 25);
});

test("all ready-made invoice templates stay inside the page and keep their closing areas clear", () => {
  assert.equal(INVOICE_DESIGN_PRESETS.length, 15);

  INVOICE_DESIGN_PRESETS.forEach(preset => {
    const design = createInvoiceDesignTemplate("qa-" + preset.key, preset.key);
    const ids = design.blocks.map(block => block.id);
    assert.equal(new Set(ids).size, ids.length, preset.name + " must use unique element IDs");

    design.blocks.filter(block => block.visible !== false).forEach(block => {
      assert.ok(Number.isFinite(block.x) && Number.isFinite(block.y), preset.name + " has finite element positions");
      assert.ok(Number.isFinite(block.w) && Number.isFinite(block.h), preset.name + " has finite element sizes");
      assert.ok(block.w > 0 && block.h > 0, preset.name + " has non-zero visible element sizes");
      assert.ok(block.x >= 0 && block.y >= 0, preset.name + " keeps visible elements within the page origin");
      assert.ok(block.x + block.w <= 100.001, preset.name + " keeps visible elements within the page width");
      assert.ok(block.y + block.h <= 100.001, preset.name + " keeps visible elements within the page height");
    });

    const fieldKeys = new Set(design.blocks.filter(block => block.type === "field").map(block => block.fieldKey));
    ["company_name", "customer_name", "invoice_title", "invoice_no", "invoice_date"].forEach(key => {
      assert.ok(fieldKeys.has(key), preset.name + " includes " + key);
    });

    const tables = design.blocks.filter(block => block.type === "items_table");
    assert.equal(tables.length, 1, preset.name + " has exactly one line-item table");
    const visibleColumns = tables[0].columns.filter(column => column.visible !== false);
    assert.ok(visibleColumns.length > 0, preset.name + " has visible item columns");
    const visibleColumnWidth = visibleColumns.reduce((sum, column) => sum + Number(column.width || 0), 0);
    assert.ok(Math.abs(visibleColumnWidth - 100) < 0.001, preset.name + " item columns fill exactly 100%");

    const totalsPanel = design.blocks.find(block => block.id === "totals-panel");
    const signatureRule = design.blocks.find(block => block.id === "signature-rule");
    assert.ok(totalsPanel && signatureRule, preset.name + " reserves both totals and signatory areas");
    assert.ok(
      totalsPanel.y + totalsPanel.h <= signatureRule.y,
      preset.name + " keeps the signatory rule below, not inside, the totals panel"
    );
    assert.ok(design.blocks.some(block => block.type === "totals"), preset.name + " includes invoice totals");
  });
});

test("embroidery job-work template includes its real production and fabric billing columns", () => {
  const preset = INVOICE_DESIGN_PRESETS.find(item => item.key === "embroidery-job-work");
  assert.ok(preset);
  assert.equal(preset.category, "Textile & manufacturing");
  assert.equal(preset.pageSize, "A4");
  assert.equal(preset.orientation, "landscape");
  assert.deepEqual(
    preset.columns.map(column => column.key),
    ["sr", "designNumber", "description", "hsnCode", "quantity", "qtyUnit", "cut", "MTR", "shortPcs", "unitPrice", "taxable", "amount"]
  );
  assert.equal(preset.columns.reduce((sum, column) => sum + column.width, 0), 100);
  const design = createInvoiceDesignTemplate("qa-embroidery", preset.key);
  assert.ok(design.blocks.some(block => block.id === "items-caption" && block.text === "EMBROIDERY & JOB WORK DETAILS"));
});
