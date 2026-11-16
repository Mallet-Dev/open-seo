import { useEffect, useMemo, useRef } from "react";
import {
  skipToken,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { LOCATIONS } from "@/client/features/keywords/utils";
import { parseKeywordInput } from "@/client/features/keywords/state/keywordControllerActions";
import {
  getCachedKeywordResearch,
  researchKeywords,
} from "@/serverFunctions/keywords";
import type {
  KeywordMode,
  ResearchSource,
  ResultLimit,
} from "@/client/features/keywords/keywordResearchTypes";

type AddSearchFn = (
  keyword: string,
  locationCode: number,
  locationName: string,
) => void;

type KeywordResearchRequestInput = {
  projectId: string;
  keywordInput: string;
  locationCode: number | undefined;
  resultLimit: ResultLimit;
  mode: KeywordMode;
  clickstream: boolean;
};

type KeywordResearchQueryInput = KeywordResearchRequestInput & {
  displayedLocationCode: number;
};

type KeywordResearchRequest = {
  projectId: string;
  keywords: string[];
  seedKeyword: string;
  locationCode: number | undefined;
  resultLimit: ResultLimit;
  mode: KeywordMode;
  clickstream: boolean;
};

export const KEYWORD_RESEARCH_STALE_TIME_MS = 24 * 60 * 60 * 1000;

export function buildKeywordResearchRequest(
  input: KeywordResearchRequestInput,
): KeywordResearchRequest | null {
  const keywords = parseKeywordInput(input.keywordInput);
  const seedKeyword = keywords[0] ?? "";
  if (!seedKeyword) return null;

  return {
    projectId: input.projectId,
    keywords,
    seedKeyword,
    locationCode: input.locationCode,
    resultLimit: input.resultLimit,
    mode: input.mode,
    clickstream: input.clickstream,
  };
}

export function buildKeywordResearchQueryKey(
  request: KeywordResearchRequest | null,
) {
  return request
    ? [
        "keywordResearch",
        request.projectId,
        request.keywords,
        request.locationCode,
        request.resultLimit,
        request.mode,
        request.clickstream,
      ]
    : ["keywordResearch", "idle"];
}

function researchInput(request: KeywordResearchRequest) {
  return {
    projectId: request.projectId,
    keywords: request.keywords,
    locationCode: request.locationCode,
    resultLimit: request.resultLimit,
    mode: request.mode,
    clickstream: request.clickstream,
  };
}

export function keywordResearchQueryFn(request: KeywordResearchRequest) {
  return researchKeywords({ data: researchInput(request) });
}

export function runKeywordResearch(
  queryClient: QueryClient,
  request: KeywordResearchRequest,
) {
  return queryClient.prefetchQuery({
    queryKey: buildKeywordResearchQueryKey(request),
    queryFn: () => keywordResearchQueryFn(request),
    staleTime: KEYWORD_RESEARCH_STALE_TIME_MS,
    gcTime: KEYWORD_RESEARCH_STALE_TIME_MS,
    retry: false,
  });
}

export function useKeywordResearchData(
  input: KeywordResearchQueryInput,
  addSearch: AddSearchFn,
) {
  const queryClient = useQueryClient();
  const {
    clickstream,
    displayedLocationCode,
    keywordInput,
    locationCode,
    mode,
    projectId,
    resultLimit,
  } = input;
  const request = useMemo<KeywordResearchRequest | null>(
    () =>
      buildKeywordResearchRequest({
        keywordInput,
        locationCode,
        mode,
        projectId,
        resultLimit,
        clickstream,
      }),
    [clickstream, keywordInput, locationCode, mode, projectId, resultLimit],
  );
  const queryKey = useMemo(
    () => buildKeywordResearchQueryKey(request),
    [request],
  );
  const queryKeyString = JSON.stringify(queryKey);

  const timing = {
    staleTime: KEYWORD_RESEARCH_STALE_TIME_MS,
    gcTime: KEYWORD_RESEARCH_STALE_TIME_MS,
    retry: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  } as const;
  const submitted = useQuery({
    ...timing,
    queryKey,
    queryFn: request ? () => keywordResearchQueryFn(request) : skipToken,
    enabled: false,
  });
  const saved = useQuery({
    ...timing,
    queryKey: [...queryKey, "saved"],
    queryFn: request
      ? () => getCachedKeywordResearch({ data: researchInput(request) })
      : skipToken,
    enabled: !!request && submitted.isPending && !submitted.isFetching,
  });
  const researchQuery =
    submitted.isPending && !submitted.isFetching ? saved : submitted;

  const handledSuccessKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!request || !researchQuery.isSuccess || !researchQuery.data) return;
    if (handledSuccessKeyRef.current === queryKeyString) return;
    handledSuccessKeyRef.current = queryKeyString;

    captureClientEvent("keyword_research:search_complete", {
      location_code: displayedLocationCode,
      search_mode: request.mode,
      clickstream: request.clickstream,
      result_count: researchQuery.data.rows.length,
    });

    addSearch(
      request.seedKeyword,
      displayedLocationCode,
      LOCATIONS[displayedLocationCode] || "Unknown",
    );
  }, [
    addSearch,
    displayedLocationCode,
    queryKeyString,
    request,
    researchQuery.data,
    researchQuery.isSuccess,
  ]);

  const hasSearched = parseKeywordInput(keywordInput).length > 0;
  const rows = hasSearched ? (researchQuery.data?.rows ?? []) : [];
  const researchError =
    hasSearched && researchQuery.isError
      ? getStandardErrorMessage(researchQuery.error, "Research failed.")
      : null;

  return {
    rows,
    hasSearched,
    lastSearchError: hasSearched && researchQuery.isError,
    lastResultSource:
      researchQuery.data?.source ?? ("related" as ResearchSource),
    lastUsedFallback: researchQuery.data?.usedFallback ?? false,
    lastSearchKeyword: request?.seedKeyword ?? "",
    lastSearchLocationCode: displayedLocationCode,
    researchError,
    researchMutationError: researchQuery.error,
    searchedKeyword: request?.seedKeyword ?? "",
    isLoading:
      hasSearched &&
      (researchQuery.isPending ||
        (researchQuery.isFetching && !researchQuery.data)),
    needsSearch: hasSearched && researchQuery.data === null,
    retryResearch: () => request && runKeywordResearch(queryClient, request),
  };
}
