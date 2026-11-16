import { z } from "zod";
import { useSharedSearchHistory } from "@/client/hooks/useSharedSearchHistory";
import { jsonCodec } from "@/shared/json";

interface SearchHistoryItem {
  keyword: string;
  locationCode: number;
  locationName: string;
  timestamp: number;
}

const searchHistoryItemSchema = z.object({
  keyword: z.string(),
  locationCode: z.number(),
  locationName: z.string(),
  timestamp: z.number(),
});

const searchHistorySchema = z.array(searchHistoryItemSchema);
const searchHistoryCodec = jsonCodec(searchHistorySchema);

export function useSearchHistory(projectId: string) {
  const historyStore = useSharedSearchHistory<
    SearchHistoryItem,
    Omit<SearchHistoryItem, "timestamp">
  >({
    projectId,
    feature: "keywords",
    storageKey: `search-history:${projectId}`,
    parse: (raw) => {
      const parsed = searchHistoryCodec.safeParse(raw);
      return parsed.success ? parsed.data : null;
    },
    itemSchema: searchHistoryItemSchema,
    isSameItem: (existing, next) =>
      existing.keyword === next.keyword &&
      existing.locationCode === next.locationCode,
    createItem: (item) => ({ ...item, timestamp: Date.now() }),
    getItemKey: (item) => item.timestamp,
    getSearchKey: (item) => JSON.stringify([item.keyword, item.locationCode]),
  });

  return {
    history: historyStore.history,
    isLoaded: historyStore.isLoaded,
    addSearch: (keyword: string, locationCode: number, locationName: string) =>
      historyStore.addItem({ keyword, locationCode, locationName }),
    clearHistory: historyStore.clearItems,
    removeHistoryItem: historyStore.removeItem,
  };
}
