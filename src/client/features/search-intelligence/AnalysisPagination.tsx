import type { SearchAnalysisResult } from "@/server/features/search-intelligence/SearchIntelligenceService";
type Ready = Extract<SearchAnalysisResult, { status: "ready" }>;
export function AnalysisPagination({
  pageInfo,
  count,
  onPage,
}: {
  pageInfo: Extract<Ready, { kind: "analytics" }>["report"]["pageInfo"];
  count: number;
  onPage: (offset: number) => void;
}) {
  return (
    <div className="analysis-pagination">
      <button
        className="maps-action maps-action-secondary"
        disabled={pageInfo.offset === 0}
        onClick={() => onPage(Math.max(0, pageInfo.offset - pageInfo.limit))}
      >
        Previous
      </button>
      <span>
        Rows {count ? pageInfo.offset + 1 : 0}–{pageInfo.offset + count}
      </span>
      <button
        className="maps-action maps-action-secondary"
        disabled={!pageInfo.hasMore || pageInfo.nextOffset === null}
        onClick={() => {
          if (pageInfo.nextOffset !== null) onPage(pageInfo.nextOffset);
        }}
      >
        Next
      </button>
    </div>
  );
}
