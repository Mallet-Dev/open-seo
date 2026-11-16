import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSearchAnalysis } from "@/serverFunctions/searchIntelligence";
import type { SearchAnalysisInput } from "@/server/features/search-intelligence/SearchIntelligenceService";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { AnalysisReport } from "./AnalysisReport";

const reportKinds = [
  { value: "opportunities", label: "Search opportunities" },
  { value: "landing_pages", label: "Landing pages" },
  { value: "page_performance", label: "Page performance" },
  { value: "key_events", label: "Key events" },
  { value: "traffic_acquisition", label: "Traffic acquisition" },
  { value: "ecommerce_performance", label: "Ecommerce" },
  { value: "site_search", label: "Site search" },
  { value: "audience_breakdown", label: "Audience" },
] as const;
const unavailable: Record<string, string> = {
  gsc_not_connected:
    "Connect Search Console to match search visibility with Analytics outcomes.",
  ga4_not_connected: "Connect Google Analytics to see this report.",
  ga4_reconnect_required:
    "The Google Analytics connection needs to be renewed.",
  ga4_property_inaccessible:
    "The connected Analytics property is no longer accessible.",
  ga4_report_incompatible:
    "This report is not available for the connected property.",
  ga4_quota_exhausted:
    "Google Analytics has reached its reporting quota. Try again after the quota resets.",
  ga4_upstream_unavailable: "Google Analytics is temporarily unavailable.",
  ga4_malformed_response:
    "Google Analytics returned an incomplete response. Try again later.",
  validation_error: "Check the report dates and filters.",
};
export function AnalysisPage({
  projectId,
  pageFocus,
  initialStartDate,
  initialEndDate,
}: {
  projectId: string;
  pageFocus?: string;
  initialStartDate?: string;
  initialEndDate?: string;
}) {
  const [kind, setKind] = useState<SearchAnalysisInput["kind"]>(
    pageFocus ? "landing_pages" : "opportunities",
  );
  const [channel, setChannel] =
    useState<SearchAnalysisInput["channel"]>("organic_search");
  const [startDate, setStartDate] = useState(initialStartDate ?? "");
  const [endDate, setEndDate] = useState(initialEndDate ?? "");
  const [request, setRequest] = useState<SearchAnalysisInput | null>(null);
  const query = useQuery({
    queryKey: ["searchAnalysis", projectId, request],
    queryFn: () => getSearchAnalysis({ data: request! }),
    enabled: request !== null,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  return (
    <main className="search-workspace">
      <header className="search-workspace-header">
        <div>
          <h1>Performance evidence</h1>
        </div>
        <Link
          className="maps-action maps-action-secondary"
          to="/p/$projectId/settings/integrations"
          params={{ projectId }}
        >
          Sources
        </Link>
      </header>
      <form
        className="analysis-report-form"
        onSubmit={(event) => {
          event.preventDefault();
          const nextRequest: SearchAnalysisInput = {
            projectId,
            kind,
            channel: kind === "opportunities" ? "organic_search" : channel,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            offset: 0,
          };
          if (JSON.stringify(request) === JSON.stringify(nextRequest))
            void query.refetch();
          else setRequest(nextRequest);
        }}
      >
        <label>
          Report
          <select
            value={kind}
            onChange={(event) => {
              const selected = reportKinds.find(
                (item) => item.value === event.target.value,
              );
              if (selected) setKind(selected.value);
            }}
          >
            {reportKinds.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Start date
          <input
            type="date"
            value={startDate}
            required={!!endDate}
            max={endDate || undefined}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>
        <label>
          End date
          <input
            type="date"
            value={endDate}
            required={!!startDate}
            min={startDate || undefined}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>
        {kind !== "opportunities" && (
          <label>
            Channel
            <select
              value={channel}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "organic_search" || value === "all")
                  setChannel(value);
              }}
            >
              <option value="organic_search">Organic search</option>
              <option value="all">All channels</option>
            </select>
          </label>
        )}
        <button
          className="maps-action"
          type="submit"
          disabled={query.isFetching}
        >
          {query.isFetching ? "Loading…" : "Load report"}
        </button>
      </form>
      {pageFocus && kind === "landing_pages" && !request && (
        <p className="analysis-page-focus">
          <span>Landing page: {pageFocus}</span>
        </p>
      )}
      {!request && (
        <p className="maps-status">
          No report loaded. Blank dates use the source’s latest complete
          reporting period.
        </p>
      )}
      {query.isError && (
        <p className="maps-error" role="alert">
          {getStandardErrorMessage(query.error)}
        </p>
      )}
      {query.isFetching && (
        <p className="maps-status" role="status">
          Loading the selected report…
        </p>
      )}
      {!query.isFetching && query.data?.status === "unavailable" && (
        <div className="maps-empty" role="status">
          <h2>Report unavailable</h2>
          <p>
            {unavailable[query.data.code] ??
              "This report is temporarily unavailable."}
          </p>
        </div>
      )}
      {!query.isFetching && query.data?.status === "ready" && (
        <AnalysisReport
          key={JSON.stringify(request)}
          result={query.data}
          projectId={projectId}
          receivedAt={query.dataUpdatedAt}
          pageFocus={request?.kind === "landing_pages" ? pageFocus : undefined}
          onPage={(offset) =>
            setRequest((previous) =>
              previous ? { ...previous, offset } : previous,
            )
          }
        />
      )}
    </main>
  );
}
