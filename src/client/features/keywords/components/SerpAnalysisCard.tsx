import { getSafeExternalUrl } from "@/client/components/table/url";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { ExportToSheetsButton } from "@/client/components/table/ExportToSheetsButton";
import type { SerpResultItem } from "@/types/keywords";

export function SerpAnalysisCard({
  items,
  keyword,
  loading,
  error,
  onRetry,
  page,
  pageSize,
  onPageChange,
}: {
  items: SerpResultItem[];
  keyword?: string | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}) {
  const totalPages = Math.ceil(items.length / pageSize);
  const pageItems = items.slice(page * pageSize, (page + 1) * pageSize);

  if (loading) return <SerpAnalysisLoadingState />;
  if (error) {
    return (
      <div className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error space-y-2">
        <p>{error}</p>
        {onRetry ? (
          <button className="btn btn-xs" onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </div>
    );
  }
  if (items.length === 0) return <SerpAnalysisEmptyState keyword={keyword} />;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-base-content/50">
          {items.length} organic results{keyword ? ` for “${keyword}”` : ""}
        </div>
        <ExportToSheetsButton
          headers={["Rank", "Title", "URL", "Domain"]}
          rows={items.map((item) => [
            item.rank,
            item.title ?? "",
            item.url,
            item.domain,
          ])}
          feature="serp_analysis"
        />
      </div>
      <SerpAnalysisTable items={pageItems} />
      <SerpAnalysisPagination
        page={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
      />
    </div>
  );
}

function SerpAnalysisTable({ items }: { items: SerpResultItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table table-xs w-full">
        <thead>
          <tr className="text-xs text-base-content/60">
            <th className="w-8">#</th>
            <th>Page</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={`${item.rank}-${item.url}`}
              className="hover:bg-base-200/50"
            >
              <td className="font-mono text-base-content/50 text-xs">
                {item.rank > 0 ? item.rank : "-"}
              </td>
              <td className="min-w-0 max-w-0">
                <div className="flex flex-col gap-0.5">
                  {getSafeExternalUrl(item.url) ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary hover:underline truncate flex items-center gap-1"
                      title={item.title}
                    >
                      {item.title || item.url}
                      <ExternalLink className="size-3 shrink-0 opacity-40" />
                    </a>
                  ) : (
                    <span className="font-medium">
                      {item.title || item.domain || "Page unavailable"}
                    </span>
                  )}
                  <span className="text-xs text-base-content/65 truncate">
                    {item.domain}
                  </span>
                  <details className="group mt-1 text-xs">
                    <summary className="w-fit cursor-pointer rounded text-primary hover:underline">
                      Page evidence
                    </summary>
                    <div className="mt-2 space-y-2 border-t border-base-300 py-2">
                      {item.description && (
                        <p className="whitespace-normal break-words leading-relaxed">
                          {item.description}
                        </p>
                      )}
                      <dl className="grid grid-cols-2 gap-2">
                        {(
                          [
                            ["Estimated traffic", item.etv],
                            ["Referring domains", item.referringDomains],
                            ["Backlinks", item.backlinks],
                          ] as const
                        ).map(([label, value]) => (
                          <div key={label}>
                            <dt className="text-base-content/65">{label}</dt>
                            <dd className="font-medium tabular-nums">
                              {value == null
                                ? "Unavailable"
                                : value.toLocaleString()}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </details>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SerpAnalysisPagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between mt-3 pt-3 border-t border-base-200">
      <span className="text-xs text-base-content/50">
        Page {page + 1} of {totalPages}
      </span>
      <div className="flex gap-1">
        <button
          className="btn btn-ghost btn-xs"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="size-3.5" />
          Prev
        </button>
        <button
          className="btn btn-ghost btn-xs"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function SerpAnalysisLoadingState() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="h-8 rounded bg-base-200 animate-pulse"
          style={{ animationDelay: `${index * 50}ms` }}
        />
      ))}
    </div>
  );
}

function SerpAnalysisEmptyState({ keyword }: { keyword?: string | null }) {
  return (
    <div className="text-sm text-base-content/50 text-center py-8">
      <p>
        {keyword
          ? "No organic results were returned for this keyword."
          : "Choose a keyword in the table to inspect its Google results."}
      </p>
    </div>
  );
}
