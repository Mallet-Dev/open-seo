import { expect, it, vi } from "vitest";
import { getCachedResearch, research } from "./research";
import { getCached } from "@/server/lib/r2-cache";
import { fetchResearchRowsBySource } from "./research-data";

vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: vi.fn().mockResolvedValue("example-research-key"),
  getCached: vi.fn(),
  setCached: vi.fn(),
  CACHE_TTL: { researchResult: 86400 },
}));
vi.mock("./research-data", () => ({
  fetchResearchRowsBySource: vi.fn(),
}));
vi.mock(
  "@/server/features/keywords/repositories/KeywordResearchRepository",
  () => ({
    KeywordResearchRepository: {},
  }),
);

it("looks up saved research on a miss and runs the provider only for an explicit search", async () => {
  const input = {
    projectId: "project",
    keywords: ["research"],
    languageCode: "en",
    locationCode: 2840,
    mode: "related" as const,
    clickstream: false,
    resultLimit: 150 as const,
  };
  const customer = {
    organizationId: "org",
    userEmail: "test@example.org",
    userId: "user",
  };
  vi.mocked(fetchResearchRowsBySource).mockResolvedValue([]);
  vi.mocked(getCached).mockResolvedValue(null);
  expect(await getCachedResearch(input, customer)).toBeNull();
  expect(fetchResearchRowsBySource).not.toHaveBeenCalled();

  const result = await research(input, customer);
  expect(fetchResearchRowsBySource).toHaveBeenCalledTimes(1);

  vi.mocked(getCached).mockResolvedValue(result);
  expect(await getCachedResearch(input, customer)).toEqual(result);
  expect(fetchResearchRowsBySource).toHaveBeenCalledTimes(1);
});
