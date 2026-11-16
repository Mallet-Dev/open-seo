import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { summarizeAuditCoverage } from "./auditCoverage";
import { SearchConsoleConnectionCard } from "@/client/features/gsc/SearchConsoleConnectionCard";
import { AUDIT_ISSUE_TYPES } from "@/shared/audit-issues";

import {
  formatCount,
  formatCtr,
  formatPosition,
} from "@/client/features/search-performance/SearchPerformanceColumns";
import { getSearchPerformanceReport } from "@/serverFunctions/searchPerformance";
import {
  CardShell,
  EmptyCardBody,
  formatDay,
  moreDetailsClass,
  newLost,
  PercentDelta,
  Stat,
} from "@/client/features/dashboard/cardParts";
import type {
  DashboardAuditSummary,
  DashboardBacklinkSummary,
} from "@/server/features/dashboard/services/DashboardService";

// Plain string-keyed view of the registry: issue types from the DB are not
// statically guaranteed to be registry keys.
const issueTitles: Record<string, string | undefined> = Object.fromEntries(
  Object.entries(AUDIT_ISSUE_TYPES).map(([key, value]) => [key, value.title]),
);

export function GscCard({
  projectId,
  connected,
}: {
  projectId: string;
  connected: boolean;
}) {
  const reportQuery = useQuery({
    queryKey: ["dashboardGscReport", projectId],
    queryFn: () =>
      getSearchPerformanceReport({
        data: { projectId, dateRange: "last_28_days" },
      }),
    enabled: connected,
  });

  // Not connected (or a dead grant discovered by the report call): the
  // connection card sells and runs the whole flow itself.
  if (!connected || (reportQuery.data && !reportQuery.data.connected)) {
    return (
      <div id="connect-gsc">
        <SearchConsoleConnectionCard projectId={projectId} />
      </div>
    );
  }

  const report = reportQuery.data;

  return (
    <CardShell
      title="Search performance"
      stamp="Google Search Console · last 28 days"
      action={
        <Link
          to="/p/$projectId/search-performance"
          params={{ projectId }}
          className={moreDetailsClass}
        >
          Open search report
        </Link>
      }
    >
      {reportQuery.isPending ? (
        <div className="grid grid-cols-2 gap-3" aria-busy>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton h-20" />
          ))}
        </div>
      ) : reportQuery.isError ? (
        <p className="text-sm text-base-content/60">
          Couldn&rsquo;t load Search Console data.{" "}
          <button
            type="button"
            className="link link-primary"
            onClick={() => void reportQuery.refetch()}
          >
            Retry report
          </button>
        </p>
      ) : report?.connected ? (
        <div className="grid grid-cols-2 gap-3">
          <Stat
            label="Clicks"
            value={formatCount(report.totals.clicks)}
            sub={
              <PercentDelta
                current={report.totals.clicks}
                previous={report.prevTotals.clicks}
              />
            }
          />
          <Stat
            label="Impressions"
            value={formatCount(report.totals.impressions)}
            sub={
              <PercentDelta
                current={report.totals.impressions}
                previous={report.prevTotals.impressions}
              />
            }
          />
          <Stat label="CTR" value={formatCtr(report.totals.ctr)} />
          <Stat
            label="Avg position"
            value={formatPosition(report.totals.position)}
          />
        </div>
      ) : null}
    </CardShell>
  );
}

export function AuditHealthCard({
  projectId,
  audit,
}: {
  projectId: string;
  audit: DashboardAuditSummary | null;
}) {
  if (!audit) {
    return (
      <CardShell title="Site audit">
        <EmptyCardBody
          message="No crawl is saved. Check pages for broken links, missing tags and indexing issues."
          cta={
            <Link
              to="/p/$projectId/audit"
              params={{ projectId }}
              className="btn btn-primary btn-sm"
            >
              Open site audit
            </Link>
          }
        />
      </CardShell>
    );
  }

  return (
    <CardShell
      title="Site audit"
      stamp={`Started ${formatDay(audit.startedAt)}`}
      action={
        <Link
          to="/p/$projectId/audit"
          params={{ projectId }}
          className={moreDetailsClass}
        >
          Open crawl
        </Link>
      }
    >
      <p
        role={audit.status === "running" ? "status" : undefined}
        className="text-sm text-base-content/80"
      >
        {summarizeAuditCoverage(audit)}
      </p>
      {audit.topIssues.length > 0 && (
        <ul className="mt-3 space-y-2">
          {audit.topIssues.map((issue) => (
            <li
              key={issue.issueType}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={`size-2 shrink-0 rounded-full ${
                    issue.severity === "critical"
                      ? "bg-error"
                      : issue.severity === "warning"
                        ? "bg-warning"
                        : "bg-base-content/30"
                  }`}
                />
                <span>
                  <span className="sr-only">{issue.severity}: </span>
                  {issueTitles[issue.issueType] ?? issue.issueType}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-base-content/60">
                {issue.count} {issue.count === 1 ? "page" : "pages"}
              </span>
            </li>
          ))}
          {audit.totalIssueTypes > audit.topIssues.length ? (
            <li className="text-xs text-base-content/50">
              + {audit.totalIssueTypes - audit.topIssues.length} more issue
              {audit.totalIssueTypes - audit.topIssues.length === 1 ? "" : "s"}
            </li>
          ) : null}
        </ul>
      )}
    </CardShell>
  );
}

export function BacklinkPulseCard({
  projectId,
  domain,
  terms,
  onCheck,
  backlinks,
  refreshing,
  onRefresh,
  refreshError,
  refreshResult,
}: {
  projectId: string;
  domain: string;
  terms: {
    estimatedChargeUsd: number;
    estimatedCredits: number | null;
    nextAttemptAt: string | null;
  };
  onCheck: () => void;
  backlinks: DashboardBacklinkSummary | null;
  refreshing: boolean;
  onRefresh: () => void;
  refreshError: string | null;
  refreshResult: DashboardBacklinkSummary | null | undefined;
}) {
  const estimate =
    terms.estimatedCredits !== null
      ? `${terms.estimatedCredits.toLocaleString()} ${terms.estimatedCredits === 1 ? "credit" : "credits"}`
      : terms.estimatedChargeUsd.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
          maximumFractionDigits: 6,
        }) + " USD";
  const showRefresh = !backlinks || backlinks.stale;
  return (
    <CardShell
      title="Backlink snapshot"
      stamp={
        backlinks
          ? `${backlinks.domain} · ${formatDay(backlinks.capturedAt)}${backlinks.stale ? " · At least 24 hours old" : ""}`
          : undefined
      }
      action={
        <Link
          to="/p/$projectId/backlinks"
          params={{ projectId }}
          search={{}}
          className={moreDetailsClass}
        >
          Open backlinks
        </Link>
      }
    >
      {backlinks ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Stat
            label="Referring domains"
            value={
              backlinks.referringDomains?.toLocaleString() ?? "Unavailable"
            }
          />
          <Stat
            label="Backlinks"
            value={backlinks.backlinks?.toLocaleString() ?? "Unavailable"}
          />
          <Stat label="New links" value={newLost(backlinks.newBacklinks)} />
          <Stat label="Lost links" value={newLost(backlinks.lostBacklinks)} />
        </div>
      ) : (
        <p className="text-sm text-base-content/75">
          No snapshot saved for {domain}.
        </p>
      )}
      {showRefresh && (
        <div className="mt-3 space-y-2">
          {terms.nextAttemptAt ? (
            <>
              <p className="text-xs text-base-content/75">
                Next request available{" "}
                {new Date(terms.nextAttemptAt).toLocaleString()}.
              </p>
              <button type="button" className="btn btn-sm" onClick={onCheck}>
                Check availability
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-base-content/75">
                DataForSEO estimate for {domain}: {estimate}.
              </p>
              <button
                type="button"
                disabled={refreshing}
                className="btn btn-sm"
                onClick={onRefresh}
              >
                {refreshing
                  ? "Requesting snapshot…"
                  : backlinks
                    ? "Refresh paid snapshot"
                    : "Request paid snapshot"}
              </button>
            </>
          )}
        </div>
      )}
      {refreshError && (
        <p role="alert" className="mt-3 text-sm">
          {refreshError}
        </p>
      )}
      {!refreshError && !refreshing && refreshResult !== undefined && (
        <p role="status" className="mt-3 text-sm">
          {!refreshResult || refreshResult.stale
            ? "No new snapshot was saved."
            : "Snapshot available."}
        </p>
      )}
    </CardShell>
  );
}
