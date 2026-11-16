import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import {
  applyBillingMarkupUsd,
  AUTUMN_SEO_DATA_CREDITS_PER_USD,
} from "@/shared/billing";
import type { DashboardBacklinkRefreshInput } from "@/types/schemas/dashboard";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { ActivationRepository } from "@/server/features/activation/repositories/ActivationRepository";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import { getIssueTypePageCountsForAudit } from "@/server/features/audit/repositories/auditSummaryQueries";
import { BacklinkSnapshotRepository } from "@/server/features/dashboard/repositories/BacklinkSnapshotRepository";
import { Ga4ConnectionRepository } from "@/server/features/ga4/repositories/Ga4ConnectionRepository";
import { GscConnectionRepository } from "@/server/features/gsc/repositories/GscConnectionRepository";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { getLatestResults } from "@/server/features/rank-tracking/services/rankTrackingResults";
import {
  createDataforseoClient,
  normalizeBacklinksTarget,
} from "@/server/lib/dataforseo";

// A paid attempt stays held for the daily cadence, including uncertain outcomes.
const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Bounds the per-config result reads on the overview path; projects rarely
// have more than a couple of configs.
const MAX_CONFIGS_FOR_OVERVIEW = 5;

export type DashboardActivation = {
  domain: string | null;
  ga4: {
    connected: boolean;
    propertyDisplayName: string | null;
    cardDismissedAt: string | null;
  };
  gsc: { connected: boolean; siteUrl: string | null };
  mcp: {
    authorizedAt: string | null;
    firstToolCallAt: string | null;
    cardDismissedAt: string | null;
  };
  competitorClickedAt: string | null;
};

type DashboardRankSummary = {
  trackedKeywords: number;
  includedConfigCount: number;
  totalConfigCount: number;
  observedPositions: number;
  improved: number;
  declined: number;
  top10: number;
  lastCheckedAt: string | null;
};

export type DashboardAuditSummary = {
  status: "running" | "completed" | "failed";
  pagesCrawled: number;
  startedAt: string;
  // Top issue types by severity then affected-page count, for the card's list.
  topIssues: {
    issueType: string;
    severity: "critical" | "warning" | "info";
    count: number;
  }[];
  totalIssueTypes: number;
};

export type DashboardBacklinkSummary = {
  domain: string;
  rank: number | null;
  backlinks: number | null;
  referringDomains: number | null;
  newBacklinks: number | null;
  lostBacklinks: number | null;
  newReferringDomains: number | null;
  lostReferringDomains: number | null;
  capturedAt: string;
  stale: boolean;
};

type DashboardOverview = {
  rank: DashboardRankSummary | null;
  audit: DashboardAuditSummary | null;
  backlinks: DashboardBacklinkSummary | null;
  backlinkRefresh: ReturnType<typeof estimateBacklinkRefresh> & {
    nextAttemptAt: string | null;
  };
};

function estimateBacklinkRefresh(hosted: boolean) {
  // One standard request with a single result: https://dataforseo.com/pricing/backlinks/backlinks
  const providerUsd = 0.024036;
  const estimatedChargeUsd = hosted
    ? applyBillingMarkupUsd(providerUsd)
    : providerUsd;
  return {
    estimatedChargeUsd,
    estimatedCredits: hosted
      ? Math.ceil(estimatedChargeUsd * AUTUMN_SEO_DATA_CREDITS_PER_USD)
      : null,
  };
}

async function getActivation(input: {
  projectId: string;
  organizationId: string;
  domain: string | null;
}): Promise<DashboardActivation> {
  const [ga4, gsc, orgActivation, projectActivation] = await Promise.all([
    Ga4ConnectionRepository.getByProjectId(input.projectId),
    GscConnectionRepository.getByProjectId(input.projectId),
    ActivationRepository.getOrganizationActivation(input.organizationId),
    ActivationRepository.getProjectActivation(input.projectId),
  ]);

  return {
    domain: input.domain,
    ga4: {
      connected: ga4 !== null,
      propertyDisplayName: ga4?.propertyDisplayName ?? null,
      cardDismissedAt: projectActivation?.ga4CardDismissedAt ?? null,
    },
    gsc: { connected: gsc !== null, siteUrl: gsc?.siteUrl ?? null },
    mcp: {
      authorizedAt: orgActivation?.firstMcpAuthorizedAt ?? null,
      firstToolCallAt: orgActivation?.firstMcpToolCallAt ?? null,
      cardDismissedAt: projectActivation?.mcpCardDismissedAt ?? null,
    },
    competitorClickedAt: projectActivation?.competitorStepClickedAt ?? null,
  };
}

async function getOverview(input: {
  projectId: string;
  domain: string | null;
}): Promise<DashboardOverview> {
  const [rank, audit, backlinks, lastAttempt, hosted] = await Promise.all([
    getRankSummary(input.projectId),
    getAuditSummary(input.projectId),
    getBacklinkSummary(input.projectId, input.domain),
    input.domain
      ? BacklinkSnapshotRepository.lastAttempt(input.projectId, input.domain)
      : null,
    isHostedServerAuthMode(),
  ]);
  const nextAttemptMs = lastAttempt
    ? Date.parse(lastAttempt) + SNAPSHOT_MAX_AGE_MS
    : 0;
  return {
    rank,
    audit,
    backlinks,
    backlinkRefresh: {
      ...estimateBacklinkRefresh(hosted),
      nextAttemptAt:
        nextAttemptMs > Date.now()
          ? new Date(nextAttemptMs).toISOString()
          : null,
    },
  };
}

async function getRankSummary(
  projectId: string,
): Promise<DashboardRankSummary | null> {
  const configs = await RankTrackingRepository.getConfigsForProject(projectId);
  if (configs.length === 0) return null;

  const results = await Promise.all(
    configs
      .slice(0, MAX_CONFIGS_FOR_OVERVIEW)
      .map((config) => getLatestResults(config.id, projectId, "7d")),
  );

  const summary: DashboardRankSummary = {
    trackedKeywords: 0,
    includedConfigCount: results.length,
    totalConfigCount: configs.length,
    observedPositions: 0,
    improved: 0,
    declined: 0,
    top10: 0,
    lastCheckedAt: null,
  };

  for (const result of results) {
    summary.trackedKeywords += result.rows.length;
    if (
      result.run?.lastCheckedAt &&
      (!summary.lastCheckedAt ||
        result.run.lastCheckedAt > summary.lastCheckedAt)
    ) {
      summary.lastCheckedAt = result.run.lastCheckedAt;
    }
    for (const row of result.rows) {
      for (const device of ["desktop", "mobile"] as const) {
        const { position, previousPosition } = row[device];
        if (position !== null) summary.observedPositions += 1;
        if (position !== null && position <= 10) summary.top10 += 1;
        if (position === null || previousPosition === null) continue;
        // Lower position number = better ranking.
        if (position < previousPosition) summary.improved += 1;
        else if (position > previousPosition) summary.declined += 1;
      }
    }
  }

  return summary;
}

async function getAuditSummary(
  projectId: string,
): Promise<DashboardAuditSummary | null> {
  const audit = await AuditRepository.getLatestAuditForProject(projectId);
  if (!audit) return null;

  const typeRows = await getIssueTypePageCountsForAudit(audit.id);

  const severityRank = { critical: 0, warning: 1, info: 2 };
  const sorted = typeRows
    .map((row) => ({
      issueType: row.issueType,
      severity: row.severity,
      count: row.pages,
    }))
    .toSorted(
      (a, b) =>
        severityRank[a.severity] - severityRank[b.severity] ||
        b.count - a.count,
    );

  return {
    status: audit.status,
    pagesCrawled: audit.pagesCrawled,
    startedAt: audit.startedAt,
    topIssues: sorted.slice(0, 3),
    totalIssueTypes: sorted.length,
  };
}

function isSnapshotFresh(capturedAt: string): boolean {
  const capturedMs = Date.parse(capturedAt);
  if (Number.isNaN(capturedMs)) return false;
  return Date.now() - capturedMs < SNAPSHOT_MAX_AGE_MS;
}

async function getBacklinkSummary(
  projectId: string,
  domain: string | null,
): Promise<DashboardBacklinkSummary | null> {
  if (!domain) return null;
  const snapshot = await BacklinkSnapshotRepository.getLatestForDomain(
    projectId,
    domain,
  );
  if (!snapshot) return null;
  return {
    domain: snapshot.domain,
    rank: snapshot.rank,
    backlinks: snapshot.backlinks,
    referringDomains: snapshot.referringDomains,
    newBacklinks: snapshot.newBacklinks,
    lostBacklinks: snapshot.lostBacklinks,
    newReferringDomains: snapshot.newReferringDomains,
    lostReferringDomains: snapshot.lostReferringDomains,
    capturedAt: snapshot.capturedAt,
    stale: !isSnapshotFresh(snapshot.capturedAt),
  };
}

async function ensureBacklinkSnapshot(
  input: DashboardBacklinkRefreshInput & {
    domain: string | null;
    billingCustomer: BillingCustomerContext;
  },
): Promise<DashboardBacklinkSummary | null> {
  const { projectId, domain } = input;
  const estimate = estimateBacklinkRefresh(await isHostedServerAuthMode());
  if (
    !domain ||
    input.confirmedDomain !== domain ||
    estimate.estimatedChargeUsd !== input.estimatedChargeUsd ||
    estimate.estimatedCredits !== input.estimatedCredits
  ) {
    throw new AppError("CONFLICT");
  }
  const latest = await getBacklinkSummary(projectId, domain);
  if (latest && !latest.stale) return latest;

  const normalized = normalizeBacklinksTarget(domain, { scope: "subdomains" });
  const dataforseo = createDataforseoClient(input.billingCustomer);
  const summary = await dataforseo.backlinks.summary({
    target: normalized.apiTarget,
    includeSubdomains: normalized.includeSubdomains,
    minimumCredits: estimate.estimatedCredits ?? undefined,
    beforeRequest: async () => {
      const now = Date.now();
      const claimed = await BacklinkSnapshotRepository.claim({
        projectId,
        domain,
        organizationId: input.billingCustomer.organizationId,
        attemptedAt: new Date(now).toISOString(),
        cutoff: new Date(now - SNAPSHOT_MAX_AGE_MS).toISOString(),
      });
      if (!claimed) throw new AppError("CONFLICT");
    },
  });
  await BacklinkSnapshotRepository.insert({
    projectId,
    domain,
    rank: summary.rank ?? null,
    backlinks: summary.backlinks ?? null,
    referringDomains: summary.referring_domains ?? null,
    brokenBacklinks: summary.broken_backlinks ?? null,
    newBacklinks: summary.new_backlinks ?? null,
    lostBacklinks: summary.lost_backlinks ?? null,
    newReferringDomains:
      summary.new_referring_domains ?? summary.new_reffering_domains ?? null,
    lostReferringDomains:
      summary.lost_referring_domains ?? summary.lost_reffering_domains ?? null,
    capturedAt: new Date().toISOString(),
  });
  return getBacklinkSummary(projectId, domain);
}

export const DashboardService = {
  getActivation,
  getOverview,
  ensureBacklinkSnapshot,
};
