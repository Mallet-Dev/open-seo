import { z } from "zod";
import { jsonCodec } from "@/shared/json";
import { useSharedSearchHistory } from "@/client/hooks/useSharedSearchHistory";

/**
 * Shared recent-searches hook: localStorage-backed list of items tagged with
 * `timestamp`, keyed by a per-project storage key. Each call site provides
 * the item body's Zod schema (timestamp is added automatically) and a dedupe
 * predicate that decides whether two searches are "the same".
 */

const timestampFieldSchema = z.object({ timestamp: z.number() });

export function useTimestampedSearchHistory<TBody extends object>(args: {
  projectId: string;
  feature: "brand-lookup" | "prompt-explorer";
  storageKey: string;
  bodySchema: z.ZodType<TBody>;
  isSame: (existing: TBody, next: TBody) => boolean;
  getSearchKey: (item: TBody & { timestamp: number }) => string;
}) {
  type StoredItem = TBody & { timestamp: number };
  const codec = jsonCodec(
    z.array(z.intersection(args.bodySchema, timestampFieldSchema)),
  );

  const historyStore = useSharedSearchHistory<StoredItem, TBody>({
    projectId: args.projectId,
    feature: args.feature,
    storageKey: args.storageKey,
    parse: (raw) => {
      const parsed = codec.safeParse(raw);
      return parsed.success ? parsed.data : null;
    },
    itemSchema: z.intersection(args.bodySchema, timestampFieldSchema),
    isSameItem: (existing, next) => args.isSame(existing, next),
    createItem: (input) => ({ ...input, timestamp: Date.now() }),
    getItemKey: (item) => item.timestamp,
    getSearchKey: args.getSearchKey,
  });

  return {
    history: historyStore.history,
    isLoaded: historyStore.isLoaded,
    addSearch: historyStore.addItem,
    removeHistoryItem: historyStore.removeItem,
  };
}
