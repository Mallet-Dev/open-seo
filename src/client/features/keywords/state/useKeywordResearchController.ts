import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { useCallback, useEffect, useRef, type FormEvent } from "react";
import {
  useKeywordControlsForm,
  type KeywordControlsValues,
} from "@/client/features/keywords/hooks/useKeywordControlsForm";
import { useKeywordFiltering } from "@/client/features/keywords/hooks/useKeywordFiltering";
import { useLocalKeywordFilters } from "@/client/features/keywords/hooks/useLocalKeywordFilters";
import { useKeywordResearchData } from "@/client/features/keywords/hooks/useKeywordResearchData";
import { useKeywordSelection } from "@/client/features/keywords/hooks/useKeywordSelection";
import { useKeywordSerpAnalysis } from "@/client/features/keywords/hooks/useKeywordSerpAnalysis";
import { captureClientEvent } from "@/client/lib/posthog";
import { useSearchHistory } from "@/client/hooks/useSearchHistory";
import {
  type KeywordMode,
  type ResultLimit,
} from "@/client/features/keywords/keywordResearchTypes";
import type { KeywordResearchRow } from "@/types/keywords";
import type { SortDir, SortField } from "@/client/features/keywords/components";
import {
  buildKeywordSearchKey,
  getNextSortParams,
  useSaveAndExportActions,
} from "./keywordControllerActions";
import {
  useKeywordSaveMutation,
  useKeywordSearchParams,
  useKeywordUiState,
} from "./keywordControllerInternals";
import { useKeywordOverviewState } from "./useKeywordOverviewState";

export type KeywordResearchControllerInput = {
  projectId: string;
  keywordInput: string;
  locationCode: number | undefined;
  displayedLocationCode: number;
  setPreferredLocationCode: (locationCode: number) => void;
  resultLimit: ResultLimit;
  keywordMode: KeywordMode;
  clickstream: boolean;
  sortField: SortField;
  sortDir: SortDir;
  /**
   * Called when the user submits the search form. Lets the caller decide
   * whether the submission opens tabs or just rewrites the URL — the
   * controller stays agnostic.
   */
  onFormSubmit: (value: KeywordControlsValues) => void;
};

export function useKeywordResearchController(
  input: KeywordResearchControllerInput,
) {
  const { displayedLocationCode, locationCode, setPreferredLocationCode } =
    input;
  const {
    filtersForm,
    values: filterValues,
    resetFilters,
  } = useLocalKeywordFilters();
  const uiState = useKeywordUiState(
    Object.values(filterValues).some((v) => v.trim() !== ""),
  );
  const {
    selectedRows,
    setSelectedRows,
    clearSelection,
    toggleRowSelection,
    toggleAllRows,
  } = useKeywordSelection();
  const {
    history,
    isLoaded: historyLoaded,
    addSearch,
    removeHistoryItem,
  } = useSearchHistory(input.projectId);

  const {
    rows,
    hasSearched,
    lastSearchError,
    lastResultSource,
    lastUsedFallback,
    lastSearchKeyword,
    lastSearchLocationCode,
    researchError,
    researchMutationError,
    needsSearch,
    searchedKeyword,
    isLoading,
    retryResearch,
  } = useKeywordResearchData(
    {
      projectId: input.projectId,
      keywordInput: input.keywordInput,
      locationCode,
      displayedLocationCode,
      resultLimit: input.resultLimit,
      mode: input.keywordMode,
      clickstream: input.clickstream,
    },
    addSearch,
  );
  const setSearchParams = useKeywordSearchParams();
  const saveMutation = useKeywordSaveMutation(input.projectId);

  const activeSearchKey = input.keywordInput.trim()
    ? buildKeywordSearchKey({
        keyword: input.keywordInput,
        locationCode,
        resultLimit: input.resultLimit,
        mode: input.keywordMode,
        clickstream: input.clickstream,
      })
    : null;

  const onFormSubmit = input.onFormSubmit;
  const controlsForm = useKeywordControlsForm(
    {
      ...input,
      locationCode: displayedLocationCode,
    },
    (value) => {
      setPreferredLocationCode(value.locationCode);
      onFormSubmit(value);
    },
  );

  const { filteredRows, activeFilterCount } = useKeywordFiltering({
    rows,
    filters: filterValues,
    sortField: input.sortField,
    sortDir: input.sortDir,
  });

  const { showApproximateMatchNotice, overviewKeyword } =
    useKeywordOverviewState({
      rows,
      searchedKeyword,
      selectedKeyword: uiState.selectedKeyword,
      hasSearched,
      isLoading,
      lastSearchError,
      keywordMode: input.keywordMode,
    });

  const serp = useKeywordSerpAnalysis(
    input.projectId,
    uiState.selectedKeyword?.keyword ?? searchedKeyword,
    locationCode,
  );
  const { setSerpPage } = serp;
  const previousSearchKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeSearchKey === previousSearchKeyRef.current) return;
    previousSearchKeyRef.current = activeSearchKey;
    clearSelection();
    uiState.setSelectedKeyword(null);
    setSerpPage(0);
  }, [activeSearchKey, clearSelection, setSerpPage, uiState]);

  const retrySearch = useCallback(() => {
    void retryResearch();
  }, [retryResearch]);

  const handleSearchSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      void controlsForm.handleSubmit();
    },
    [controlsForm],
  );

  const toggleSort = useCallback(
    (field: SortField) => {
      setSearchParams(getNextSortParams(input.sortField, input.sortDir, field));
    },
    [input.sortDir, input.sortField, setSearchParams],
  );

  const { handleSaveKeywords, confirmSave, exportCsv, sheetsExportRows } =
    useSaveAndExportActions({
      selectedRows,
      rows,
      filteredRows,
      input,
      saveKeywordsMutate: saveMutation.mutate,
      resetSaveError: saveMutation.reset,
      setShowSaveDialog: uiState.setShowSaveDialog,
    });

  const handleToggleAllRows = () => {
    toggleAllRows(filteredRows.map((row) => row.keyword));
  };

  const handleRowClick = (row: KeywordResearchRow) => {
    captureClientEvent("keyword_research:serp_open");
    uiState.setSelectedKeyword(row);
    serp.inspectSerp(row.keyword);
  };

  return {
    activeFilterCount,
    ...serp,
    needsSearch,
    confirmSave,
    controlsForm,
    exportCsv,
    sheetsExportRows,
    filteredRows,
    filtersForm,
    handleRowClick,
    handleSaveKeywords,
    handleSearchSubmit,
    hasSearched,
    history,
    historyLoaded,
    isLoading,
    lastResultSource,
    lastSearchError,
    lastSearchKeyword,
    lastSearchLocationCode,
    lastUsedFallback,
    mobileTab: uiState.mobileTab,
    overviewKeyword,
    removeHistoryItem,
    researchError,
    researchMutationError,
    retrySearch,
    resetFilters,
    rows,
    searchedKeyword,
    selectedRows,
    selectKeyword: (row: KeywordResearchRow) => {
      uiState.setSelectedKeyword(row);
      setSerpPage(0);
    },
    setMobileTab: uiState.setMobileTab,
    setSelectedRows,
    setShowFilters: uiState.setShowFilters,
    setShowSaveDialog: uiState.setShowSaveDialog,
    showApproximateMatchNotice,
    showFilters: uiState.showFilters,
    showSaveDialog: uiState.showSaveDialog,
    isSaving: saveMutation.isPending,
    saveError: saveMutation.error
      ? getStandardErrorMessage(saveMutation.error, "Save failed. Try again.")
      : null,
    sortDir: input.sortDir,
    sortField: input.sortField,
    toggleAllRows: handleToggleAllRows,
    toggleRowSelection,
    toggleSort,
  };
}
