import type { KeywordResearchRow } from "@/types/keywords";

export type KeywordPair = [KeywordResearchRow, KeywordResearchRow];
type ComparisonMonth = {
  month: number;
  first: number | null;
  second: number | null;
};

export function formatComparisonMonth(month: number) {
  return `${Math.floor(month / 12)}-${String((month % 12) + 1).padStart(2, "0")}`;
}

export function comparisonMonths([first, second]: KeywordPair) {
  const months = new Map<number, ComparisonMonth>();
  for (const [key, keyword] of [
    ["first", first],
    ["second", second],
  ] as const) {
    for (const item of keyword.trend) {
      const month = item.year * 12 + item.month - 1;
      const values = months.get(month) ?? { month, first: null, second: null };
      values[key] = item.searchVolume;
      months.set(month, values);
    }
  }
  const ordered = [...months.values()].toSorted((a, b) => a.month - b.month);
  const result: ComparisonMonth[] = [];
  for (const observation of ordered) {
    const previous = result.at(-1);
    // A missing point breaks both lines; the numeric axis preserves the full gap.
    if (previous && observation.month > previous.month + 1) {
      result.push({ month: previous.month + 1, first: null, second: null });
    }
    result.push(observation);
  }
  return result;
}
