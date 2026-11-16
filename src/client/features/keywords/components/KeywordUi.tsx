import type { KeywordResearchRow } from "@/types/keywords";
import { formatNumber } from "../utils";
import { IntentBadge } from "./IntentBadge";
export { SerpAnalysisCard } from "./SerpAnalysisCard";

export type { SortDir, SortField } from "./DisplayPrimitives";
export {
  AreaTrendChart,
  HeaderHelpLabel,
  SortHeader,
} from "./DisplayPrimitives";

export function OverviewStats({ keyword }: { keyword: KeywordResearchRow }) {
  const metrics = [
    [
      "Monthly searches",
      keyword.searchVolume == null
        ? "Unavailable"
        : formatNumber(keyword.searchVolume),
    ],
    ["Difficulty / 100", keyword.keywordDifficulty ?? "Unavailable"],
    [
      "CPC (USD)",
      keyword.cpc == null ? "Unavailable" : `$${keyword.cpc.toFixed(2)}`,
    ],
    ["Ad competition / 1", keyword.competition?.toFixed(2) ?? "Unavailable"],
  ];
  return (
    <section className="rounded-xl border border-base-300 bg-base-100 px-4 py-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="break-words text-lg font-semibold tracking-tight">
          {keyword.keyword}
        </h3>
        <IntentBadge intent={keyword.intent} />
      </div>
      <dl className="grid grid-cols-2 gap-3 border-t border-base-300 pt-3 lg:grid-cols-4">
        {metrics.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-base-content/65">{label}</dt>
            <dd className="mt-1 font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
