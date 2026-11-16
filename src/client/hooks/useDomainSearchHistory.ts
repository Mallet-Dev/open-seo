import { z } from "zod";
import { useSharedSearchHistory } from "@/client/hooks/useSharedSearchHistory";
import { jsonCodec } from "@/shared/json";
import {
  researchScopeSchema,
  type ResearchScope,
} from "@/shared/researchScope";

type DomainSortMode = "rank" | "traffic" | "volume" | "score" | "cpc";
type DomainTab = "keywords" | "pages";

export interface DomainSearchHistoryItem {
  domain: string;
  scope: ResearchScope;
  sort: DomainSortMode;
  tab: DomainTab;
  locationCode?: number;
  timestamp: number;
}

type AddDomainSearchInput = Omit<DomainSearchHistoryItem, "timestamp">;

const domainSearchHistoryItemSchema = z
  .object({
    domain: z.string(),
    scope: researchScopeSchema.optional(),
    /** Legacy field: pre-scope history encoded "Include subdomains" here. */
    subdomains: z.boolean().optional(),
    sort: z.enum(["rank", "traffic", "volume", "score", "cpc"]),
    tab: z.enum(["keywords", "pages"]),
    locationCode: z.number().int().positive().optional(),
    timestamp: z.number(),
  })
  .transform(
    ({ subdomains, scope, ...item }): DomainSearchHistoryItem => ({
      ...item,
      // Legacy items always carried the boolean, so scope-less means true.
      scope: scope ?? (subdomains === false ? "domain" : "subdomains"),
    }),
  );

const domainSearchHistorySchema = z.array(domainSearchHistoryItemSchema);
const domainSearchHistoryCodec = jsonCodec(domainSearchHistorySchema);

function isSameSearch(
  a: DomainSearchHistoryItem,
  b: AddDomainSearchInput,
): boolean {
  return (
    a.domain === b.domain &&
    a.scope === b.scope &&
    a.sort === b.sort &&
    a.tab === b.tab &&
    a.locationCode === b.locationCode
  );
}

export function useDomainSearchHistory(projectId: string) {
  const historyStore = useSharedSearchHistory<
    DomainSearchHistoryItem,
    AddDomainSearchInput
  >({
    projectId,
    feature: "domain",
    storageKey: `domain-search-history:${projectId}`,
    parse: (raw) => {
      const parsed = domainSearchHistoryCodec.safeParse(raw);
      return parsed.success ? parsed.data : null;
    },
    itemSchema: domainSearchHistoryItemSchema,
    isSameItem: isSameSearch,
    createItem: (item) => ({ ...item, timestamp: Date.now() }),
    getItemKey: (item) => item.timestamp,
    getSearchKey: (item) =>
      JSON.stringify([
        item.domain,
        item.scope,
        item.sort,
        item.tab,
        item.locationCode,
      ]),
  });

  return {
    history: historyStore.history,
    isLoaded: historyStore.isLoaded,
    addSearch: historyStore.addItem,
    clearHistory: historyStore.clearItems,
    removeHistoryItem: historyStore.removeItem,
  };
}
