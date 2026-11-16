import {
  deleteSavedKeywordTag,
  getCachedResearch,
  getSavedKeywords,
  getSerpAnalysis,
  removeSavedKeywords,
  research,
  saveKeywords,
  exportSavedKeywords,
  updateSavedKeywordTag,
  updateSavedKeywordTags,
  refreshSavedKeywordMetrics,
} from "@/server/features/keywords/services/research";

export const KeywordResearchService = {
  research,
  getSerpAnalysis,
  saveKeywords,
  getCachedResearch,
  getSavedKeywords,
  exportSavedKeywords,
  updateSavedKeywordTags,
  updateSavedKeywordTag,
  deleteSavedKeywordTag,
  removeSavedKeywords,
  refreshSavedKeywordMetrics,
} as const;
