import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  listReviewRequests,
  prepareReviewRequest,
  getReviewReport,
  quoteReviewCollection,
  startReviewCollection,
  collectReviewReport,
} from "@/serverFunctions/localReviews";
import {
  getStandardErrorMessage,
  getErrorCode,
} from "@/client/lib/error-messages";
import { downloadFile } from "@/client/lib/download";
import { jsonCodec } from "@/shared/json";
import type { ReviewTaskRequest } from "@/shared/local-reviews";
import { ReviewEvidence } from "./ReviewEvidence";
import { ReviewDraftForm } from "./ReviewDraftForm";
import { FrozenRequest, stateLabel } from "./ReviewRequestSummary";
const recoveryCodec = jsonCodec(
  z.object({
    id: z.uuid(),
    projectId: z.string(),
    organizationId: z.string(),
    providerTaskId: z.string().nullable(),
    state: z.literal("unknown"),
  }),
);
export function LocalReviewsPage({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const [selected, setSelected] = useState("");
  const [draftOpen, setDraftOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const preparation = useRef<{ key: string; id: string } | null>(null);
  const history = useQuery({
    queryKey: ["reviewRequests", projectId],
    queryFn: () => listReviewRequests({ data: { projectId } }),
  });
  const active =
    history.data?.requests.find((item) => item.id === selected) ??
    history.data?.requests[0];
  async function prepare(request: ReviewTaskRequest) {
    setBusy(true);
    setError("");
    const key = JSON.stringify(request);
    if (preparation.current?.key !== key)
      preparation.current = { key, id: crypto.randomUUID() };
    try {
      const saved = await prepareReviewRequest({
        data: { projectId, requestId: preparation.current.id, request },
      });
      setSelected(saved.id);
      await client.invalidateQueries({
        queryKey: ["reviewRequests", projectId],
      });
      setDraftOpen(false);
      preparation.current = null;
    } catch (caught) {
      setError(getStandardErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="search-workspace reviews-workspace">
      <header className="search-workspace-header">
        <h1>Local reviews</h1>
        {active && !draftOpen ? (
          <button
            className="maps-action"
            disabled={busy}
            onClick={() => setDraftOpen(true)}
          >
            New request
          </button>
        ) : null}
      </header>
      {error || history.isError ? (
        <p role="alert" className="maps-error">
          {error || getStandardErrorMessage(history.error)}
        </p>
      ) : null}
      {history.isPending ? (
        <p className="maps-status">Loading saved requests…</p>
      ) : null}
      {history.data && (draftOpen || !active) ? (
        <ReviewDraftForm
          market={history.data.market}
          onPrepare={prepare}
          busy={busy}
          onCancel={active ? () => setDraftOpen(false) : undefined}
        />
      ) : null}
      {active ? (
        <>
          <label className="reviews-history">
            Saved request
            <select
              value={active.id}
              disabled={busy}
              onChange={(event) => setSelected(event.target.value)}
            >
              {history.data?.requests.map((task) => (
                <option key={task.id} value={task.id}>
                  {new Date(task.createdAt).toLocaleString()} ·{" "}
                  {task.identityValue} ·{" "}
                  {task.hasSnapshot ? "Saved report" : stateLabel[task.state]}
                </option>
              ))}
            </select>
          </label>
          <ReviewRequestPanel
            key={active.id}
            projectId={projectId}
            taskId={active.id}
            onBusy={setBusy}
          />
        </>
      ) : null}
    </main>
  );
}
function ReviewRequestPanel({
  projectId,
  taskId,
  onBusy,
}: {
  projectId: string;
  taskId: string;
  onBusy: (busy: boolean) => void;
}) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [recovery, setRecovery] = useState(() => {
    try {
      const raw = sessionStorage.getItem(
        `review-recovery:${projectId}:${taskId}`,
      );
      const parsed = raw ? recoveryCodec.safeParse(raw) : null;
      return parsed?.success &&
        parsed.data.projectId === projectId &&
        parsed.data.id === taskId
        ? parsed.data
        : null;
    } catch {
      return null;
    }
  });
  const report = useQuery({
    queryKey: ["reviewReport", projectId, taskId],
    queryFn: () => getReviewReport({ data: { projectId, requestId: taskId } }),
    refetchOnWindowFocus: false,
  });
  const task = report.data?.task;
  const snapshot = report.data?.snapshot;
  const quote = useQuery({
    queryKey: ["reviewQuote", projectId, taskId],
    queryFn: () =>
      quoteReviewCollection({ data: { projectId, requestId: taskId } }),
    enabled: task?.state === "prepared" && !recovery,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  async function act(kind: "start" | "collect") {
    if (kind === "start" && recovery) return;
    setBusy(true);
    onBusy(true);
    setError("");
    setNotice("");
    try {
      if (kind === "start") {
        if (!approved || !quote.data) return;
        const result = await startReviewCollection({
          data: { projectId, requestId: taskId, approval: quote.data },
        });
        if (result.recovery) {
          setRecovery(result.recovery);
          try {
            sessionStorage.setItem(
              `review-recovery:${projectId}:${taskId}`,
              JSON.stringify(result.recovery),
            );
          } catch {
            setNotice("Save the recovery reference before leaving this page.");
          }
        }
      } else {
        const result = await collectReviewReport({
          data: { projectId, requestId: taskId },
        });
        if (result.status === "processing")
          setNotice(
            "Collection is still processing. Check this saved request again later.",
          );
      }
      await Promise.all([
        client.invalidateQueries({
          queryKey: ["reviewReport", projectId, taskId],
        }),
        client.invalidateQueries({ queryKey: ["reviewRequests", projectId] }),
      ]);
      setApproved(false);
    } catch (caught) {
      setError(
        kind === "start" && getErrorCode(caught) === "CONFLICT"
          ? "The request or estimate changed. Review the saved settings and approve the current estimate."
          : getStandardErrorMessage(caught),
      );
      setApproved(false);
      await Promise.all([
        client.invalidateQueries({
          queryKey: ["reviewReport", projectId, taskId],
        }),
        client.invalidateQueries({ queryKey: ["reviewRequests", projectId] }),
        ...(kind === "start" ? [quote.refetch()] : []),
      ]);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  const recoveryReference = recovery ? (
    <section
      className="reviews-approval reviews-held"
      aria-label="Recovery reference"
    >
      <h2>Recovery reference</h2>
      <p>
        Keep this reference for reconciliation. Do not submit this request
        again.
      </p>
      <code>{recovery.id}</code>
      <button
        className="maps-action maps-action-secondary"
        onClick={() =>
          downloadFile(
            JSON.stringify(recovery, null, 2),
            `review-recovery-${recovery.id}.json`,
            "application/json",
          )
        }
      >
        Save recovery reference
      </button>
    </section>
  ) : null;
  if (report.isPending)
    return (
      <>
        {recoveryReference}
        <p className="maps-status">Loading saved evidence…</p>
      </>
    );
  if (!task)
    return (
      <>
        {recoveryReference}
        <p role="alert" className="maps-error">
          {getStandardErrorMessage(report.error)}
        </p>
      </>
    );
  return (
    <>
      <FrozenRequest
        task={task}
        saved={Boolean(snapshot)}
        uncertain={Boolean(recovery) && !task.providerTaskId && !snapshot}
      />
      {recoveryReference}
      {error ? (
        <p role="alert" className="maps-error">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="reviews-notice">
          {notice}
        </p>
      ) : null}
      {snapshot ? (
        <ReviewEvidence
          key={task.id}
          snapshot={snapshot}
          includeOtherSources={task.includeOtherSources === 1}
        />
      ) : recovery && !task.providerTaskId ? null : task.state ===
        "prepared" ? (
        <section className="reviews-approval" aria-label="Collection approval">
          {quote.isPending ? (
            <p>Checking the estimate…</p>
          ) : quote.data ? (
            <>
              <h2>
                {quote.data.mode === "hosted"
                  ? `${quote.data.estimatedCredits} estimated credits`
                  : `US$${quote.data.estimatedChargeUsd.toFixed(5)} provider estimate`}
              </h2>
              <p>
                Priority collection for up to {task.depth} requested reviews.
                This approves an estimate, not a guaranteed spending cap. Actual
                provider charges are metered. Opening saved evidence and
                checking a queued task do not submit another collection.
              </p>
              <label className="reviews-check">
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={(event) => setApproved(event.target.checked)}
                  disabled={busy}
                />
                I approve this estimate for this saved request.
              </label>
              <button
                className="maps-action"
                disabled={!approved || busy}
                onClick={() => void act("start")}
              >
                Approve and collect
              </button>
            </>
          ) : (
            <p role="status">
              {task.includeOtherSources === 1
                ? "Extended collection pricing needs verification. Saved reports and queued collection remain available."
                : getStandardErrorMessage(quote.error)}
            </p>
          )}
        </section>
      ) : task.providerTaskId ? (
        <section className="reviews-approval">
          <p>
            The task handle is saved. Checking it does not create or charge for
            another submission.
          </p>
          <button
            className="maps-action"
            disabled={busy}
            onClick={() => void act("collect")}
          >
            Check collection
          </button>
        </section>
      ) : (
        <section className="reviews-approval reviews-held">
          <h2>Submission unconfirmed</h2>
          <p>
            Do not submit this request again. Its outcome needs reconciliation.
          </p>
          <code>{task.id}</code>
        </section>
      )}
    </>
  );
}
