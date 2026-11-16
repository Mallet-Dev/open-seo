import { buildCsv } from "@/client/lib/csv";
import type { Report } from "./RetainedSearchPerformance";
export type RetainedExportFilters = {
  device: string;
  country: string;
  trackedOnly: boolean;
  notesRevision: number;
};
export function retainedQueryCsv(
  report: Pick<
    Report,
    "property" | "revision" | "previousStart" | "previousEnd"
  >,
  rows: Report["queries"],
  range: { startDate: string; endDate: string },
  filters: RetainedExportFilters,
  search: string,
) {
  return buildCsv(
    [
      "Query",
      "Impressions",
      "Clicks",
      "Position",
      "Previous position",
      "Change",
      "Dominant page",
      "Property",
      "Source revision",
      "Tracking revision",
      "Start date",
      "End date",
      "Previous start",
      "Previous end",
      "Device",
      "Country",
      "Tracked only",
      "Query filter",
    ],
    rows.map((row) => [
      row.query,
      row.daysObserved ? row.impressions : null,
      row.daysObserved ? row.clicks : null,
      row.position,
      row.previousPosition,
      row.improvement,
      row.dominantPage,
      report.property,
      report.revision,
      filters.notesRevision,
      range.startDate,
      range.endDate,
      report.previousStart,
      report.previousEnd,
      filters.device,
      filters.country,
      String(filters.trackedOnly),
      search,
    ]),
  );
}
