import { queryOptions } from "@tanstack/react-query";
import { explorePrompt, lookupBrand } from "@/serverFunctions/ai-search";
import type { ResearchScope } from "@/shared/researchScope";
import type {
  PromptExplorerModel,
  WebSearchCountryCode,
} from "@/types/schemas/ai-search";

export type PromptDraft = {
  prompt: string;
  highlightBrand: string;
  models: PromptExplorerModel[];
  webSearch: boolean;
  webSearchCountryCode: WebSearchCountryCode;
};

// Route observers can display cached evidence. Only form submission fetches.
const manual = {
  enabled: false,
  retry: false,
  staleTime: 5 * 60 * 1000,
} as const;

export function promptOptions(projectId: string, draft: PromptDraft) {
  const prompt = draft.prompt.trim();
  const highlightBrand = draft.highlightBrand.trim();
  const models = [...new Set(draft.models)];
  return queryOptions({
    ...manual,
    queryKey: [
      "prompt-explorer",
      projectId,
      prompt,
      models.toSorted().join(","),
      draft.webSearch,
      draft.webSearchCountryCode,
      highlightBrand,
    ],
    queryFn: () =>
      explorePrompt({
        data: {
          projectId,
          prompt,
          models,
          webSearch: draft.webSearch,
          webSearchCountryCode: draft.webSearchCountryCode,
          highlightBrand: highlightBrand || undefined,
        },
      }),
  });
}

export function brandOptions(
  projectId: string,
  query: string,
  competitors: string[],
  scope: ResearchScope | undefined,
) {
  const target = query.trim();
  return queryOptions({
    ...manual,
    queryKey: [
      "brand-lookup",
      projectId,
      target,
      competitors.join(","),
      scope ?? "",
    ],
    queryFn: () =>
      lookupBrand({
        data: {
          projectId,
          query: target,
          competitors,
          scope,
          locationCode: 2840,
          languageCode: "en",
        },
      }),
  });
}
