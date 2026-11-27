import test from "node:test";
import assert from "node:assert/strict";
import { analyzeInvoiceLayout, applySafeInvoiceLayoutFixes, buildInvoiceLayoutOptimizationSuggestions, applyInvoiceLayoutOptimizationSuggestion, applyInvoiceLayoutOptimizationPlan } from "./invoiceLayoutQuality.js";
import { analyzeInvoicePagination } from "./invoicePaginationHints.js";
import { analyzeRenderedInvoiceMetrics } from "./invoiceRenderedPrintCheck.js";
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
    { pageNumber: 1, itemCount: 8, closingOnly: false, reservedClosingSpaceMm: 0, errorCount: 0, warningCount: 1, issueCount: 1 },
    { pageNumber: 2, itemCount: 2, closingOnly: false, reservedClosingSpaceMm: 24, errorCount: 1, warningCount: 1, issueCount: 2 },
    { pageNumber: 3, itemCount: 0, closingOnly: true, reservedClosingSpaceMm: 0, errorCount: 0, warningCount: 0, issueCount: 0 }
  ]);
});

test("page navigation tolerates missing page data and malformed warnings", async () => {
  const { buildInvoicePageNavigation } = await import("./invoicePreviewNavigation.js");
  assert.deepEqual(buildInvoicePageNavigation(null, null), []);
  assert.deepEqual(buildInvoicePageNavigation([{}, { pageNumber: "4", itemCount: -3 }], [null, { pageNumber: 4, severity: "error" }]), [
    { pageNumber: 1, itemCount: 0, closingOnly: false, reservedClosingSpaceMm: 0, errorCount: 0, warningCount: 0, issueCount: 0 },
    { pageNumber: 4, itemCount: 0, closingOnly: false, reservedClosingSpaceMm: 0, errorCount: 1, warningCount: 0, issueCount: 1 }
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

test("layout assistant offers text fitting only for a current visible text element", () => {
  const blocks = [
    { id: "address", type: "text", text: "Long address", fontSize: 16, visible: true },
    { id: "hidden", type: "text", text: "Hidden", fontSize: 16, visible: false },
    { id: "gst", type: "field", fieldKey: "gst", fontSize: 12, visible: true }
  ];
  const suggestions = buildInvoiceLayoutOptimizationSuggestions(blocks, [], [
    { fixAction: "fit-text", blockId: "address", suggestedFontSize: 9 },
    { fixAction: "fit-text", blockId: "hidden", suggestedFontSize: 9 },
    { fixAction: "fit-text", blockId: "gst", suggestedFontSize: 9 }
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
