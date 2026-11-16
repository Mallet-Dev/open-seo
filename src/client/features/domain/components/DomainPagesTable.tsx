import { Link } from "@tanstack/react-router";
import { memo, useMemo } from "react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import {
  AppDataTable,
  useAppTable,
} from "@/client/components/table/AppDataTable";
import { ExternalUrlCell, resolveUrlHref } from "@/client/components/table/url";
import { SortableHeader } from "@/client/features/domain/components/SortableHeader";
import { useDomainRenderDebug } from "@/client/features/domain/domainDebug";
import {
  formatNumber,
  formatRounded,
  toPageSortMode,
} from "@/client/features/domain/utils";
import type {
  DomainSortMode,
  PageRow,
  SortOrder,
} from "@/client/features/domain/types";

type Props = {
  projectId: string;
  locationCode: number;
  domain: string;
  rows: PageRow[];
  sortMode: DomainSortMode;
  currentSortOrder: SortOrder;
  onSortClick: (sort: DomainSortMode) => void;
};

const pageColumnHelper = createColumnHelper<PageRow>();

function DomainPagesTableComponent({
  projectId,
  locationCode,
  domain,
  rows,
  sortMode,
  currentSortOrder,
  onSortClick,
}: Props) {
  const renderStarted = performance.now();
  const columns = useMemo<ColumnDef<PageRow>[]>(
    () => [
      pageColumnHelper.display({
        id: "page",
        header: () => "Page",
        cell: ({ row }) => (
          <ExternalUrlCell
            value={row.original.relativePath ?? row.original.page}
            label={row.original.relativePath ?? row.original.page}
            baseDomain={domain}
            className="link link-primary inline-flex items-center gap-1"
          />
        ),
        meta: {
          cellClassName: "max-w-[420px] truncate",
        },
      }),
      pageColumnHelper.accessor("organicTraffic", {
        header: () => (
          <SortableHeader
            label="Organic Traffic"
            isActive={toPageSortMode(sortMode) === "traffic"}
            order={currentSortOrder}
            onClick={() => onSortClick("traffic")}
          />
        ),
        cell: ({ getValue }) => formatRounded(getValue()),
      }),
      pageColumnHelper.accessor("keywords", {
        header: () => (
          <SortableHeader
            label="Keywords"
            isActive={toPageSortMode(sortMode) === "keywords"}
            order={currentSortOrder}
            onClick={() => onSortClick("volume")}
          />
        ),
        cell: ({ getValue, row }) => {
          const target = resolveUrlHref(row.original.page, domain);
          const count = getValue();
          return target && count != null && count > 0 ? (
            <details>
              <summary className="w-fit cursor-pointer font-medium text-primary hover:underline">
                {formatNumber(count)}
              </summary>
              <Link
                to="/p/$projectId/domain"
                params={{ projectId }}
                preload={false}
                search={{
                  domain: target,
                  scope: "exact_url",
                  loc: locationCode,
                }}
                className="link link-primary tabular-nums"
                aria-label={`Run keyword report for ${row.original.page}`}
              >
                Run page keyword report
              </Link>
              <p className="text-xs text-base-content/65">
                A new lookup may use credits.
              </p>
            </details>
          ) : (
            formatNumber(count)
          );
        },
      }),
    ],
    [currentSortOrder, domain, projectId, locationCode, onSortClick, sortMode],
  );
  const table = useAppTable({
    data: rows,
    columns,
  });
  useDomainRenderDebug("DomainPagesTable", {
    rows: rows.length,
    durationMs: Math.round(performance.now() - renderStarted),
    sortMode,
    currentSortOrder,
  });

  return (
    <AppDataTable
      table={table}
      className="table table-sm"
      empty={
        <div className="py-6 text-center text-base-content/60">
          No pages match this search.
        </div>
      }
    />
  );
}

export const DomainPagesTable = memo(DomainPagesTableComponent);
