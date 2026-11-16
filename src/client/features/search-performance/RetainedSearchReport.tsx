import { Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Column, ColumnDef } from "@tanstack/react-table";
import {
  AppDataTable,
  useAppTable,
} from "@/client/components/table/AppDataTable";
import { TablePagination } from "@/client/components/table/TablePagination";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import { downloadCsv } from "@/client/lib/csv";
import {
  retainedQueryCsv,
  type RetainedExportFilters,
} from "./retainedQueryExport";
import type { Report } from "./RetainedSearchPerformance";
type Query = Report["queries"][number];
const number = new Intl.NumberFormat("en-CA");
const position = (value: number | null) =>
  value === null ? "—" : value.toFixed(1);
const shortDate = (value: number) =>
  new Date(value).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
export function RetainedSearchReport({
  projectId,
  range,
  report,
  fetching,
  filters,
}: {
  projectId: string;
  range: { startDate: string; endDate: string } | null;
  report: Report;
  fetching: boolean;
  filters: RetainedExportFilters;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const [search, setSearch] = useState("");
  const queryTrigger = useRef<HTMLButtonElement | null>(null);
  const querySearch = useRef<HTMLInputElement | null>(null);
  const rows = useMemo(
    () =>
      report.queries.filter((row) =>
        row.query.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
      ),
    [report, search],
  );
  const detail = rows.find((row) => row.query === selected);
  const columns = useMemo<ColumnDef<Query>[]>(
    () => [
      {
        accessorKey: "query",
        header: "Query",
        cell: ({ row }) => (
          <button
            className="text-left font-medium text-base-content hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary motion-safe:transition-colors"
            aria-expanded={row.original.query === selectedRef.current}
            aria-controls="retained-query-detail"
            onClick={(event) => {
              queryTrigger.current = event.currentTarget;
              setSelected(row.original.query);
            }}
          >
            {row.original.query}
          </button>
        ),
      },
      ...(
        [
          ["impressions", "Impressions"],
          ["clicks", "Clicks"],
          ["position", "Position"],
          ["improvement", "Change"],
        ] as const
      ).map(([key, header]) => ({
        accessorKey: key,
        header: ({ column }: { column: Column<Query> }) => (
          <SortableHeader column={column} label={header} align="right" />
        ),
        cell: ({ row }: { row: { original: Query } }) =>
          key === "position"
            ? position(row.original.position)
            : key === "improvement"
              ? row.original.improvement === null
                ? "—"
                : `${row.original.improvement > 0 ? "+" : ""}${row.original.improvement.toFixed(1)}`
              : number.format(row.original[key]),
        meta: {
          headerClassName: "text-right",
          cellClassName: "text-right tabular-nums",
        },
      })),
    ],
    [],
  );
  const table = useAppTable({
    data: rows,
    columns,
    withSorting: true,
    withPagination: true,
    initialState: { pagination: { pageIndex: 0, pageSize: 25 } },
  });
  return (
    <div className="retained-search-report space-y-5" aria-busy={fetching}>
      <div className="retained-metrics">
        <Metric label="Clicks" value={number.format(report.totals.clicks)} />
        <Metric
          label="Impressions"
          value={number.format(report.totals.impressions)}
        />
        <Metric
          label="Average position"
          value={position(report.totals.position)}
        />
        <Metric
          label="CTR"
          value={
            report.totals.ctr === null
              ? "—"
              : `${(report.totals.ctr * 100).toFixed(1)}%`
          }
        />
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <p>
          <span className="font-semibold tabular-nums">
            {report.matchedImprovement === null
              ? "No matched comparison"
              : `${report.matchedImprovement > 0 ? "+" : ""}${report.matchedImprovement.toFixed(1)} positions`}
          </span>
          <span className="text-base-content/60">
            {" "}
            · {report.commonQueries} queries seen in both periods
          </span>
        </p>
        <p className="text-xs text-base-content/60">
          Compared with {report.previousStart} to {report.previousEnd}
        </p>
      </div>
      {report.daily.length ? (
        <div
          className="retained-trend h-40"
          aria-label="Daily impression-weighted position"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              accessibilityLayer
              data={report.daily}
              margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
            >
              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={shortDate}
                minTickGap={36}
                tick={{
                  fontSize: 11,
                  fill: "var(--maps-muted)",
                }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                reversed
                width={35}
                tick={{
                  fontSize: 11,
                  fill: "var(--maps-muted)",
                }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                labelFormatter={(label) =>
                  typeof label === "number"
                    ? new Date(label).toISOString().slice(0, 10)
                    : String(label)
                }
                formatter={(value) => [
                  typeof value === "number" ? value.toFixed(1) : "—",
                  "Position",
                ]}
                contentStyle={{
                  background: "var(--color-base-100)",
                  border: "1px solid var(--color-base-300)",
                  borderRadius: 10,
                }}
              />
              <Line
                dataKey="position"
                stroke="var(--workspace-link)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
      <div className={`retained-query-layout${detail ? " has-detail" : ""}`}>
        <div className="retained-query-table overflow-hidden rounded-xl border border-base-300">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 px-4 py-3">
            <h2 className="font-medium">
              Queries{" "}
              <span className="ml-2 text-xs font-normal text-base-content/50">
                {number.format(rows.length)}
              </span>
            </h2>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!range || !rows.length}
              onClick={() => {
                if (!range) return;
                const sortedRows = table
                  .getPrePaginationRowModel()
                  .rows.map((row) => row.original);
                downloadCsv(
                  `search-console-queries-${range.startDate}-to-${range.endDate}.csv`,
                  retainedQueryCsv(report, sortedRows, range, filters, search),
                );
              }}
            >
              <Download aria-hidden="true" className="size-4" />
              Export {number.format(rows.length)} queries
            </button>
            <input
              className="input input-bordered input-sm w-full sm:w-64"
              type="search"
              placeholder="Find a query"
              ref={querySearch}
              aria-label="Find a retained query"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                table.setPageIndex(0);
              }}
            />
          </div>
          <AppDataTable
            table={table}
            empty={
              <p className="p-6 text-sm text-base-content/60">
                No observations in this view.
              </p>
            }
            getRowClassName={(row) =>
              row.original.query === selected
                ? "bg-primary/10"
                : "hover:bg-base-200/60 motion-safe:transition-colors"
            }
          />
          <TablePagination
            page={table.getState().pagination.pageIndex + 1}
            pageSize={table.getState().pagination.pageSize}
            pageSizes={[25, 50, 100]}
            totalCount={rows.length}
            hasNextPage={table.getCanNextPage()}
            isLoading={fetching}
            onPageChange={(page) => table.setPageIndex(page - 1)}
            onPageSizeChange={(size) => table.setPageSize(size)}
          />
        </div>
        {detail ? (
          <section id="retained-query-detail" className="retained-query-detail">
            <div className="retained-detail-heading flex items-start justify-between gap-3">
              <h3 className="font-medium">{detail.query}</h3>
              <button
                className="btn btn-ghost btn-xs btn-square"
                aria-label="Close query details"
                onClick={() => {
                  setSelected(null);
                  (queryTrigger.current?.isConnected
                    ? queryTrigger.current
                    : querySearch.current
                  )?.focus();
                }}
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="mt-2 text-sm text-base-content/60">
              Observed on {detail.daysObserved} days across {detail.pageCount}{" "}
              URLs.
            </p>
            {detail.dominantPage ? (
              <SafeExternalLink
                url={detail.dominantPage}
                label={detail.dominantPage}
                className="mt-3 inline-flex max-w-full items-center gap-2 break-all text-sm text-primary hover:underline"
              />
            ) : null}
            {detail.dominantPage && range && (
              <Link
                className="maps-action maps-action-secondary mt-4 text-xs"
                to="/p/$projectId/performance"
                params={{ projectId }}
                search={{
                  page: detail.dominantPage,
                  startDate: range.startDate,
                  endDate: range.endDate,
                }}
              >
                Landing-page outcomes
              </Link>
            )}
            {detail.dominantPage &&
              range &&
              (filters.country !== "ALL" || filters.device !== "ALL") && (
                <p className="retained-context-pending">
                  Landing-page outcomes use all devices and countries for the
                  selected page and period.
                </p>
              )}
            {detail.dominantPage && !range && (
              <p role="status" className="retained-context-pending">
                Updating the report before opening outcomes…
              </p>
            )}
          </section>
        ) : null}
      </div>
      <p className="text-xs text-base-content/60">
        Tracked queries: {report.observedTargets} observed of{" "}
        {report.selectedTargets} selected.
      </p>
      <p className="text-xs leading-relaxed text-base-content/55">
        Recorded query/page observations, not property totals. Position is
        weighted by impressions; change compares the same queries across both
        periods. Lower position is better. Missing data stays unknown.
      </p>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-base-content/60">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </div>
    </div>
  );
}
