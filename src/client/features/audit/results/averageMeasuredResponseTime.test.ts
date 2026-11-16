import { expect, it } from "vitest";
import { averageMeasuredResponseTime } from "./AuditResultsTableFilterLogic";

it("excludes unknown response times and preserves measured zeroes", () => {
  const pages = [null, 0, 120].map((responseTimeMs) => ({ responseTimeMs }));
  expect(averageMeasuredResponseTime(pages)).toBe(60);
  expect(averageMeasuredResponseTime([{ responseTimeMs: null }])).toBeNull();
  expect(averageMeasuredResponseTime([])).toBeNull();
});
