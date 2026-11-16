import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import {
  clearProjectSearchHistory,
  getProjectSearchHistory,
  removeProjectSearchHistoryItem,
  saveProjectSearchHistory,
} from "@/serverFunctions/search-history";

const MAX_HISTORY = 20;

type SharedSearchHistoryOptions<TItem, TInput> = {
  projectId: string;
  feature:
    | "keywords"
    | "domain"
    | "backlinks"
    | "brand-lookup"
    | "prompt-explorer";
  storageKey: string;
  parse: (raw: string) => TItem[] | null;
  itemSchema: z.ZodType<TItem>;
  isSameItem: (existing: TItem, next: TInput) => boolean;
  createItem: (input: TInput) => TItem;
  getItemKey: (item: TItem) => number;
  getSearchKey: (item: TItem) => string;
};

export function useSharedSearchHistory<TItem, TInput>({
  projectId,
  feature,
  storageKey,
  parse,
  itemSchema,
  isSameItem,
  createItem,
  getItemKey,
  getSearchKey,
}: SharedSearchHistoryOptions<TItem, TInput>) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ["project-search-history", projectId, feature],
    [feature, projectId],
  );
  const [legacyItems, setLegacyItems] = useState<TItem[]>([]);
  const [legacyLoaded, setLegacyLoaded] = useState(false);
  const migrationAttempted = useRef<string | null>(null);
  const parseRef = useRef(parse);
  parseRef.current = parse;

  const historyQuery = useQuery({
    queryKey,
    queryFn: () => getProjectSearchHistory({ data: { projectId, feature } }),
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setLegacyItems(
        raw ? (parseRef.current(raw) ?? []).slice(0, MAX_HISTORY) : [],
      );
    } catch {
      setLegacyItems([]);
    }
    setLegacyLoaded(true);
  }, [storageKey]);

  useEffect(() => {
    if (!historyQuery.isSuccess || !legacyLoaded) return;
    if (migrationAttempted.current === storageKey) return;
    migrationAttempted.current = storageKey;

    const marker = `shared-history-migrated:${storageKey}`;
    try {
      if (localStorage.getItem(marker)) {
        setLegacyItems([]);
        return;
      }
    } catch {
      return;
    }

    if (legacyItems.length === 0) {
      try {
        localStorage.setItem(marker, "1");
      } catch {
        // Shared history still works when browser storage is unavailable.
      }
      return;
    }

    const items = legacyItems.map((item) => ({
      searchKey: getSearchKey(item),
      itemJson: JSON.stringify(item),
      searchedAt: getItemKey(item),
    }));
    void saveProjectSearchHistory({ data: { projectId, feature, items } })
      .then(() => {
        try {
          localStorage.setItem(marker, "1");
        } catch {
          // The server copy is already safe.
        }
        setLegacyItems([]);
        void queryClient.invalidateQueries({ queryKey });
      })
      .catch(() => {
        migrationAttempted.current = null;
      });
  }, [
    feature,
    getItemKey,
    getSearchKey,
    historyQuery.isSuccess,
    legacyLoaded,
    legacyItems,
    projectId,
    queryClient,
    queryKey,
    storageKey,
  ]);

  const remoteItems = useMemo(() => {
    return (historyQuery.data ?? []).flatMap((row) => {
      try {
        const parsed: unknown = JSON.parse(row.itemJson);
        const result = itemSchema.safeParse(parsed);
        return result.success ? [result.data] : [];
      } catch {
        return [];
      }
    });
  }, [historyQuery.data, itemSchema]);

  const history = useMemo(() => {
    const merged = [...remoteItems, ...legacyItems].toSorted(
      (a, b) => getItemKey(b) - getItemKey(a),
    );
    const seen = new Set<string>();
    return merged
      .filter((item) => {
        const key = getSearchKey(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_HISTORY);
  }, [getItemKey, getSearchKey, legacyItems, remoteItems]);

  function updateCache(items: TItem[]) {
    queryClient.setQueryData(
      queryKey,
      items.map((item) => ({
        searchKey: getSearchKey(item),
        itemJson: JSON.stringify(item),
      })),
    );
  }

  const addItem = (input: TInput) => {
    const item = createItem(input);
    const next = [
      item,
      ...history.filter((existing) => !isSameItem(existing, input)),
    ].slice(0, MAX_HISTORY);
    updateCache(next);
    void saveProjectSearchHistory({
      data: {
        projectId,
        feature,
        items: [
          {
            searchKey: getSearchKey(item),
            itemJson: JSON.stringify(item),
            searchedAt: getItemKey(item),
          },
        ],
      },
    })
      .then(() => void queryClient.invalidateQueries({ queryKey }))
      .catch(() => console.warn("Could not save shared search history."));
  };

  const removeItem = (itemKey: number) => {
    const item = history.find((entry) => getItemKey(entry) === itemKey);
    if (!item) return;
    const searchKey = getSearchKey(item);
    updateCache(history.filter((entry) => getItemKey(entry) !== itemKey));
    void removeProjectSearchHistoryItem({
      data: { projectId, feature, searchKey },
    })
      .then(() => void queryClient.invalidateQueries({ queryKey }))
      .catch(() => console.warn("Could not remove shared search history."));
  };

  const clearItems = () => {
    updateCache([]);
    void clearProjectSearchHistory({ data: { projectId, feature } })
      .then(() => void queryClient.invalidateQueries({ queryKey }))
      .catch(() => console.warn("Could not clear shared search history."));
  };

  return {
    history,
    isLoaded: historyQuery.isFetched,
    addItem,
    removeItem,
    clearItems,
  };
}
