import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import { formatModelLabel } from "../platformLabels";
import type {
  PromptExplorerModel,
  PromptExplorerModelResult,
} from "@/types/schemas/ai-search";

export function PromptSources({
  results,
}: {
  results: PromptExplorerModelResult[];
}) {
  const sources = new Map<
    string,
    { title: string | null; models: Set<PromptExplorerModel> }
  >();
  for (const answer of results) {
    if (answer.status !== "success") continue;
    for (const citation of answer.citations) {
      const source = sources.get(citation.url) ?? {
        title: citation.title,
        models: new Set<PromptExplorerModel>(),
      };
      source.models.add(answer.model);
      sources.set(citation.url, source);
    }
  }
  const rows = [...sources].toSorted(
    ([, a], [, b]) => b.models.size - a.models.size,
  );
  return (
    <section
      className="ai-citation-index"
      aria-label="Sources across model answers"
    >
      <header>
        <h3>Cited pages</h3>
        <span>{rows.length} distinct URLs</span>
      </header>
      {results.flatMap((answer) => {
        if (answer.status === "success" && answer.citations.length) return [];
        return (
          <p key={answer.model}>
            {formatModelLabel(answer.model)}:{" "}
            {answer.status === "error"
              ? "Answer unavailable"
              : "No citations returned"}
          </p>
        );
      })}
      <ul>
        {rows.map(([url, source]) => (
          <li key={url}>
            <div className="ai-citation-page">
              <SafeExternalLink
                url={url}
                label={source.title || url}
                className="ai-citation-link"
              />
              {source.title && <span>{url}</span>}
            </div>
            <div className="ai-citation-models">
              {[...source.models].map((model) => (
                <span key={model}>{formatModelLabel(model)}</span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
