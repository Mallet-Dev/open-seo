import { z } from "zod";
import {
  clearProjectSearchHistory,
  listProjectSearchHistory,
  removeProjectSearchHistoryItem,
  saveProjectSearchHistory,
} from "./ProjectSearchHistoryRepository";

export const searchHistoryFeatureSchema = z.enum([
  "keywords",
  "domain",
  "backlinks",
  "brand-lookup",
  "prompt-explorer",
]);

const historyItemSchema = z.object({
  searchKey: z.string().min(1).max(8192),
  itemJson: z.string().min(2).max(16384),
  searchedAt: z.number().int().nonnegative(),
});

export async function getSearchHistory(projectId: string, feature: string) {
  const rows = await listProjectSearchHistory(projectId, feature);
  return rows.map((row) => ({
    searchKey: row.searchKey,
    itemJson: row.itemJson,
  }));
}

export async function saveSearchHistory(
  projectId: string,
  feature: string,
  items: unknown,
) {
  const parsedItems = z.array(historyItemSchema).max(20).parse(items);
  for (const item of parsedItems) {
    const parsedJson: unknown = JSON.parse(item.itemJson);
    if (
      typeof parsedJson !== "object" ||
      parsedJson === null ||
      Array.isArray(parsedJson)
    ) {
      throw new Error("Invalid search history item");
    }
  }

  await saveProjectSearchHistory(projectId, feature, parsedItems);
}

export async function removeSearchHistoryItem(
  projectId: string,
  feature: string,
  searchKey: string,
) {
  await removeProjectSearchHistoryItem(projectId, feature, searchKey);
}

export async function clearSearchHistory(projectId: string, feature: string) {
  await clearProjectSearchHistory(projectId, feature);
}
