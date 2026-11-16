import { makeGa4ReportResult } from "@/server/features/ga4/services/ga4-test-fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Ga4ReportingService } from "@/server/features/ga4/services/Ga4ReportingService";
import { SearchOpportunityService } from "@/server/features/ga4/services/SearchOpportunityService";
import { Ga4ReportError } from "@/server/lib/ga4Errors";
import {
  SearchIntelligenceService as service,
  searchAnalysisInputSchema,
} from "./SearchIntelligenceService";
vi.mock("@/server/features/ga4/services/Ga4ReportingService", () => ({
  Ga4ReportingService: { runReport: vi.fn() },
}));
vi.mock("@/server/features/ga4/services/SearchOpportunityService", () => ({
  SearchOpportunityService: { getOpportunities: vi.fn() },
}));
beforeEach(() => vi.resetAllMocks());
describe("first-party reporting boundary", () => {
  it("rejects project substitution and invalid cohorts before reaching a service", async () => {
    const input = searchAnalysisInputSchema.parse({
      projectId: "p1",
      kind: "landing_pages",
    });
    await expect(service.report("p2", input)).rejects.toThrow("FORBIDDEN");
    for (const raw of [
      { ...input, startDate: "2026-11-01" },
      { ...input, kind: "opportunities", channel: "all" },
      { ...input, startDate: "2026-11-15", endDate: "2026-11-01" },
    ])
      expect(searchAnalysisInputSchema.safeParse(raw).success).toBe(false);
    expect(Ga4ReportingService.runReport).not.toHaveBeenCalled();
    expect(SearchOpportunityService.getOpportunities).not.toHaveBeenCalled();
  });
  it("preserves the existing report and its source/quality metadata without collecting on another path", async () => {
    const report = makeGa4ReportResult({
      diagnostics: [],
      source: { propertyId: "properties/123" },
      request: {
        resolvedDateRange: { startDate: "2026-11-01", endDate: "2026-11-10" },
      },
      reportMetadata: { hasLimitedData: true },
      rows: [{ sessions: null }],
      warnings: ["comparison_incomplete"],
    });
    vi.mocked(Ga4ReportingService.runReport).mockResolvedValue(report);
    const input = searchAnalysisInputSchema.parse({
      projectId: "p1",
      kind: "landing_pages",
      offset: 100,
    });
    expect(await service.report("p1", input)).toEqual({
      status: "ready",
      kind: "analytics",
      report,
    });
    expect(Ga4ReportingService.runReport).toHaveBeenCalledWith(input);
    expect(SearchOpportunityService.getOpportunities).not.toHaveBeenCalled();
  });
  it("keeps opportunity coverage, fallback and truncation evidence intact", async () => {
    const report: Awaited<
      ReturnType<typeof SearchOpportunityService.getOpportunities>
    > = {
      status: "ok",
      source: {
        searchConsoleSiteUrl: "sc-domain:example.test",
        googleAnalyticsPropertyId: "properties/123",
        googleAnalyticsPropertyDisplayName: "Example",
      },
      request: {
        dateRange: { startDate: "2026-11-01", endDate: "2026-11-10" },
        limit: 50,
        searchConsoleTimeZone: "America/Los_Angeles",
        googleAnalyticsTimeZone: "America/Toronto",
      },
      rowCount: 1,
      totalCandidateRows: 1,
      rows: [
        {
          page: "https://example.test/a",
          normalizedPage: "example.test/a",
          clicks: 1,
          impressions: 10,
          ctr: 0.1,
          position: 8,
          joinStatus: "gsc_only",
          ga4: null,
          score: null,
          scoreComponents: null,
        },
      ],
      scoring: {
        formula: "heuristic",
        businessValueMetric: "engagementRate",
        engagementFallback: true,
        scoreDataLimited: false,
      },
      coverage: {
        gscRowsConsidered: 1,
        ga4RowsConsidered: 0,
        matchedRows: 0,
        unmatchedGscRows: 1,
        unmatchedGa4Rows: 0,
      },
      truncated: { gsc: true, ga4: false, candidates: false },
      warnings: [],
      reportMetadata: makeGa4ReportResult().reportMetadata,
      quota: null,
    };
    vi.mocked(SearchOpportunityService.getOpportunities).mockResolvedValue(
      report,
    );
    const input = searchAnalysisInputSchema.parse({
      projectId: "p1",
      kind: "opportunities",
    });
    expect(await service.report("p1", input)).toEqual({
      status: "ready",
      kind: "opportunities",
      report,
    });
    expect(Ga4ReportingService.runReport).not.toHaveBeenCalled();
  });
  it("returns a source state for denied access and propagates unexpected faults", async () => {
    const input = searchAnalysisInputSchema.parse({
      projectId: "p1",
      kind: "landing_pages",
    });
    vi.mocked(Ga4ReportingService.runReport).mockRejectedValue(
      new Ga4ReportError("ga4_reconnect_required", "Expired"),
    );
    expect(await service.report("p1", input)).toEqual({
      status: "unavailable",
      code: "ga4_reconnect_required",
    });
    vi.mocked(Ga4ReportingService.runReport).mockRejectedValue(
      new Error("Unexpected"),
    );
    await expect(service.report("p1", input)).rejects.toThrow("Unexpected");
  });
});
