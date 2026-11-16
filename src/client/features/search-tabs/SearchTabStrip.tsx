import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import { LOCATIONS } from "@/client/features/keywords/locations";
import { RESEARCH_SCOPE_LABELS } from "@/shared/researchScope";
import { CircleAlert, Loader2, X } from "lucide-react";
import type { SearchTab } from "./types";
import {
  KEYWORD_RESEARCH_STALE_TIME_MS,
  buildKeywordResearchQueryKey,
  buildKeywordResearchRequest,
  keywordResearchQueryFn,
} from "@/client/features/keywords/hooks/useKeywordResearchData";
import { getBacklinksOverview } from "@/serverFunctions/backlinks";
import { getDomainOverview } from "@/serverFunctions/domain";
export type { SearchTab } from "./types";

type Props = {
  activeTabId: string | null;
  projectId: string;
  tabs: SearchTab[];
  onSelect: (tab: SearchTab) => void;
  onClose: (tabId: string) => void;
  onViewed: (tabId: string, when?: number) => void;
};

type SearchTabQueryConfig = {
  queryKey: QueryKey;
  queryFn: () => Promise<unknown>;
  staleTime?: number;
  gcTime?: number;
};

export function SearchTabStrip({
  activeTabId,
  projectId,
  tabs,
  onSelect,
  onClose,
  onViewed,
}: Props) {
  const stripRef = useRef<HTMLDivElement>(null);
  if (tabs.length === 0) return null;

  const focusTab = (index: number) => {
    const buttons =
      stripRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.item(index)?.focus();
  };
  const closeAt = (index: number) => {
    if (tabs.length > 1)
      focusTab(index === tabs.length - 1 ? index - 1 : index + 1);
    else
      stripRef.current
        ?.closest("main")
        ?.querySelector<HTMLElement>("form textarea, form input")
        ?.focus();
    onClose(tabs[index].id);
  };

  return (
    <div className="min-w-0 border-b border-base-300">
      <div
        ref={stripRef}
        role="tablist"
        aria-label="Search tabs"
        className="flex min-w-0 items-stretch gap-1 overflow-x-auto"
      >
        {tabs.map((tab, index) => {
          const context = getTabContext(tab);
          const active = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              data-search-tab-id={tab.id}
              className={`group flex shrink-0 items-stretch border-b-2 rounded-t-md text-sm transition ${
                active
                  ? "border-primary bg-primary/10 text-base-content"
                  : "border-transparent text-base-content/75 hover:bg-base-200"
              }`}
            >
              <button
                type="button"
                role="tab"
                data-search-tab-id={tab.id}
                aria-selected={active}
                aria-description={context}
                tabIndex={active || (!activeTabId && index === 0) ? 0 : -1}
                onKeyDown={(event) => {
                  let nextIndex: number;
                  switch (event.key) {
                    case "ArrowRight":
                      nextIndex = (index + 1) % tabs.length;
                      break;
                    case "ArrowLeft":
                      nextIndex = (index + tabs.length - 1) % tabs.length;
                      break;
                    case "Home":
                      nextIndex = 0;
                      break;
                    case "End":
                      nextIndex = tabs.length - 1;
                      break;
                    case "Delete":
                      event.preventDefault();
                      closeAt(index);
                      return;
                    default:
                      return;
                  }
                  event.preventDefault();
                  focusTab(nextIndex);
                }}
                className="flex min-w-0 items-center gap-1.5 px-2.5 py-1.5 text-left"
                onClick={() => onSelect(tab)}
              >
                <SearchTabStatus
                  tab={tab}
                  projectId={projectId}
                  active={active}
                  onViewed={onViewed}
                />
                <span className="grid max-w-48 gap-0.5">
                  <span className="truncate font-semibold" title={tab.label}>
                    {tab.label}
                  </span>
                  <span
                    aria-hidden
                    className="truncate text-xs text-base-content/65"
                    title={context}
                  >
                    {context}
                  </span>
                </span>
              </button>
              <button
                type="button"
                data-search-tab-id={tab.id}
                className="flex items-center px-1.5 text-base-content/50 opacity-60 transition hover:bg-base-content/10 hover:text-base-content hover:opacity-100 group-hover:opacity-100"
                onClick={() => closeAt(index)}
                aria-label={`Close ${tab.label} tab`}
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getTabContext({ input }: SearchTab) {
  if (input.type === "backlinks") return RESEARCH_SCOPE_LABELS[input.scope];
  const market =
    input.locationCode == null
      ? "Project market"
      : (LOCATIONS[input.locationCode] ?? String(input.locationCode));
  if (input.type === "domain")
    return `${market} · ${RESEARCH_SCOPE_LABELS[input.scope]}`;
  return `${market} · ${input.mode} · ${input.resultLimit}${input.clickstream ? " · clickstream" : ""}`;
}

function SearchTabStatus({
  tab,
  projectId,
  active,
  onViewed,
}: {
  tab: SearchTab;
  projectId: string;
  active: boolean;
  onViewed: (tabId: string, when?: number) => void;
}) {
  const config = getSearchTabQueryConfig(projectId, tab);
  const query = useQuery({
    queryKey: config.queryKey,
    queryFn: config.queryFn,
    enabled: false,
    select: () => null,
    notifyOnChangeProps: ["dataUpdatedAt", "fetchStatus", "status"],
    staleTime: config.staleTime,
    gcTime: config.gcTime,
  });

  const isLoading = query.fetchStatus === "fetching";
  const hasResult = query.dataUpdatedAt > 0;
  const hasError = query.status === "error";
  const unviewed =
    !active &&
    hasResult &&
    (tab.viewedAt === null || tab.viewedAt < query.dataUpdatedAt);

  useEffect(() => {
    if (!active) return;
    if (!hasResult) return;
    if (tab.viewedAt !== null && tab.viewedAt >= query.dataUpdatedAt) return;
    onViewed(tab.id, query.dataUpdatedAt);
  }, [active, hasResult, onViewed, query.dataUpdatedAt, tab.id, tab.viewedAt]);

  const status = isLoading
    ? "loading"
    : hasError
      ? "error"
      : unviewed
        ? "unviewed"
        : "idle";

  return <SearchTabStatusIndicator status={status} />;
}

function SearchTabStatusIndicator({
  status,
}: {
  status: "idle" | "loading" | "unviewed" | "error";
}) {
  if (status === "idle") return null;
  const label =
    status === "error"
      ? "Search failed"
      : status === "loading"
        ? "Loading"
        : "New results";
  return (
    <span
      className="flex shrink-0 items-center justify-center"
      role="img"
      aria-label={label}
      title={label}
    >
      {status === "loading" ? (
        <Loader2 className="size-3 animate-spin text-base-content/65" />
      ) : status === "error" ? (
        <CircleAlert className="size-3.5 text-error" />
      ) : (
        <span className="size-2 rounded-full bg-primary" />
      )}
    </span>
  );
}

function getSearchTabQueryConfig(
  projectId: string,
  tab: SearchTab,
): SearchTabQueryConfig {
  if (tab.input.type === "backlinks") {
    const input = tab.input;
    return {
      queryKey: ["backlinksOverview", projectId, input.scope, input.target],
      queryFn: () =>
        getBacklinksOverview({
          data: {
            projectId,
            target: input.target,
            scope: input.scope,
          },
        }),
    };
  }

  if (tab.input.type === "domain") {
    const input = tab.input;
    const trimmedDomain = input.domain.trim();

    return {
      queryKey: [
        "domain-overview",
        projectId,
        trimmedDomain,
        input.scope,
        input.locationCode,
      ],
      queryFn: () =>
        getDomainOverview({
          data: {
            projectId,
            domain: trimmedDomain,
            scope: input.scope,
            locationCode: input.locationCode,
          },
        }),
      staleTime: 5 * 60_000,
    };
  }

  const input = tab.input;
  const request = buildKeywordResearchRequest({
    projectId,
    keywordInput: input.keyword,
    locationCode: input.locationCode,
    resultLimit: input.resultLimit,
    mode: input.mode,
    clickstream: input.clickstream,
  });

  return {
    queryKey: buildKeywordResearchQueryKey(request),
    queryFn: () => {
      if (!request) throw new Error("Tab is missing a research request");
      return keywordResearchQueryFn(request);
    },
    staleTime: KEYWORD_RESEARCH_STALE_TIME_MS,
    gcTime: KEYWORD_RESEARCH_STALE_TIME_MS,
  };
}
