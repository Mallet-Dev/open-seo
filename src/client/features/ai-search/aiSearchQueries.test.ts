import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { explorePrompt, lookupBrand } from "@/serverFunctions/ai-search";
import { brandOptions, promptOptions } from "./aiSearchQueries";

vi.mock("@/serverFunctions/ai-search", () => ({
  explorePrompt: vi.fn(async () => ({ prompt: "Which installer?" })),
  lookupBrand: vi.fn(async () => ({ resolvedTarget: "northline.example" })),
}));

describe("AI search navigation", () => {
  it("opens drafts and previously fetched evidence without a provider call", async () => {
    const client = new QueryClient();
    const prompt = promptOptions("p", {
      prompt: "Which installer?",
      highlightBrand: "",
      models: ["gemini", "gemini"],
      webSearch: true,
      webSearchCountryCode: "CA",
    });
    const brand = brandOptions("p", "northline.example", [], undefined);
    const inspectPrompt = new QueryObserver(client, prompt);
    const inspectBrand = new QueryObserver(client, brand);
    const closePrompt = inspectPrompt.subscribe(() => {});
    const closeBrand = inspectBrand.subscribe(() => {});
    expect(explorePrompt).not.toHaveBeenCalled();
    expect(lookupBrand).not.toHaveBeenCalled();
    await Promise.all([
      client.prefetchQuery(prompt),
      client.prefetchQuery(brand),
    ]);
    expect(vi.mocked(explorePrompt).mock.calls[0]?.[0].data.models).toEqual([
      "gemini",
    ]);
    expect(explorePrompt).toHaveBeenCalledOnce();
    expect(lookupBrand).toHaveBeenCalledOnce();
    closePrompt();
    closeBrand();
    await client.invalidateQueries();
    const reopen = inspectPrompt.subscribe(() => {});
    const reopenBrand = inspectBrand.subscribe(() => {});
    expect(inspectPrompt.getCurrentResult().data?.prompt).toBe(
      "Which installer?",
    );
    expect(inspectBrand.getCurrentResult().data?.resolvedTarget).toBe(
      "northline.example",
    );
    expect(explorePrompt).toHaveBeenCalledOnce();
    expect(lookupBrand).toHaveBeenCalledOnce();
    reopen();
    reopenBrand();
    client.clear();
  });
});
