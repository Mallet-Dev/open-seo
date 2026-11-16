import { describe, expect, it } from "vitest";
import { summarizeAuditCoverage } from "./auditCoverage";
import type { DashboardAuditSummary } from "@/server/features/dashboard/services/DashboardService";

describe("audit coverage", () => {
  const summary: DashboardAuditSummary = {
    status: "completed",
    pagesCrawled: 0,
    startedAt: "2026-01-01",
    topIssues: [],
    totalIssueTypes: 0,
  };
  it("does not clear a failed, incomplete or zero-page crawl", () => {
    for (const status of ["running", "failed", "completed"] as const)
      expect(summarizeAuditCoverage({ ...summary, status })).not.toMatch(
        /no issues|healthy/i,
      );
    expect(
      summarizeAuditCoverage({ ...summary, status: "failed", pagesCrawled: 8 }),
    ).toMatch(/incomplete/i);
  });
  it("limits successful findings to the pages actually checked", () => {
    expect(summarizeAuditCoverage({ ...summary, pagesCrawled: 4 })).toContain(
      "4 pages crawled",
    );
    expect(
      summarizeAuditCoverage({
        ...summary,
        pagesCrawled: 1,
        totalIssueTypes: 2,
      }),
    ).toContain("2 issue types");
  });
});
