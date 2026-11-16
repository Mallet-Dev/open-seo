import { expect, it } from "vitest";
import type { KeywordResearchRow } from "@/types/keywords";
import {
  comparisonMonths,
  formatComparisonMonth,
} from "./keywordComparisonMonths";

it("aligns independent histories by calendar month and preserves missing and zero values", () => {
  const base: KeywordResearchRow = {
    keyword: "tile",
    searchVolume: null,
    cpc: null,
    competition: null,
    keywordDifficulty: null,
    intent: "unknown",
    trend: [],
  };
  const a = {
    ...base,
    trend: [
      { year: 2025, month: 12, searchVolume: 0 },
      { year: 2026, month: 3, searchVolume: 40 },
    ],
  };
  const b = {
    ...base,
    trend: [
      { year: 2026, month: 3, searchVolume: 5 },
      { year: 2026, month: 1, searchVolume: 11 },
    ],
  };
  expect(
    comparisonMonths([a, b]).map((row) => ({
      ...row,
      month: formatComparisonMonth(row.month),
    })),
  ).toEqual([
    { month: "2025-12", first: 0, second: null },
    { month: "2026-01", first: null, second: 11 },
    { month: "2026-02", first: null, second: null },
    { month: "2026-03", first: 40, second: 5 },
  ]);
  expect(comparisonMonths([base, base])).toEqual([]);
});
