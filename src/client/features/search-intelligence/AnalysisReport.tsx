import { AnalysisEvidence } from "./AnalysisEvidence";
import { AnalysisPagination } from "./AnalysisPagination";
import { buildAnalysisExport } from "./analysisExport";
import { downloadFile } from "@/client/lib/download";
import { normalizePageKey } from "@/shared/search-page";
import {
  analysisFieldLabel as label,
  formatAnalysisValue as format,
  reportQualityMessages,
  reportWarningMessage,
  reportDiagnosticMessages,
  selectAnalysisRows,
} from "./analysisFields";
import { useRef, useState } from "react";
import { Search } from "lucide-react";
import type { SearchAnalysisResult } from "@/server/features/search-intelligence/SearchIntelligenceService";

type Ready = Extract<SearchAnalysisResult, { status: "ready" }>;
export function AnalysisReport({
  result,
  projectId,
  receivedAt,
  onPage,
  pageFocus,
}: {
  result: Ready;
  projectId: string;
  receivedAt: number;
  pageFocus?: string;
  onPage: (offset: number) => void;
}) {
  const filterInput = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState(0);
  const [filter, setFilter] = useState("");
  const [focusEnabled, setFocusEnabled] = useState(Boolean(pageFocus));
  const focusedPage =
    pageFocus && focusEnabled ? normalizePageKey(pageFocus) : null;
  const isOpportunity = result.kind === "opportunities";
  const dimensions = isOpportunity
    ? ["page"]
    : result.report.request.dimensions;
  const metrics = isOpportunity
    ? ["clicks", "impressions", "position", "sessions", "keyEvents", "score"]
    : result.report.request.metrics;
  const rows: Record<string, string | number | null>[] =
    result.kind === "opportunities"
      ? result.report.rows.map((row) => ({
          page: row.page,
          clicks: row.clicks,
          impressions: row.impressions,
          position: row.position,
          sessions: row.ga4?.sessions ?? null,
          keyEvents: row.ga4?.keyEvents ?? null,
          score: row.score,
          joinStatus: row.joinStatus,
        }))
      : result.report.rows;
  const dates =
    result.kind === "opportunities"
      ? result.report.request.dateRange
      : result.report.request.resolvedDateRange;
  const cohort =
    result.kind === "opportunities" ||
    result.report.request.channel === "organic_search"
      ? "Organic search"
      : "All channels";
  const property =
    result.kind === "opportunities"
      ? (result.report.source.googleAnalyticsPropertyDisplayName ??
        result.report.source.googleAnalyticsPropertyId)
      : (result.report.source.propertyDisplayName ??
        result.report.source.propertyId);
  const zone =
    result.kind === "opportunities"
      ? result.report.request.googleAnalyticsTimeZone
      : result.report.request.propertyTimeZone;
  const currency =
    result.kind === "analytics" ? result.report.request.currencyCode : null;
  const limited = result.report.reportMetadata.hasLimitedData;
  const visible = selectAnalysisRows(rows, dimensions, filter, focusedPage);
  const activeIndex =
    visible.find(({ index }) => index === selected)?.index ?? visible[0]?.index;
  const active = activeIndex === undefined ? undefined : rows[activeIndex];
  const warnings = result.report.warnings.map(reportWarningMessage);
  const title =
    result.kind === "opportunities"
      ? "Search opportunities"
      : label(result.report.request.reportKind);
  const diagnostics =
    result.kind === "analytics"
      ? reportDiagnosticMessages(result.report.diagnostics)
      : [];
  const qualityDetails = reportQualityMessages(result.report.reportMetadata);
  const notices = [
    ...new Set([...warnings, ...qualityDetails, ...diagnostics]),
  ];
  const total =
    result.kind === "opportunities"
      ? result.report.totalCandidateRows
      : result.report.totalRowCount;
  function exportReport(exportFormat: "csv" | "json") {
    const fields = [
      ...dimensions,
      ...metrics,
      ...(isOpportunity ? ["joinStatus"] : []),
    ];
    downloadFile(
      buildAnalysisExport({
        result,
        projectId,
        fields,
        visibleRows: visible.map(({ row }) => row),
        filter,
        focusedPage,
        clientReceivedAt: new Date(receivedAt).toISOString(),
        exportedAt: new Date().toISOString(),
        format: exportFormat,
      }),
      `performance-${result.kind === "analytics" ? result.report.request.reportKind : "opportunities"}-${dates.startDate}-${dates.endDate}.${exportFormat}`,
      exportFormat === "csv" ? "text/csv" : "application/json",
    );
  }
  return (
    <section className="analysis-report" aria-label="First-party report">
      <div className="analysis-source">
        <div>
          <strong>{title}</strong>
          <span>{property}</span>
          <span>
            GA4:{" "}
            {result.kind === "opportunities"
              ? result.report.source.googleAnalyticsPropertyId
              : result.report.source.propertyId}
          </span>
          {currency && <span>Currency: {currency}</span>}
          <span>
            {dates.startDate} to {dates.endDate} · {zone} · {cohort}
          </span>
        </div>
        <span className="analysis-source-badge">
          {result.kind === "opportunities" ? "GSC + GA4" : "Google Analytics"}
        </span>
      </div>
      <div className="maps-toolbar" aria-label="Report exports">
        <button
          type="button"
          className="maps-action maps-action-secondary"
          disabled={!visible.length}
          onClick={() => exportReport("csv")}
        >
          Export visible CSV
        </button>
        <button
          type="button"
          className="maps-action maps-action-secondary"
          onClick={() => exportReport("json")}
        >
          Save report evidence (JSON)
        </button>
      </div>
      {(limited || notices.length > 0) && (
        <div className="analysis-notice" role="status">
          {limited && (
            <strong>
              Limited data: Google may omit, group, sample or restrict some
              results.
            </strong>
          )}
          {notices.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}
      {result.kind === "opportunities" && (
        <div className="maps-metrics analysis-coverage">
          <div>
            <span>Matched pages</span>
            <strong>{result.report.coverage.matchedRows}</strong>
            <p>GSC + GA4 in this input</p>
          </div>
          <div>
            <span>Unmatched search pages</span>
            <strong>{result.report.coverage.unmatchedGscRows}</strong>
            <p>Kept visible and unscored</p>
          </div>
          <div>
            <span>Priority method</span>
            <strong className="analysis-method-name">
              {result.report.scoring.engagementFallback
                ? "Engagement"
                : "Key event rate"}
            </strong>
            <p>Heuristic, not revenue</p>
          </div>
        </div>
      )}
      {focusedPage && (
        <div className="analysis-page-focus">
          <span>Focused page: {focusedPage}</span>
          <button
            type="button"
            onClick={() => {
              if (activeIndex !== undefined) setSelected(activeIndex);
              setFocusEnabled(false);
              filterInput.current?.focus();
            }}
          >
            Show all loaded pages
          </button>
        </div>
      )}
      <div className="analysis-body">
        <div className="analysis-table-panel">
          <div className="analysis-table-controls">
            <label className="analysis-filter">
              <Search size={15} aria-hidden="true" />
              <span className="analysis-sr-only">Filter this page</span>
              <input
                ref={filterInput}
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value);
                  setSelected(0);
                }}
                placeholder="Filter this page"
              />
            </label>
            <span>
              {visible.length} of {rows.length} loaded · {total}{" "}
              {isOpportunity ? "candidates" : "source rows"}
            </span>
          </div>
          <div
            className="analysis-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Report table"
          >
            <table>
              <thead>
                <tr>
                  {[...dimensions, ...metrics].map((field) => (
                    <th key={field} scope="col">
                      {label(field)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map(({ row, index }) => (
                  <tr
                    key={index}
                    className={activeIndex === index ? "is-selected" : ""}
                  >
                    {[...dimensions, ...metrics].map((field, column) => (
                      <td key={field}>
                        {column === 0 ? (
                          <button
                            className="analysis-row-select"
                            aria-pressed={activeIndex === index}
                            onClick={() => setSelected(index)}
                          >
                            {format(row[field], field, currency)}
                          </button>
                        ) : (
                          format(row[field], field, currency)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!visible.length && (
            <p className="analysis-empty">
              {focusedPage && !filter
                ? "The focused page was not found in these loaded rows."
                : rows.length
                  ? "No rows match this filter."
                  : "No rows were returned for this report and period."}
            </p>
          )}
          {result.kind === "analytics" && (
            <AnalysisPagination
              pageInfo={result.report.pageInfo}
              count={rows.length}
              onPage={onPage}
            />
          )}
        </div>
        <AnalysisEvidence
          result={result}
          projectId={projectId}
          active={active}
          activeIndex={activeIndex}
          dimensions={dimensions}
          metrics={metrics}
          currency={currency}
          dates={dates}
          property={property}
        />
      </div>
      {result.kind === "opportunities" && (
        <div className="analysis-footnote">
          <span>
            Inputs: {result.report.coverage.gscRowsConsidered} GSC rows ·{" "}
            {result.report.coverage.ga4RowsConsidered} GA4 rows
          </span>
          {(result.report.truncated.gsc ||
            result.report.truncated.ga4 ||
            result.report.truncated.candidates) && (
            <strong>
              Partial coverage: input or displayed candidates reached the
              service limit.
            </strong>
          )}
          <span>GSC clicks and GA4 sessions measure different events.</span>
        </div>
      )}
    </section>
  );
}
