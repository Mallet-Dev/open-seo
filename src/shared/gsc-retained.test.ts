import { describe, expect, it } from "vitest";
import {
  pageMatchesProperty,
  adaptRetainedImport,
  propertyMatchesDomain,
  retainedImportSchema,
  retainedReport,
  type RetainedRow,
} from "./gsc-retained";
const row: RetainedRow = {
  date: "2026-11-01",
  query: "tile",
  page: "https://example.test/a",
  country: "CAN",
  device: "MOBILE",
  clicks: 2,
  impressions: 20,
  position: 5,
};
const input = {
  operationId: "00000000-0000-4000-8000-000000000001",
  expectedRevision: 0,
  property: "sc-domain:example.test",
  provider: "google-search-console",
  searchType: "web",
  aggregation: "byPage",
  dimensions: ["date", "query", "page", "device", "country"],
  evidence: "Invented source receipt",
  startDate: "2026-11-01",
  endDate: "2026-11-01",
  sourceName: "Invented fixture",
  sourceDigest: "a".repeat(64),
  collectedAt: null,
  complete: null,
  rows: [row],
};
describe("retained Search Console trust and arithmetic", () => {
  it("accepts normalized data and rejects duplicate, reversed, out-of-window, non-finite and invalid metric records", () => {
    expect(retainedImportSchema.parse(input).rows).toEqual([row]);
    for (const changed of [
      { rows: [row, row] },
      { endDate: "2026-10-01" },
      { rows: [{ ...row, date: "2026-11-02" }] },
      { rows: [{ ...row, impressions: Infinity }] },
      { rows: [{ ...row, clicks: 21 }] },
      { rows: [{ ...row, position: null }] },
      { rows: [{ ...row, page: "javascript:alert(1)" }] },
    ])
      expect(
        retainedImportSchema.safeParse({ ...input, ...changed }).success,
      ).toBe(false);
  });
  it("binds project domains and refuses lookalike URL prefixes or credential URLs", () => {
    expect(propertyMatchesDomain(input.property, "example.test")).toBe(true);
    expect(propertyMatchesDomain(input.property, "other.test")).toBe(false);
    expect(pageMatchesProperty(row.page, input.property)).toBe(true);
    expect(
      pageMatchesProperty(
        "https://example.test.attacker.test/x",
        "https://example.test",
      ),
    ).toBe(false);
    expect(
      pageMatchesProperty("https://u:p@example.test/x", input.property),
    ).toBe(false);
  });
  it("matches impression weighting, dominant URL and common-query comparison without turning missing values into zero", () => {
    const data = [
      row,
      {
        ...row,
        page: "https://example.test/b",
        impressions: 80,
        clicks: 8,
        position: 10,
      },
      { ...row, date: "2026-10-31", impressions: 10, clicks: 1, position: 12 },
      { ...row, query: "new", impressions: 5, position: 1 },
    ];
    const report = retainedReport(data, {
      projectId: "p",
      property: input.property,
      revision: 1,
      notesRevision: 0,
      trackedOnly: false,
      startDate: "2026-11-01",
      endDate: "2026-11-01",
      country: "ALL",
      device: "ALL",
    });
    expect(report.queries.find((r) => r.query === "tile")).toMatchObject({
      position: 9,
      previousPosition: 12,
      improvement: 3,
      dominantPage: "https://example.test/b",
      pageCount: 2,
    });
    expect(report.commonQueries).toBe(1);
    expect(report.matchedImprovement).toBe(3);
    expect(
      report.queries.find((r) => r.query === "new")?.improvement,
    ).toBeNull();
    expect(
      retainedReport([], {
        projectId: "p",
        property: input.property,
        revision: 1,
        notesRevision: 0,
        trackedOnly: false,
        startDate: "2026-11-01",
        endDate: "2026-11-01",
        country: "ALL",
        device: "ALL",
      }).totals,
    ).toMatchObject({ clicks: 0, impressions: 0, position: null, ctr: null });
  });
  it("adapts the normalized Studio envelope and rejects a mismatched measurement", () => {
    const source = {
      property: input.property,
      provider: "google-search-console",
      searchType: "web",
      aggregation: "byPage",
      dimensions: ["date", "query", "page", "device", "country"],
      start: input.startDate,
      end: input.endDate,
      collectedAt: null,
      complete: false,
      evidence: "Invented original receipt",
    };
    const controls = {
      operationId: input.operationId,
      expectedRevision: 0,
      sourceDigest: input.sourceDigest,
    };
    expect(
      adaptRetainedImport({ source, rows: [row] }, controls),
    ).toMatchObject({
      evidence: source.evidence,
      complete: false,
      rows: [row],
    });
    expect(() =>
      adaptRetainedImport(
        { source: { ...source, searchType: "image" }, rows: [row] },
        controls,
      ),
    ).toThrow();
  });
  it("uses proportional calendar gaps rather than enumerating empty years", () => {
    const query = {
      projectId: "p",
      property: input.property,
      revision: 1,
      notesRevision: 0,
      trackedOnly: false,
      startDate: "1900-01-01",
      endDate: "2100-01-01",
      country: "ALL",
      device: "ALL" as const,
    };
    expect(retainedReport([], query).daily).toEqual([]);
    const dates = retainedReport(
      [row, { ...row, date: "2026-11-03" }],
      query,
    ).daily;
    expect(dates.map((point) => point.date)).toEqual([
      "1900-01-01",
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2100-01-01",
    ]);
    expect(
      dates.find((point) => point.date === "2026-11-02")?.position,
    ).toBeNull();
  });
});
