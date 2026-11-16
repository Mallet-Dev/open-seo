import { Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { isHttpUrl } from "@/client/components/Markdown";
import {
  analysisFieldLabel as label,
  formatAnalysisValue as format,
} from "./analysisFields";
import type { SearchAnalysisResult } from "@/server/features/search-intelligence/SearchIntelligenceService";
type Ready = Extract<SearchAnalysisResult, { status: "ready" }>;

export function AnalysisEvidence({
  result,
  projectId,
  active,
  activeIndex,
  dimensions,
  metrics,
  currency,
  dates,
  property,
}: {
  result: Ready;
  projectId: string;
  active: Record<string, string | number | null> | undefined;
  activeIndex: number | undefined;
  dimensions: string[];
  metrics: string[];
  currency: string | null;
  dates: { startDate: string; endDate: string };
  property: string;
}) {
  const opportunity =
    result.kind === "opportunities" && activeIndex !== undefined
      ? result.report.rows[activeIndex]
      : undefined;
  return (
    <aside
      className="analysis-detail"
      aria-label="Selected row evidence"
      aria-live="polite"
    >
      <header>
        <FileText size={16} aria-hidden="true" />
        <h2>Evidence</h2>
      </header>
      {active ? (
        <>
          <h3 key={activeIndex}>
            {dimensions
              .map((field) => String(active[field] ?? "Unknown"))
              .join(" · ")}
          </h3>
          <dl>
            {[
              ...metrics,
              ...(result.kind === "opportunities" ? ["joinStatus"] : []),
            ].map((field) => (
              <div key={field}>
                <dt>{label(field)}</dt>
                <dd>{format(active[field], field, currency)}</dd>
              </div>
            ))}
          </dl>
          {opportunity && (
            <div className="analysis-opportunity">
              {opportunity.scoreComponents && (
                <section aria-label="Priority score breakdown">
                  <h4>How this page scored</h4>
                  <dl>
                    {(
                      [
                        [
                          "Search demand",
                          opportunity.scoreComponents.demand,
                          50,
                        ],
                        [
                          result.kind === "opportunities" &&
                          result.report.scoring.engagementFallback
                            ? "Engagement rate"
                            : "Key event rate",
                          opportunity.scoreComponents.businessValue,
                          30,
                        ],
                        [
                          "Observed position",
                          opportunity.scoreComponents.reachability,
                          20,
                        ],
                      ] as const
                    ).map(([name, component, weight]) => (
                      <div key={name}>
                        <dt>{name}</dt>
                        <dd>
                          {Number((component * weight).toFixed(1))} / {weight}{" "}
                          points
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}
              {isHttpUrl(opportunity.page) && (
                <Link
                  className="maps-action maps-action-secondary"
                  to="/p/$projectId/performance"
                  params={{ projectId }}
                  search={{
                    page: opportunity.page,
                    startDate: dates.startDate,
                    endDate: dates.endDate,
                  }}
                >
                  Inspect landing-page outcomes
                </Link>
              )}
            </div>
          )}
        </>
      ) : (
        <p>Select a result to inspect its evidence.</p>
      )}
      <div className="analysis-detail-source">
        <span>{property}</span>
        <span>
          {dates.startDate} to {dates.endDate}
        </span>
        {result.kind === "opportunities" && (
          <>
            <span>GSC: {result.report.source.searchConsoleSiteUrl}</span>
            <span>
              GSC time zone: {result.report.request.searchConsoleTimeZone}
            </span>
            <p>
              Priority combines demand (50%), outcome proxy (30%) and observed
              position (20%). Missing matches stay unscored.
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
