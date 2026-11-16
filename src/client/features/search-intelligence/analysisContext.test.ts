import { describe, expect, it } from "vitest";
import { analysisContextSchema } from "./analysisContext";
describe("cross-report page and date context", () => {
  it("preserves a selected page and the requested investigation period", () => {
    const input = {
      page: "https://example.test/service",
      startDate: "2026-11-01",
      endDate: "2026-11-12",
    };
    expect(analysisContextSchema.parse(input)).toEqual(input);
  });
  it("rejects non-web links and incomplete or reversed periods", () => {
    for (const input of [
      { page: "javascript:alert(1)" },
      { startDate: "2026-11-01" },
      { startDate: "2026-11-12", endDate: "2026-11-01" },
      { startDate: "2026-02-30", endDate: "2026-03-01" },
    ])
      expect(analysisContextSchema.safeParse(input).success).toBe(false);
  });
});
