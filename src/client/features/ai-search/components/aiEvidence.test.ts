import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { BrandLookupMentionTrendCard } from "./BrandLookupMentionTrendCard";
import { PromptSources } from "./PromptSources";
import type { PromptExplorerModelResult } from "@/types/schemas/ai-search";

it("keeps true zero, unavailable volume and missing months distinct", () => {
  const markup = renderToStaticMarkup(
    createElement(BrandLookupMentionTrendCard, {
      result: {
        monthlyVolume: [
          { year: 2026, month: 1, volume: 0 },
          { year: 2026, month: 3, volume: null },
        ],
      },
    }),
  );
  expect(markup).toContain("<strong>0</strong>");
  expect(markup).toContain("<strong>Unknown</strong>");
  expect(markup).not.toContain("2026-02");
});

it("groups identical cited URLs across answers and labels failed models", () => {
  const common = {
    url: "https://example.test/one",
    domain: "example.test",
    title: "Shared source",
    matchedBrand: false,
  };
  const answer = {
    status: "success",
    model: "gemini",
    modelName: null,
    text: "Answer",
    citations: [common],
    fanOutQueries: [],
    brandMentioned: null,
    outputTokens: 10,
    webSearch: true,
  } as const;
  const results: PromptExplorerModelResult[] = [
    { ...answer, citations: [common], fanOutQueries: [] },
    {
      ...answer,
      model: "claude",
      citations: [
        common,
        { ...common, url: "https://example.test/two", title: "Different page" },
      ],
      fanOutQueries: [],
    },
    {
      model: "perplexity",
      status: "error",
      errorCode: "UPSTREAM_ERROR",
      message: "Unavailable",
    },
  ];
  const markup = renderToStaticMarkup(
    createElement(PromptSources, { results }),
  );
  expect(markup.match(/href="https:\/\/example.test\/one"/g)).toHaveLength(1);
  expect(markup).toContain("2 distinct URLs");
  expect(markup).toContain("Answer unavailable");
  expect(markup).toContain("Different page");
});
