import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRetainedSearchReport } from "@/serverFunctions/searchPerformance";
import type { getRetainedSearchSource } from "@/serverFunctions/searchPerformance";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { RetainedNotesEditor } from "./RetainedSearchNotes";
import { RetainedSearchImport } from "./RetainedSearchImport";
import { RetainedSearchReport } from "./RetainedSearchReport";
export type Source = NonNullable<
  Awaited<ReturnType<typeof getRetainedSearchSource>>
>;
export type Report = Awaited<ReturnType<typeof getRetainedSearchReport>>;
export function RetainedSearchPerformance({
  projectId,
  source,
}: {
  projectId: string;
  source: Source | null;
}) {
  const client = useQueryClient();
  const end =
    source?.history.reduce(
      (date, row) => (row.endDate > date ? row.endDate : date),
      "",
    ) || new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(() =>
    new Date(new Date(`${end}T00:00:00Z`).getTime() - 27 * 86400000)
      .toISOString()
      .slice(0, 10),
  );
  const [endDate, setEndDate] = useState(end);
  const [device, setDevice] = useState<"ALL" | "DESKTOP" | "MOBILE" | "TABLET">(
    "ALL",
  );
  const [country, setCountry] = useState("ALL");
  const [trackedOnly, setTrackedOnly] = useState(false);
  const reportQuery = useQuery({
    queryKey: [
      "retainedSearchPerformance",
      projectId,
      source?.property,
      source?.revision,
      source?.notes.revision,
      trackedOnly,
      startDate,
      endDate,
      device,
      country,
    ],
    queryFn: () =>
      getRetainedSearchReport({
        data: {
          projectId,
          property: source!.property,
          revision: source!.revision,
          notesRevision: source!.notes.revision,
          trackedOnly,
          startDate,
          endDate,
          device,
          country,
        },
      }),
    enabled:
      !!source?.revision && !!startDate && !!endDate && startDate <= endDate,
    placeholderData: (previous, query) =>
      query?.queryKey[1] === projectId &&
      query.queryKey[2] === source?.property &&
      query.queryKey[3] === source?.revision &&
      query.queryKey[4] === source?.notes.revision
        ? previous
        : undefined,
  });
  const report = reportQuery.data;
  const validDates = Boolean(startDate && endDate && startDate <= endDate);
  const settledRange =
    validDates &&
    !reportQuery.isPlaceholderData &&
    !reportQuery.isFetching &&
    !reportQuery.isError
      ? { startDate, endDate }
      : null;
  return (
    <section
      className="retained-search space-y-5"
      aria-label="Saved Search Console data"
    >
      <RetainedSearchImport projectId={projectId} source={source} />
      {source?.revision ? (
        <RetainedNotesEditor projectId={projectId} saved={source.notes} />
      ) : null}
      {!source?.revision ? (
        <div className="rounded-xl border border-dashed border-base-300 p-8 text-center">
          <h2 className="font-medium">No saved observations yet</h2>
          <p className="mt-2 text-sm text-base-content/60">
            Import a Search Console dataset for this project. No Google
            connection or live request is needed.
          </p>
        </div>
      ) : (
        <>
          <div className="retained-filters flex flex-wrap items-center gap-3">
            <label className="text-xs text-base-content/60">
              From
              <input
                className="input input-bordered input-sm ml-2"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <label className="text-xs text-base-content/60">
              To
              <input
                className="input input-bordered input-sm ml-2"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={trackedOnly}
                onChange={(e) => setTrackedOnly(e.target.checked)}
              />
              Tracked queries only
            </label>
            <select
              className="select select-bordered select-sm w-auto"
              value={device}
              aria-label="Retained device filter"
              onChange={(e) => {
                const value = e.target.value;
                if (
                  value === "ALL" ||
                  value === "DESKTOP" ||
                  value === "MOBILE" ||
                  value === "TABLET"
                )
                  setDevice(value);
              }}
            >
              <option value="ALL">All devices</option>
              {(report?.devices ?? [])
                .filter((d) => d !== "ALL")
                .map((d) => (
                  <option key={d}>{d}</option>
                ))}
            </select>
            <select
              className="select select-bordered select-sm w-auto"
              value={country}
              aria-label="Retained country filter"
              onChange={(e) => setCountry(e.target.value)}
            >
              <option value="ALL">All countries</option>
              {(report?.countries ?? [])
                .filter((c) => c !== "ALL")
                .map((c) => (
                  <option key={c}>{c}</option>
                ))}
            </select>
          </div>

          {!validDates ? (
            <p role="alert" className="text-sm text-error">
              Choose a start and end date. The end date must be on or after the
              start date.
            </p>
          ) : reportQuery.isError ? (
            <div role="alert" className="text-sm text-error">
              {getStandardErrorMessage(reportQuery.error)}{" "}
              <button
                className="link"
                onClick={() =>
                  void client.invalidateQueries({
                    queryKey: ["retainedSearchSource", projectId],
                  })
                }
              >
                Refresh saved source
              </button>
            </div>
          ) : reportQuery.isPending ? (
            <div role="status" className="py-10 text-base-content/60">
              Loading saved observations…
            </div>
          ) : report ? (
            <>
              <span role="status" className="sr-only">
                {reportQuery.isFetching ? "Updating view" : "View updated"}
              </span>
              <RetainedSearchReport
                projectId={projectId}
                range={settledRange}
                filters={{
                  device,
                  country,
                  trackedOnly,
                  notesRevision: source.notes.revision,
                }}
                report={report}
                fetching={reportQuery.isFetching}
              />
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
