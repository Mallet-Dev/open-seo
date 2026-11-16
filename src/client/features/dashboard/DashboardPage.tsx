import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronDown,
  Globe,
  MapPin,
  Search,
  Settings2,
} from "lucide-react";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  AuditHealthCard,
  BacklinkPulseCard,
  GscCard,
} from "@/client/features/dashboard/DashboardCards";
import {
  CardShell,
  Stat,
  moreDetailsClass,
  formatDay,
} from "@/client/features/dashboard/cardParts";
import { Ga4Card } from "@/client/features/dashboard/Ga4Card";
import { McpConnectCard } from "@/client/features/dashboard/McpConnectCard";
import { WorkspaceMergeBanner } from "@/client/features/dashboard/WorkspaceMergeBanner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  getDashboardActivation,
  getDashboardOverview,
  markDashboardCompetitorClicked,
  refreshDashboardBacklinkSnapshot,
} from "@/serverFunctions/dashboard";
import { setProjectDomain } from "@/serverFunctions/projects";

function DomainForm({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const [value, setValue] = useState("");
  const domain = value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "");
  const save = useMutation({
    mutationFn: () => setProjectDomain({ data: { projectId, domain } }),
    onSuccess: async () => {
      await Promise.all(
        [
          ["dashboardActivation", projectId],
          ["dashboardOverview", projectId],
          ["projects"],
        ].map((queryKey) => client.invalidateQueries({ queryKey })),
      );
    },
  });
  return (
    <form
      className="overview-domain"
      onSubmit={(e) => {
        e.preventDefault();
        if (!domain || save.isPending) return;
        captureClientEvent("dashboard:next_move_click", { step: "domain" });
        save.mutate();
      }}
    >
      <label htmlFor="overview-domain" className="font-semibold">
        Project website
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          id="overview-domain"
          className="input input-bordered min-w-0 flex-1"
          aria-describedby={save.isError ? "domain-save-error" : undefined}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (save.isError) save.reset();
          }}
          placeholder="example.com"
          autoCapitalize="none"
          autoComplete="url"
          spellCheck={false}
          required
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!domain || save.isPending}
        >
          {save.isPending ? "Saving…" : "Save website"}
        </button>
      </div>
      {save.isError && (
        <p role="alert" id="domain-save-error" className="mt-2 text-sm">
          {getStandardErrorMessage(save.error, "Could not save this website.")}
        </p>
      )}
    </form>
  );
}

function Investigations({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const competitor = useMutation({
    mutationFn: () => markDashboardCompetitorClicked({ data: { projectId } }),
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: ["dashboardActivation", projectId],
      });
    },
  });
  const links = [
    {
      to: "/p/$projectId/keywords",
      icon: Search,
      title: "Research keywords",
      detail: "Find related searches and compare demand.",
    },
    {
      to: "/p/$projectId/maps",
      icon: MapPin,
      title: "Explore local rankings",
      detail: "See how map results change by location.",
    },
    {
      to: "/p/$projectId/domain",
      icon: Globe,
      title: "Investigate a competitor",
      detail: "Find the pages and terms a domain ranks for.",
    },
  ] as const;
  return (
    <nav
      className="overview-investigations"
      aria-label="Start an investigation"
    >
      {links.map(({ to, icon: Icon, title, detail }) => (
        <Link
          key={to}
          to={to}
          search={{}}
          params={{ projectId }}
          onClick={
            to.endsWith("/domain")
              ? () => {
                  captureClientEvent("dashboard:next_move_click", {
                    step: "competitor",
                  });
                  competitor.mutate();
                }
              : undefined
          }
        >
          <Icon className="overview-action-icon" aria-hidden="true" />
          <span>
            <strong>{title}</strong>
            <small>{detail}</small>
          </span>
          <ArrowRight className="overview-action-arrow" aria-hidden="true" />
        </Link>
      ))}
    </nav>
  );
}

function RankingSummary({
  projectId,
  rank,
}: {
  projectId: string;
  rank: NonNullable<Awaited<ReturnType<typeof getDashboardOverview>>["rank"]>;
}) {
  return (
    <CardShell
      title="Tracked rankings"
      action={
        <Link
          to="/p/$projectId/rank-tracking"
          params={{ projectId }}
          search={{}}
          className={moreDetailsClass}
        >
          Open rankings
        </Link>
      }
      stamp={`${rank.includedConfigCount} of ${rank.totalConfigCount} tracking configurations${rank.lastCheckedAt ? " · Last observation " + formatDay(rank.lastCheckedAt) : ""}`}
    >
      <div className="grid grid-cols-2 gap-4">
        <Stat
          label="Keyword entries"
          value={rank.trackedKeywords.toLocaleString()}
        />
        {rank.observedPositions > 0 && (
          <Stat label="Top 10 positions" value={rank.top10.toLocaleString()} />
        )}
      </div>
      <p className="mt-3 text-sm text-base-content/75">
        {rank.observedPositions > 0
          ? `${rank.observedPositions.toLocaleString()} ranked results across desktop and mobile.`
          : "No ranked positions available in the latest results."}
      </p>
    </CardShell>
  );
}

export function DashboardPage({ projectId }: { projectId: string }) {
  return <Overview key={projectId} projectId={projectId} />;
}

function Overview({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const activationQuery = useQuery({
    queryKey: ["dashboardActivation", projectId],
    queryFn: () => getDashboardActivation({ data: { projectId } }),
  });
  const overviewQuery = useQuery({
    queryKey: ["dashboardOverview", projectId],
    queryFn: () => getDashboardOverview({ data: { projectId } }),
  });
  const refresh = useMutation({
    mutationFn: ({
      confirmedDomain,
      estimatedChargeUsd,
      estimatedCredits,
    }: {
      confirmedDomain: string;
      estimatedChargeUsd: number;
      estimatedCredits: number | null;
    }) =>
      refreshDashboardBacklinkSnapshot({
        data: {
          projectId,
          confirmedDomain,
          estimatedChargeUsd,
          estimatedCredits,
        },
      }),
    onSettled: async () => {
      await client.invalidateQueries({
        queryKey: ["dashboardOverview", projectId],
      });
    },
  });
  const activation = activationQuery.data;
  const overview = overviewQuery.data;
  const showGa4Setup =
    activation && !activation.ga4.connected && !activation.ga4.cardDismissedAt;
  const showAgentSetup =
    activation &&
    !activation.mcp.firstToolCallAt &&
    !activation.mcp.cardDismissedAt;
  const [expanded, setExpanded] = useState(false);
  return (
    <main className="overview-page">
      <div className="overview-inner">
        <header className="overview-heading">
          <div>
            <h1>Project overview</h1>
            {activation?.domain && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-base-content/75">
                <Globe className="size-4" aria-hidden="true" />
                {activation.domain}
              </p>
            )}
          </div>
          <Link
            to="/p/$projectId/settings"
            params={{ projectId }}
            className="btn btn-sm"
          >
            <Settings2 className="size-4" aria-hidden="true" />
            Project settings
          </Link>
        </header>
        <WorkspaceMergeBanner />
        {activationQuery.isError && (
          <div className="alert alert-error" role="alert">
            <span>
              {getStandardErrorMessage(
                activationQuery.error,
                "Project settings could not be loaded.",
              )}
            </span>
            <button
              className="btn btn-sm"
              onClick={() => void activationQuery.refetch()}
            >
              Retry settings
            </button>
          </div>
        )}
        {activation && !activation.domain && (
          <DomainForm key={projectId} projectId={projectId} />
        )}
        <Investigations projectId={projectId} />
        <section aria-labelledby="overview-reports">
          <h2 className="overview-section-title" id="overview-reports">
            Project reports
          </h2>
          {overviewQuery.isError && (
            <div className="alert alert-error mb-4" role="alert">
              <span>
                {getStandardErrorMessage(
                  overviewQuery.error,
                  "Saved reports could not be loaded.",
                )}
              </span>
              <button
                className="btn btn-sm"
                onClick={() => void overviewQuery.refetch()}
              >
                Retry reports
              </button>
            </div>
          )}
          <div className="overview-report-grid">
            {overviewQuery.isPending && (
              <div role="status" className="skeleton h-36">
                <span className="sr-only">Loading saved reports</span>
              </div>
            )}
            {overview?.rank && (
              <RankingSummary projectId={projectId} rank={overview.rank} />
            )}
            {overview && (
              <AuditHealthCard projectId={projectId} audit={overview.audit} />
            )}
            {overview && activation?.domain && (
              <BacklinkPulseCard
                projectId={projectId}
                domain={activation.domain}
                terms={overview.backlinkRefresh}
                onCheck={() => void overviewQuery.refetch()}
                backlinks={overview.backlinks}
                refreshing={refresh.isPending}
                onRefresh={() => {
                  if (activation.domain)
                    refresh.mutate({
                      confirmedDomain: activation.domain,
                      estimatedChargeUsd:
                        overview.backlinkRefresh.estimatedChargeUsd,
                      estimatedCredits:
                        overview.backlinkRefresh.estimatedCredits,
                    });
                }}
                refreshError={
                  refresh.isError
                    ? getStandardErrorMessage(
                        refresh.error,
                        "The snapshot could not be refreshed.",
                      )
                    : null
                }
                refreshResult={refresh.isSuccess ? refresh.data : undefined}
              />
            )}
            {activation?.gsc.connected && (
              <GscCard projectId={projectId} connected />
            )}
            {activation?.ga4.connected && (
              <Ga4Card projectId={projectId} connected />
            )}
          </div>
        </section>
        {activation &&
          (!activation.gsc.connected || showGa4Setup || showAgentSetup) && (
            <details
              className="overview-connections"
              onToggle={(e) => setExpanded(e.currentTarget.open)}
            >
              <summary>
                <span>Connect data sources and tools</span>
                <ChevronDown aria-hidden="true" className="size-4" />
              </summary>
              {expanded && (
                <div className="overview-report-grid">
                  {!activation.gsc.connected && (
                    <GscCard projectId={projectId} connected={false} />
                  )}
                  {showGa4Setup && (
                    <Ga4Card projectId={projectId} connected={false} />
                  )}
                  {showAgentSetup && (
                    <McpConnectCard
                      projectId={projectId}
                      activation={activation}
                    />
                  )}
                </div>
              )}
            </details>
          )}
      </div>
    </main>
  );
}
