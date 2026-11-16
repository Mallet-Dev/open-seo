import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  Columns3,
  SearchCheck,
  Sparkles,
} from "lucide-react";
import { promptOptions, type PromptDraft } from "./aiSearchQueries";
import {
  HostedPlanGate,
  type HostedPlanGateState,
} from "@/client/features/billing/HostedPlanGate";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { PromptExplorerForm } from "@/client/features/ai-search/components/PromptExplorerForm";
import { PromptExplorerResults } from "@/client/features/ai-search/components/PromptExplorerResults";
import { PromptExplorerLoadingState } from "@/client/features/ai-search/components/PromptExplorerLoadingState";
import { PromptExplorerHistorySection } from "@/client/features/ai-search/components/PromptExplorerHistorySection";
import { AiSearchPaidPlanGate } from "@/client/features/ai-search/components/AiSearchPaidPlanGate";
import { usePromptExplorerSearchHistory } from "@/client/hooks/usePromptExplorerSearchHistory";
import { PROMPT_EXPLORER_MAX_PROMPT_LENGTH } from "@/types/schemas/ai-search";

type Props = {
  projectId: string;
  urlState: PromptDraft;
  onSubmit: (values: PromptDraft) => void;
};

const PROMPT_EXPLORER_BULLETS = [
  {
    icon: Columns3,
    title: "Four models side-by-side",
    body: "Run one prompt across ChatGPT, Claude, Gemini, and Perplexity and compare answers in a single view.",
  },
  {
    icon: SearchCheck,
    title: "See what the models cite",
    body: "Every answer lists the sources it drew from, so you can audit where each model gets its information.",
  },
  {
    icon: Sparkles,
    title: "Check brand mentions",
    body: "Highlight a brand to instantly see whether it shows up in the answer text or the cited sources.",
  },
];

export function PromptExplorerPage(props: Props) {
  return (
    <HostedPlanGate>
      {(planGate) => (
        <PromptExplorerPageInner
          key={JSON.stringify([props.projectId, props.urlState])}
          {...props}
          planGate={planGate}
        />
      )}
    </HostedPlanGate>
  );
}

function PromptExplorerPageInner({
  projectId,
  urlState,
  onSubmit,
  planGate,
}: Props & { planGate: HostedPlanGateState }) {
  const [form, setForm] = useState<PromptDraft>(urlState);
  const [validationError, setValidationError] = useState<string | null>(null);

  const {
    history,
    isLoaded: historyLoaded,
    addSearch,
    removeHistoryItem,
  } = usePromptExplorerSearchHistory(projectId);

  const trimmedPrompt = urlState.prompt.trim();
  const hasActivePrompt = trimmedPrompt.length > 0;

  const client = useQueryClient();
  const exploreQuery = useQuery(promptOptions(projectId, urlState));

  // Persist successful searches to history. Run on isSuccess so failed
  // requests don't pollute recent searches. The dedup ref prevents repeat
  // adds when downstream renders create new urlState references.
  const lastAddedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hasActivePrompt || !exploreQuery.isSuccess) return;
    const key = [
      trimmedPrompt,
      urlState.highlightBrand.trim(),
      urlState.models.toSorted().join(","),
      urlState.webSearch,
      urlState.webSearchCountryCode,
    ].join("|");
    if (lastAddedKeyRef.current === key) return;
    lastAddedKeyRef.current = key;
    addSearch({
      prompt: trimmedPrompt,
      highlightBrand: urlState.highlightBrand.trim(),
      models: urlState.models,
      webSearch: urlState.webSearch,
      webSearchCountryCode: urlState.webSearchCountryCode,
    });
  }, [
    hasActivePrompt,
    exploreQuery.isSuccess,
    trimmedPrompt,
    urlState.highlightBrand,
    urlState.models,
    urlState.webSearch,
    urlState.webSearchCountryCode,
    addSearch,
  ]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = form.prompt.trim();
    if (trimmed.length === 0) {
      setValidationError("Enter a prompt");
      return;
    }
    if (trimmed.length > PROMPT_EXPLORER_MAX_PROMPT_LENGTH) {
      setValidationError(
        `Keep prompts under ${PROMPT_EXPLORER_MAX_PROMPT_LENGTH} characters`,
      );
      return;
    }
    if (form.models.length === 0) {
      setValidationError("Select at least one model");
      return;
    }
    setValidationError(null);
    const submitted = {
      ...form,
      models: [...new Set(form.models)],
      prompt: trimmed,
      highlightBrand: form.highlightBrand.trim(),
    };
    onSubmit(submitted);
    void client.prefetchQuery(promptOptions(projectId, submitted));
  };

  const errorMessage =
    hasActivePrompt && exploreQuery.isError
      ? getStandardErrorMessage(exploreQuery.error)
      : null;
  const isLoading = hasActivePrompt && exploreQuery.isFetching;
  const resultData = hasActivePrompt ? exploreQuery.data : undefined;

  const updateForm = <K extends keyof PromptDraft>(
    key: K,
    value: PromptDraft[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (validationError) setValidationError(null);
  };

  return (
    <div className="search-workspace ai-workspace">
      <div className="space-y-6">
        <header className="search-workspace-header">
          <h1>Prompt Explorer</h1>
        </header>

        {planGate.isFreePlan ? (
          <AiSearchPaidPlanGate
            feature="Prompt Explorer"
            description="Ask one prompt across ChatGPT, Claude, Gemini, and Perplexity at the same time and compare their answers — including which sources each model cites."
            bullets={PROMPT_EXPLORER_BULLETS}
          />
        ) : (
          <>
            <PromptExplorerForm
              form={form}
              onPromptChange={(value) => updateForm("prompt", value)}
              onHighlightBrandChange={(value) =>
                updateForm("highlightBrand", value)
              }
              onModelsChange={(value) => updateForm("models", value)}
              onWebSearchChange={(value) => updateForm("webSearch", value)}
              onCountryChange={(value) =>
                updateForm("webSearchCountryCode", value)
              }
              onSubmit={handleSubmit}
              isLoading={isLoading}
              validationError={validationError}
            />

            {errorMessage ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            ) : null}

            {isLoading ? (
              <PromptExplorerLoadingState
                modelCount={new Set(urlState.models).size}
              />
            ) : resultData ? (
              <>
                <div>
                  <Link
                    from="/p/$projectId/prompt-explorer"
                    to="/p/$projectId/prompt-explorer"
                    params={{ projectId }}
                    search={{}}
                    replace
                    className="btn btn-ghost btn-sm gap-2 px-0 text-base-content/70 hover:bg-transparent"
                  >
                    <ArrowLeft className="size-4" />
                    Recent searches
                  </Link>
                </div>
                <PromptExplorerResults result={resultData} />
              </>
            ) : !errorMessage ? (
              hasActivePrompt ? (
                <p role="status" className="text-sm text-base-content/70">
                  Prompt ready. Run it to request answers from the selected
                  models.
                </p>
              ) : (
                <PromptExplorerHistorySection
                  projectId={projectId}
                  history={history}
                  historyLoaded={historyLoaded}
                  onRemoveHistoryItem={removeHistoryItem}
                />
              )
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
