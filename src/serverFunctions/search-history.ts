import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  clearSearchHistory,
  getSearchHistory,
  removeSearchHistoryItem,
  saveSearchHistory,
  searchHistoryFeatureSchema,
} from "@/server/features/search-history/ProjectSearchHistoryService";
import { z } from "zod";

const featureSchema = searchHistoryFeatureSchema;
const projectIdSchema = z.object({ projectId: z.string().min(1) });

export const getProjectSearchHistory = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectIdSchema.extend({ feature: featureSchema }))
  .handler(({ data, context }) =>
    getSearchHistory(context.projectId, data.feature),
  );

export const saveProjectSearchHistory = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    projectIdSchema.extend({
      feature: featureSchema,
      items: z
        .array(
          z.object({
            searchKey: z.string().min(1).max(8192),
            itemJson: z.string().min(2).max(16384),
            searchedAt: z.number().int().nonnegative(),
          }),
        )
        .max(20),
    }),
  )
  .handler(({ data, context }) =>
    saveSearchHistory(context.projectId, data.feature, data.items),
  );

export const removeProjectSearchHistoryItem = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(
    projectIdSchema.extend({
      feature: featureSchema,
      searchKey: z.string().min(1).max(8192),
    }),
  )
  .handler(({ data, context }) =>
    removeSearchHistoryItem(context.projectId, data.feature, data.searchKey),
  );

export const clearProjectSearchHistory = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectIdSchema.extend({ feature: featureSchema }))
  .handler(({ data, context }) =>
    clearSearchHistory(context.projectId, data.feature),
  );
