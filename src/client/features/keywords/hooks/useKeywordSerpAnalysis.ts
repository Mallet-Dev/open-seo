import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getSerpAnalysis } from "@/serverFunctions/keywords";

function serpOptions(
  projectId: string,
  keyword: string,
  locationCode: number | undefined,
) {
  return queryOptions({
    queryKey: ["serpAnalysis", projectId, keyword, locationCode],
    queryFn: () =>
      getSerpAnalysis({ data: { projectId, keyword, locationCode } }),
    staleTime: 12 * 60 * 60 * 1000,
    retry: false,
    enabled: false,
  });
}

export function useKeywordSerpAnalysis(
  projectId: string,
  keyword: string,
  locationCode: number | undefined,
) {
  const queryClient = useQueryClient();
  const [serpPage, setSerpPage] = useState(0);
  const query = useQuery(serpOptions(projectId, keyword, locationCode));

  function inspectSerp(selectedKeyword: string) {
    setSerpPage(0);
    void queryClient.prefetchQuery(
      serpOptions(projectId, selectedKeyword, locationCode),
    );
  }

  return {
    inspectSerp,
    serpPage,
    setSerpPage,
    SERP_PAGE_SIZE: 10,
    serpResults: query.data?.items ?? [],
    activeSerpKeyword:
      query.data || query.isFetching || query.isError ? keyword : null,
    serpLoading: query.isFetching,
    serpError: query.isError
      ? getStandardErrorMessage(query.error, "Failed to load SERP data.")
      : null,
  };
}
