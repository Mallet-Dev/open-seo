import { describe, expect, it } from "vitest";
import { buildGa4DashboardReport } from "./Ga4DashboardReport";
type Overview = Parameters<typeof buildGa4DashboardReport>[0];
function overview(overrides: Partial<Overview> = {}): Overview {
  return {
    source: {
      provider: "google_analytics",
      propertyId: "properties/123",
      propertyDisplayName: "Invented example",
    },
    request: {
      requestedDateRange: null,
      resolvedDateRange: { startDate: "2026-11-01", endDate: "2026-11-03" },
      previousDateRange: { startDate: "2026-10-29", endDate: "2026-10-31" },
      propertyTimeZone: "America/Toronto",
      currencyCode: "CAD",
      channel: "organic_search",
      trend: "daily",
    },
    current: { sessions: null, keyEvents: 0 },
    previous: null,
    trend: [
      { date: "20261101", sessions: 0 },
      { date: "20261103", sessions: null },
    ],
    reportMetadata: { hasLimitedData: false, reports: [] },
    diagnostics: [],
    warnings: [],
    ...overrides,
  };
}
describe("GA4 dashboard evidence adapter", () => {
  it("preserves null metrics and source dates while zero-filling only complete missing days", () => {
    const source = overview();
    const report = buildGa4DashboardReport(source);
    expect(report.totals).toMatchObject({ sessions: null, keyEvents: 0 });
    expect(report.trend).toEqual([
      { date: "2026-11-01", sessions: 0 },
      { date: "2026-11-02", sessions: 0 },
      { date: "2026-11-03", sessions: null },
    ]);
    expect(report.source).toEqual(source.source);
    expect(report.request).toEqual(source.request);
  });
  it("keeps omitted days unknown when Google reports limited data", () => {
    const source = overview({
      reportMetadata: { hasLimitedData: true, reports: [] },
      warnings: ["end_date_clamped"],
    });
    const report = buildGa4DashboardReport(source);
    expect(report.trend[1]?.sessions).toBeNull();
    expect(report.trend[0]?.sessions).toBe(0);
    expect(report.reportMetadata.hasLimitedData).toBe(true);
    expect(report.warnings).toEqual(["end_date_clamped"]);
  });
});
