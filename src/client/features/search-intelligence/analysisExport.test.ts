import { expect, it } from "vitest";
import Papa from "papaparse";
import { buildAnalysisExport } from "./analysisExport";

it("exports only visible CSV rows with source and limits, protects formulas and keeps zero distinct from missing", () => {
  const result = {
    kind: "analytics" as const,
    report: {
      rows: [
        { page: "=1+1", sessions: 0, keyEvents: null },
        { page: "hidden", sessions: 5, keyEvents: 2 },
      ],
      source: { propertyId: "properties/invented" },
      request: { timeZone: "America/Toronto", currency: "CAD" },
      reportMetadata: { hasLimitedData: true },
      warnings: ["source_time_zones_differ"],
      pageInfo: { offset: 100, hasMore: true },
      totalRowCount: 800,
    },
  };
  const input = {
    result,
    projectId: "invented-project",
    fields: ["page", "sessions", "keyEvents"],
    visibleRows: [result.report.rows[0]],
    filter: "=1",
    focusedPage: null,
    clientReceivedAt: "2026-11-15T00:00:00Z",
    exportedAt: "2026-11-15T01:00:00Z",
  };
  const csv = Papa.parse<Record<string, string>>(
    buildAnalysisExport({ ...input, format: "csv" }),
    { header: true },
  );
  expect(csv.errors).toEqual([]);
  expect(csv.data).toHaveLength(1);
  expect(csv.data[0]).toMatchObject({
    page: "'=1+1",
    sessions: "0",
    keyEvents: "",
    "Export scope": "visible_loaded_rows",
    "Loaded rows": "2",
    "Visible rows": "1",
    "Text filter": "'=1",
  });
  expect(JSON.parse(csv.data[0].Source)).toEqual(result.report.source);
  expect(JSON.parse(csv.data[0]["Data quality"])).toEqual({
    hasLimitedData: true,
  });
  expect(JSON.parse(csv.data[0]["Report context"])).toMatchObject({
    pageInfo: { offset: 100, hasMore: true },
    totalRowCount: 800,
  });
  const saved: unknown = JSON.parse(
    buildAnalysisExport({ ...input, format: "json" }),
  );
  expect(saved).toMatchObject({ result, visibleRows: input.visibleRows });
  expect(saved).toMatchObject({
    scope: "loaded_report_page",
    projectId: "invented-project",
    clientReceivedAt: input.clientReceivedAt,
  });
});

it("retains opportunity coverage, heuristic context, nulls and the original precision in JSON, including empty views", () => {
  const result = {
    kind: "opportunities" as const,
    report: {
      rows: [{ page: "/a", score: null, position: 5.123456789 }],
      source: { searchConsoleSiteUrl: "sc-domain:example.test" },
      request: { limit: 1 },
      reportMetadata: { hasLimitedData: false },
      warnings: [],
      coverage: { matchedRows: 0 },
      truncated: { candidates: true },
      scoring: { engagementFallback: true },
    },
  };
  const input = {
    result,
    projectId: "invented-project",
    fields: ["page", "score", "position"],
    visibleRows: [],
    filter: "no match",
    focusedPage: "/missing",
    clientReceivedAt: "2026-11-15T00:00:00Z",
    exportedAt: "2026-11-15T01:00:00Z",
    format: "json" as const,
  };
  const saved: unknown = JSON.parse(buildAnalysisExport(input));
  expect(saved).toMatchObject({
    result,
    view: {
      visibleRows: 0,
      loadedRows: 1,
      focusedPage: "/missing",
    },
  });
});
