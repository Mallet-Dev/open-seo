import { useId, useMemo, useRef, useState } from "react";
import {
  AppDataTable,
  useAppTable,
} from "@/client/components/table/AppDataTable";
import type { ColumnDef } from "@tanstack/react-table";
import type { ReviewEvidence as Evidence } from "@/shared/local-reviews";
import { isHttpUrl } from "@/client/components/Markdown";
type Row = Evidence["rows"][number];
const replyLabel = {
  present: "Replied",
  absent: "No reply",
  unknown: "Not returned",
};
const rating = (value: number | null, max: number | null) =>
  value === null
    ? "Not returned"
    : `${value}${max === null ? "" : ` / ${max}`}`;
export function ReviewEvidence({
  snapshot,
  includeOtherSources,
}: {
  snapshot: Evidence;
  includeOtherSources: boolean;
}) {
  const detailId = useId();
  const detailRef = useRef<HTMLElement>(null);
  const reviewButton = useRef<HTMLButtonElement | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState("");
  const [reply, setReply] = useState("all");
  const [selected, setSelected] = useState(0);
  const normalizedFilter = filter.trim().toLowerCase();
  const rows = useMemo(
    () =>
      snapshot.rows
        .map((row, index) => ({ ...row, index }))
        .filter(
          (row) =>
            (reply === "all" || row.replyState === reply) &&
            (!normalizedFilter ||
              [
                row.text,
                row.originalText,
                row.author,
                row.sourceTitle,
                row.sourceDomain,
              ].some((value) =>
                value?.toLowerCase().includes(normalizedFilter),
              )),
        ),
    [snapshot.rows, reply, normalizedFilter],
  );
  const active = rows.find((row) => row.index === selected) ?? rows[0];
  const columns: ColumnDef<Row & { index: number }>[] = [
    {
      header: "Review",
      id: "review",
      cell: ({ row }) => (
        <button
          className="reviews-open"
          type="button"
          aria-pressed={active?.index === row.original.index}
          aria-controls={detailId}
          onClick={(event) => {
            reviewButton.current = event.currentTarget;
            setSelected(row.original.index);
            detailRef.current?.focus();
          }}
        >
          <strong>{row.original.author ?? "Author not returned"}</strong>
          <span>
            {row.original.text ??
              row.original.originalText ??
              "Review text not returned"}
          </span>
        </button>
      ),
    },
    {
      header: "Rating",
      id: "rating",
      cell: ({ row }) =>
        rating(row.original.ratingValue, row.original.ratingMax),
    },
    {
      header: "Reply",
      id: "reply",
      cell: ({ row }) => replyLabel[row.original.replyState],
    },
  ];
  const table = useAppTable({
    data: rows,
    columns,
    getRowId: (row) => String(row.index),
  });
  return (
    <section className="reviews-saved" aria-label="Saved review evidence">
      <div className="maps-metrics reviews-metrics">
        <div>
          <span>Saved reviews</span>
          <strong>{snapshot.rows.length}</strong>
        </div>
        <div>
          <span>Profile reviews reported</span>
          <strong>{snapshot.reportedReviewCount ?? "Unknown"}</strong>
        </div>
        <div>
          <span>No reply in sample</span>
          <strong>
            {snapshot.rows.filter((row) => row.replyState === "absent").length}
          </strong>
          <p>
            {snapshot.rows.filter((row) => row.replyState === "unknown").length}{" "}
            reply states unknown
          </p>
        </div>
      </div>
      <div className="reviews-source">
        <div>
          <strong>{snapshot.title ?? "Saved review sample"}</strong>
          <span>
            Profile rating {rating(snapshot.ratingValue, snapshot.ratingMax)}
            {snapshot.ratingType ? ` · ${snapshot.ratingType}` : ""}
          </span>
        </div>
        <div>
          <time dateTime={snapshot.retrievedAt}>
            Retrieved{" "}
            {new Date(snapshot.retrievedAt).toLocaleString(undefined, {
              timeZoneName: "short",
            })}
          </time>
          {snapshot.providerObservedAt ? (
            <span>Provider observation {snapshot.providerObservedAt}</span>
          ) : null}
        </div>
      </div>
      {snapshot.reportedItemsCount !== null &&
      snapshot.reportedItemsCount !== snapshot.rows.length ? (
        <p className="reviews-notice">
          The provider reported {snapshot.reportedItemsCount} returned items;{" "}
          {snapshot.rows.length} were saved.
        </p>
      ) : null}
      <p className="reviews-sample-note">
        This saved sample does not represent every review on the profile.
      </p>
      <div className="reviews-toolbar">
        <label>
          Find review
          <input
            ref={searchInput}
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
        <label>
          Reply
          <select
            value={reply}
            onChange={(event) => setReply(event.target.value)}
          >
            <option value="all">All reviews</option>
            <option value="absent">No reply</option>
            <option value="present">Replied</option>
            <option value="unknown">Not returned</option>
          </select>
        </label>
        <span>
          {rows.length} of {snapshot.rows.length} saved reviews
        </span>
      </div>
      <div className="reviews-evidence-layout">
        <AppDataTable
          table={table}
          empty={
            <p className="maps-status">
              {snapshot.rows.length
                ? "No saved reviews match these filters."
                : "No reviews were returned in this collection."}
            </p>
          }
          getRowClassName={(row) =>
            row.original.index === active?.index ? "is-selected" : ""
          }
        />
        {active ? (
          <aside
            id={detailId}
            ref={detailRef}
            tabIndex={-1}
            className="reviews-detail"
            aria-label="Selected review"
          >
            <header>
              <span>
                {active.sourceTitle ??
                  active.sourceDomain ??
                  (includeOtherSources ? "Source not returned" : "Google")}
              </span>
              <h2>{active.author ?? "Author not returned"}</h2>
              <p>
                {rating(active.ratingValue, active.ratingMax)}
                {active.ratingType ? ` · ${active.ratingType}` : ""}
              </p>
              <p>
                {active.timestamp ??
                  active.timeAgo ??
                  "Review time not returned"}
              </p>
            </header>
            <div>
              <p className="reviews-full-text">
                {active.text ?? "Review text not returned"}
              </p>
              {active.originalText && active.originalText !== active.text ? (
                <section>
                  <h3>
                    Original text
                    {active.language ? ` · ${active.language}` : ""}
                  </h3>
                  <p className="reviews-full-text">{active.originalText}</p>
                </section>
              ) : null}
              <section>
                <h3>{replyLabel[active.replyState]}</h3>
                <p className="reviews-full-text">
                  {active.ownerAnswer?.trim() ||
                    active.originalOwnerAnswer?.trim() ||
                    (active.replyState === "absent"
                      ? "The source explicitly returned no owner reply."
                      : "Owner reply information was not returned.")}
                </p>
                {active.ownerAnswer?.trim() &&
                active.originalOwnerAnswer &&
                active.originalOwnerAnswer !== active.ownerAnswer ? (
                  <p className="reviews-full-text">
                    {active.originalOwnerAnswer}
                  </p>
                ) : null}
                {active.ownerTimestamp || active.ownerTimeAgo ? (
                  <p>{active.ownerTimestamp ?? active.ownerTimeAgo}</p>
                ) : null}
              </section>
              {isHttpUrl(active.reviewUrl ?? undefined) ? (
                <a href={active.reviewUrl!} target="_blank" rel="noreferrer">
                  Open source review
                </a>
              ) : null}
              <button
                className="reviews-return"
                type="button"
                onClick={() =>
                  (reviewButton.current?.isConnected
                    ? reviewButton.current
                    : searchInput.current
                  )?.focus()
                }
              >
                Back to review list
              </button>
            </div>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
