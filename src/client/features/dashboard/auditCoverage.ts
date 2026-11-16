import type { DashboardAuditSummary } from "@/server/features/dashboard/services/DashboardService";

export function summarizeAuditCoverage(audit: DashboardAuditSummary): string {
  const pages = `${audit.pagesCrawled.toLocaleString()} ${audit.pagesCrawled === 1 ? "page" : "pages"}`;
  if (audit.status === "running")
    return `Crawl in progress. ${pages} crawled so far.`;
  if (audit.status === "failed")
    return `Crawl failed after ${pages}. Results may be incomplete.`;
  if (!audit.pagesCrawled) return "Crawl finished without checking any pages.";
  if (!audit.totalIssueTypes)
    return `No issues detected on the ${pages} crawled.`;
  return `${pages} crawled. ${audit.totalIssueTypes.toLocaleString()} issue ${audit.totalIssueTypes === 1 ? "type" : "types"} detected.`;
}
