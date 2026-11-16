import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import { saveRetainedSearchNotes } from "@/serverFunctions/searchPerformance";
import { retainedNotesSchema } from "@/shared/gsc-retained";
import type { Source } from "./RetainedSearchPerformance";
export function RetainedNotesEditor({
  projectId,
  saved,
}: {
  projectId: string;
  saved: Source["notes"];
}) {
  const client = useQueryClient();
  const [targets, setTargets] = useState(saved.targets);
  const [journal, setJournal] = useState(saved.journal);
  const [base, setBase] = useState(saved.revision);
  const [error, setError] = useState("");
  const operation = useRef<{ fingerprint: string; id: string } | null>(null);
  const mutation = useMutation({
    mutationFn: (
      input: Parameters<typeof saveRetainedSearchNotes>[0]["data"]["input"],
    ) => saveRetainedSearchNotes({ data: { projectId, input } }),
    retry: false,
    onError: async (failure) => {
      if (getErrorCode(failure) === "CONFLICT")
        await client.invalidateQueries({
          queryKey: ["retainedSearchSource", projectId],
        });
    },
    onSuccess: async (receipt) => {
      setBase(receipt.revision);
      operation.current = null;
      await client.invalidateQueries({
        queryKey: ["retainedSearchSource", projectId],
      });
    },
  });
  function save() {
    const draft = { expectedRevision: base, targets, journal };
    const fingerprint = JSON.stringify(draft);
    if (operation.current?.fingerprint !== fingerprint)
      operation.current = { fingerprint, id: crypto.randomUUID() };
    const input = retainedNotesSchema.safeParse({
      ...draft,
      operationId: operation.current.id,
    });
    if (!input.success) {
      setError("Each query needs a unique name. Labels can be left blank.");
      return;
    }
    setError("");
    mutation.mutate(input.data);
  }
  return (
    <details className="retained-disclosure">
      <summary>
        <span className="retained-disclosure-title">
          Tracking & notes <span>{saved.targets.length} queries</span>
        </span>
        <span className="retained-disclosure-action">
          <span className="when-closed">Edit</span>
          <span className="when-open">Close</span>
        </span>
      </summary>
      <div className="retained-notes-body space-y-4">
        <fieldset disabled={mutation.isPending} className="space-y-4">
          {saved.revision !== base ? (
            <div role="status" className="text-sm text-warning">
              Saved notes changed. Your draft is preserved.{" "}
              <button
                className="link"
                onClick={() => {
                  setBase(saved.revision);
                  setTargets(saved.targets);
                  setJournal(saved.journal);
                  operation.current = null;
                }}
              >
                Replace draft with saved notes
              </button>
            </div>
          ) : null}
          <div className="space-y-2">
            {targets.map((target, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <input
                  className="input input-bordered input-sm min-w-0 flex-1"
                  aria-label={`Tracked query ${index + 1}`}
                  value={target.query}
                  onChange={(e) =>
                    setTargets(
                      targets.map((row, i) =>
                        i === index ? { ...row, query: e.target.value } : row,
                      ),
                    )
                  }
                />
                <input
                  className="input input-bordered input-sm w-36"
                  placeholder="Label"
                  aria-label={`Query label ${index + 1}`}
                  value={target.label}
                  onChange={(e) =>
                    setTargets(
                      targets.map((row, i) =>
                        i === index ? { ...row, label: e.target.value } : row,
                      ),
                    )
                  }
                />
                <button
                  className="btn btn-ghost btn-sm btn-square"
                  aria-label={`Remove tracked query ${index + 1}`}
                  onClick={() =>
                    setTargets(targets.filter((_, i) => i !== index))
                  }
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setTargets([...targets, { query: "", label: "" }])}
            >
              Add query
            </button>
          </div>
          <label className="block text-sm font-medium">
            Journal
            <textarea
              className="textarea textarea-bordered mt-2 w-full font-normal"
              rows={3}
              value={journal}
              onChange={(e) => setJournal(e.target.value)}
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              className="btn btn-primary btn-sm motion-safe:active:scale-[.98]"
              onClick={save}
            >
              {mutation.isPending
                ? "Saving…"
                : mutation.isError
                  ? "Retry save"
                  : "Save tracking & notes"}
            </button>
            {mutation.isSuccess ? (
              <span role="status" className="text-xs text-base-content/60">
                Saved
              </span>
            ) : null}
          </div>
        </fieldset>
        {error || mutation.isError ? (
          <p role="alert" className="text-sm text-error">
            {error || getStandardErrorMessage(mutation.error)}
          </p>
        ) : null}
      </div>
    </details>
  );
}
