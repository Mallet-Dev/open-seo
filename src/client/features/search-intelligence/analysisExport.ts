import { buildCsv } from "@/client/lib/csv";
type ExportRow = Record<string, string | number | null>;
type ReportEvidence = {
  kind: "analytics" | "opportunities";
  report: {
    rows: unknown[];
    source: unknown;
    request: unknown;
    reportMetadata: unknown;
    warnings: unknown;
  };
};
export function buildAnalysisExport({
  result,
  projectId,
  fields,
  visibleRows,
  filter,
  focusedPage,
  clientReceivedAt,
  exportedAt,
  format,
}: {
  result: ReportEvidence;
  projectId: string;
  fields: string[];
  visibleRows: ExportRow[];
  filter: string;
  focusedPage: string | null;
  clientReceivedAt: string;
  exportedAt: string;
  format: "csv" | "json";
}) {
  const evidence = {
    schemaVersion: 1,
    scope: "loaded_report_page",
    projectId,
    clientReceivedAt,
    exportedAt,
    view: {
      filter,
      focusedPage,
      visibleRows: visibleRows.length,
      loadedRows: result.report.rows.length,
    },
    result,
    visibleRows,
  };
  if (format === "json") return JSON.stringify(evidence, null, 2);
  const report = result.report;
  const context = [
    projectId,
    "visible_loaded_rows",
    clientReceivedAt,
    exportedAt,
    visibleRows.length,
    report.rows.length,
    JSON.stringify(report.source),
    JSON.stringify(report.request),
    JSON.stringify(report.reportMetadata),
    JSON.stringify(report.warnings),
    JSON.stringify(report, (key, value: unknown) =>
      key === "rows" ? undefined : value,
    ),
    filter,
    focusedPage,
  ];
  return buildCsv(
    [
      ...fields,
      "Project",
      "Export scope",
      "Client received at",
      "Exported at",
      "Visible rows",
      "Loaded rows",
      "Source",
      "Report request",
      "Data quality",
      "Warnings",
      "Report context",
      "Text filter",
      "Focused page",
    ],
    visibleRows.map((row) => [
      ...fields.map((field) => row[field]),
      ...context,
    ]),
  );
}
