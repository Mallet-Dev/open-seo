import { shiftGa4Date } from "./Ga4Dates";
import type { Ga4OrganicOverviewService } from "./Ga4OrganicOverviewService";

type Overview = Pick<
  Awaited<ReturnType<typeof Ga4OrganicOverviewService.getOrganicOverview>>,
  "source" | "request" | "trend" | "reportMetadata" | "diagnostics" | "warnings"
> & {
  current: Record<string, string | number | null> | null;
  previous: Record<string, string | number | null> | null;
};
function metric(
  row: Record<string, string | number | null> | null,
  name: string,
): number | null {
  const value = row?.[name];
  return typeof value === "number" ? value : null;
}
export function buildGa4DashboardReport(overview: Overview) {
  const totals = (row: Record<string, string | number | null> | null) => ({
    sessions: metric(row, "sessions"),
    activeUsers: metric(row, "activeUsers"),
    engagementRate: metric(row, "engagementRate"),
    keyEvents: metric(row, "keyEvents"),
  });
  const sessions = new Map<string, number | null>();
  for (const row of overview.trend) {
    if (typeof row.date !== "string") continue;
    const date = `${row.date.slice(0, 4)}-${row.date.slice(4, 6)}-${row.date.slice(6, 8)}`;
    sessions.set(date, metric(row, "sessions"));
  }
  const trend: { date: string; sessions: number | null }[] = [];
  for (
    let date = overview.request.resolvedDateRange.startDate;
    date <= overview.request.resolvedDateRange.endDate;
    date = shiftGa4Date(date, 1)
  ) {
    // A limited report cannot establish zero activity on an omitted day.
    const observed = sessions.get(date);
    trend.push({
      date,
      sessions:
        observed !== undefined
          ? observed
          : overview.reportMetadata.hasLimitedData
            ? null
            : 0,
    });
  }
  return {
    connected: true as const,
    source: overview.source,
    request: overview.request,
    reportMetadata: overview.reportMetadata,
    diagnostics: overview.diagnostics,
    warnings: overview.warnings,
    totals: totals(overview.current),
    prevTotals: totals(overview.previous),
    trend,
  };
}
