import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2 } from "lucide-react";
import {
  adaptRetainedImport,
  type RetainedImportInput,
} from "@/shared/gsc-retained";
import { importRetainedSearch } from "@/serverFunctions/searchPerformance";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import type { Source } from "./RetainedSearchPerformance";
const number = new Intl.NumberFormat("en-CA");
export function RetainedSearchImport({
  projectId,
  source,
}: {
  projectId: string;
  source: Source | null;
}) {
  const client = useQueryClient();
  const [candidate, setCandidate] = useState<RetainedImportInput | null>(null);
  const [fileError, setFileError] = useState("");
  const fileInput = useRef<HTMLInputElement | null>(null);
  const mutation = useMutation({
    mutationFn: (input: RetainedImportInput) =>
      importRetainedSearch({ data: { projectId, input } }),
    retry: false,
    onSuccess: async () => {
      setCandidate(null);
      if (fileInput.current) fileInput.current.value = "";
      await client.invalidateQueries({
        queryKey: ["retainedSearchSource", projectId],
      });
    },
  });
  async function readFile(file: File) {
    setFileError("");
    mutation.reset();
    setCandidate(null);
    try {
      const text = await file.text();
      const digest = [
        ...new Uint8Array(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
        ),
      ]
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("");
      const raw: unknown = JSON.parse(text);
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new Error(
          "Choose a Search Console import object with property, dates and normalized rows.",
        );
      const parsed = adaptRetainedImport(raw, {
        operationId: crypto.randomUUID(),
        expectedRevision: source?.revision ?? 0,
        sourceDigest: digest,
      });
      if (source && source.property !== parsed.property)
        throw new Error("This file belongs to a different property.");
      if (fileInput.current?.files?.[0] === file) setCandidate(parsed);
    } catch (error) {
      if (fileInput.current?.files?.[0] !== file) return;
      setFileError(
        error instanceof Error ? error.message : "The file could not be read.",
      );
    }
  }
  return (
    <>
      <div className="retained-source-info flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium break-all">
            {source?.property ?? "Saved Search Console data"}
          </p>
          {source?.history.length ? (
            <p className="mt-1 text-xs text-base-content/60">
              Last imported {source.history.at(-1)?.importedAt.slice(0, 10)} ·{" "}
              {source.history.at(-1)?.collectedAt
                ? `Collected ${source.history.at(-1)?.collectedAt?.slice(0, 10)}`
                : "Collection time unknown"}{" "}
              ·{" "}
              {source.history.at(-1)?.complete === 1
                ? "Declared complete"
                : "Completeness not established"}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Choose Search Console JSON file"
            disabled={mutation.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void readFile(file);
            }}
          />
          <button
            className="btn btn-sm btn-ghost gap-2 motion-safe:active:scale-[.98]"
            disabled={mutation.isPending}
            onClick={() => fileInput.current?.click()}
          >
            <FileUp className="size-4" />
            Import JSON
          </button>
        </div>
      </div>
      {candidate ? (
        <div className="rounded-xl border border-base-300 bg-base-200 p-4 space-y-3">
          <p className="text-sm">
            <strong>{number.format(candidate.rows.length)} observations</strong>{" "}
            for {candidate.property}, {candidate.startDate} to{" "}
            {candidate.endDate}. This replaces saved observations in that date
            window, including dates with no rows. Other dates and import history
            remain.
          </p>
          <div className="flex gap-2">
            <button
              className="btn btn-primary btn-sm"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(candidate)}
            >
              {mutation.isPending ? (
                <Loader2 className="size-4 motion-safe:animate-spin" />
              ) : null}
              {mutation.isError ? "Retry same import" : "Save import"}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              disabled={mutation.isPending}
              onClick={() => {
                setCandidate(null);
                if (fileInput.current) fileInput.current.value = "";
                mutation.reset();
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {fileError || mutation.isError ? (
        <p role="alert" className="text-sm text-error break-words">
          {fileError ||
            getStandardErrorMessage(
              mutation.error,
              "Import did not finish. Retry keeps the same operation.",
            )}
        </p>
      ) : null}
    </>
  );
}
