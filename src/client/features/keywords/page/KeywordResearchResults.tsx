import { KeywordComparison } from "./KeywordComparison";
import { LOCATIONS } from "../locations";
import { KeywordResearchDesktopResults } from "./KeywordResearchDesktopResults";
import { KeywordResearchMobileResults } from "./KeywordResearchMobileResults";
import type { KeywordResearchControllerState } from "./types";

type Props = {
  controller: KeywordResearchControllerState;
};

export function KeywordResearchResults({ controller }: Props) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden w-full">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-t border-base-300 pt-4">
        <h2 className="break-words text-xl font-semibold tracking-tight">
          {controller.searchedKeyword}
        </h2>
        <p className="text-sm text-base-content/70">
          {LOCATIONS[controller.lastSearchLocationCode] ??
            controller.lastSearchLocationCode}{" "}
          ·{" "}
          {
            {
              google_ads: "Google Ads",
              related: "DataForSEO Labs · Related keywords",
              ideas: "DataForSEO Labs · Ideas",
              suggestions: "DataForSEO Labs · Suggestions",
            }[controller.lastResultSource]
          }
          {controller.lastUsedFallback ? " (fallback)" : ""}
        </p>
      </div>
      <p className="mb-3 text-xs text-base-content/70">
        Select keywords to compare or save them. Opening Google results for
        another keyword may use credits.
      </p>
      {controller.selectedRows.size > 1 && (
        <KeywordComparison
          rows={controller.rows.filter((row) =>
            controller.selectedRows.has(row.keyword),
          )}
        />
      )}
      <KeywordResearchDesktopResults controller={controller} />
      <KeywordResearchMobileResults controller={controller} />
    </div>
  );
}
