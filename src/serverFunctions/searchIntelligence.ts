import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  SearchIntelligenceService,
  searchAnalysisInputSchema,
} from "@/server/features/search-intelligence/SearchIntelligenceService";
export const getSearchAnalysis = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(searchAnalysisInputSchema)
  .handler(({ data, context }) =>
    SearchIntelligenceService.report(context.projectId, data),
  );
