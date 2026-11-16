import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMapsScan, quoteMapsScan } from "@/serverFunctions/localMaps";
import { downloadFile } from "@/client/lib/download";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { MapsScanInspector } from "./MapsScanInspector";
import { useMapsScanActions } from "./useMapsScanActions";
import { mapsRecoveryCodec } from "./mapsRecovery";
type ScanView = Awaited<ReturnType<typeof getMapsScan>>;
export function MapsScanPanel({
  projectId,
  scanId,
  providerConfigured,
  onBusy,
  onPublished,
}: {
  projectId: string;
  scanId: string;
  providerConfigured: boolean;
  onBusy: (busy: boolean) => void;
  onPublished: (id: string) => void;
}) {
  const report = useQuery({
    queryKey: ["mapsScan", projectId, scanId],
    queryFn: () => getMapsScan({ data: { projectId, scanId } }),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  if (report.isPending)
    return (
      <p role="status" className="maps-status">
        Loading saved scan…
      </p>
    );
  if (!report.data)
    return (
      <p role="alert" className="maps-error">
        {getStandardErrorMessage(report.error)}
      </p>
    );
  return (
    <>
      {report.isError && (
        <p role="alert" className="maps-error">
          {getStandardErrorMessage(report.error)}
        </p>
      )}
      <ScanControls
        key={`${projectId}:${scanId}`}
        report={report.data}
        projectId={projectId}
        providerConfigured={providerConfigured}
        onBusy={onBusy}
        onPublished={onPublished}
      />
    </>
  );
}
function ScanControls({
  report,
  projectId,
  providerConfigured,
  onBusy,
  onPublished,
}: {
  report: ScanView;
  projectId: string;
  providerConfigured: boolean;
  onBusy: (busy: boolean) => void;
  onPublished: (id: string) => void;
}) {
  const { scan, spec, points } = report;
  const scanId = scan.id;
  const [approved, setApproved] = useState(false);
  const recoveryKey = `maps-recovery:${report.organizationId}:${projectId}:${scanId}`;
  const quote = useQuery({
    queryKey: ["mapsQuote", projectId, scanId],
    queryFn: () => quoteMapsScan({ data: { projectId, scanId } }),
    enabled: !report.publishedRunId,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const action = useMapsScanActions({
    projectId,
    scanId,
    recoveryKey,
    onBusy,
    onPublished,
    onApprovalRejected: async () => {
      setApproved(false);
      await quote.refetch();
    },
  });
  const { recovery, setRecovery } = action;
  useEffect(() => {
    setApproved(false);
  }, [quote.data]);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(recoveryKey);
      const parsed = raw ? mapsRecoveryCodec.safeParse(raw) : null;
      if (parsed?.success && parsed.data.scanId === scanId)
        setRecovery(parsed.data);
    } catch {
      /* Saved server claims still prevent replay. */
    }
  }, [recoveryKey, scanId, setRecovery]);
  useEffect(() => {
    if (!recovery) return;
    const saved = points[recovery.ordinal]?.receipt;
    if (
      saved?.billingState === "confirmed" &&
      saved.claimId === recovery.claimId &&
      saved.requestHash === recovery.requestHash &&
      saved.receipt?.taskId === recovery.receipt?.taskId
    ) {
      setRecovery(null);
      try {
        sessionStorage.removeItem(recoveryKey);
      } catch {
        /* Server confirmation is authoritative. */
      }
    }
  }, [points, recovery, setRecovery, recoveryKey]);
  const observed = points.filter((item) => item.observation).length;
  const unresolved = points.some(
    (item) =>
      item.point.state === "submitting" &&
      (!item.receipt || item.receipt.billingState === "uncertain"),
  );
  const pending = points.flatMap((item, index) =>
    item.receipt?.receipt?.identityVerified && !item.observation ? [index] : [],
  );
  const remaining = points.some((item) => item.point.state === "prepared");
  const approvalChanged =
    scan.state === "approved" &&
    !!quote.data &&
    (scan.pricingVersion !== quote.data.pricingVersion ||
      scan.approvalMode !== quote.data.mode ||
      scan.approvedEstimateUsd !== quote.data.estimatedChargeUsd ||
      scan.approvedEstimateCredits !== quote.data.estimatedCredits);
  const price = quote.data
    ? new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      }).format(quote.data.estimatedChargeUsd)
    : "";
  return (
    <section className="maps-scan-panel" aria-label="Saved scan collection">
      <header className="maps-scan-heading">
        <div>
          <h2>{spec.query}</h2>
          <p>
            {observed} / {points.length} points saved
          </p>
        </div>
        <button
          type="button"
          disabled={action.busy}
          onClick={() => {
            void action.refresh();
            void quote.refetch();
          }}
        >
          Refresh saved status
        </button>
      </header>
      <progress
        aria-label="Saved point evidence"
        value={observed}
        max={points.length}
      />
      <dl className="maps-frozen-settings">
        <div>
          <dt>Business</dt>
          <dd>{scan.identityValue}</dd>
        </div>
        <div>
          <dt>Search</dt>
          <dd>
            {spec.languageCode} · {spec.device} · depth {spec.depth}
          </dd>
        </div>
        <div>
          <dt>Grid</dt>
          <dd>
            {points.length} points · zoom {spec.zoom}
          </dd>
        </div>
        <div>
          <dt>Rank basis</dt>
          <dd>{spec.rankBasis}</dd>
        </div>
      </dl>
      {!providerConfigured && (
        <p className="maps-status">
          Configure the search provider before submitting or checking tasks.{" "}
          <a href="/help/dataforseo-api-key">Open setup guide</a>
        </p>
      )}
      {quote.isError && !report.publishedRunId && (
        <p role="alert" className="maps-error">
          {getStandardErrorMessage(quote.error)}
        </p>
      )}
      {scan.state === "prepared" && quote.data && (
        <label className="maps-approval">
          <input
            type="checkbox"
            checked={approved}
            disabled={action.busy}
            onChange={(e) => setApproved(e.target.checked)}
          />
          Approve estimated {price} USD
          {quote.data.estimatedCredits !== null
            ? ` · ${quote.data.estimatedCredits} credits`
            : ""}{" "}
          for {points.length} searches
        </label>
      )}
      {approvalChanged && remaining && (
        <p role="alert" className="maps-error">
          The saved approval no longer matches the current estimate. Prepare a
          new scan before submitting more searches.
        </p>
      )}
      {(unresolved || recovery) && (
        <p role="alert" className="maps-error">
          Submission or billing needs review. Do not submit the unresolved point
          again. Verified saved tasks can still be checked.
        </p>
      )}
      <div className="maps-form-actions">
        {remaining && !report.publishedRunId && (
          <button
            type="button"
            className="maps-action"
            disabled={
              action.busy ||
              unresolved ||
              !!recovery ||
              !providerConfigured ||
              approvalChanged ||
              quote.isPending ||
              quote.isError ||
              (scan.state === "prepared" && (!approved || !quote.data))
            }
            onClick={() =>
              void action.act(
                "start",
                scan.state === "prepared" ? quote.data : undefined,
              )
            }
          >
            {action.busy
              ? "Working…"
              : scan.state === "prepared"
                ? "Approve and start scan"
                : "Start remaining points"}
          </button>
        )}
        {pending.length > 0 && (
          <button
            type="button"
            className="maps-action-secondary"
            disabled={action.busy || !providerConfigured}
            onClick={() => void action.act("collect", undefined, pending)}
          >
            Check queued results ({pending.length})
          </button>
        )}
        {!report.publishedRunId && observed === points.length && (
          <button
            type="button"
            className="maps-action"
            disabled={action.busy}
            onClick={() => void action.act("publish")}
          >
            Publish saved map
          </button>
        )}
        {report.publishedRunId && (
          <button
            type="button"
            onClick={() => onPublished(report.publishedRunId!)}
          >
            Open saved map
          </button>
        )}
      </div>
      {action.error && (
        <p role="alert" className="maps-error">
          {action.error}
        </p>
      )}
      {action.notice && (
        <p role="status" className="maps-status">
          {action.notice}
        </p>
      )}
      {recovery && (
        <div className="maps-recovery">
          <p>
            Recovery reference: {recovery.receipt?.taskId ?? recovery.claimId}
          </p>
          <button
            type="button"
            onClick={() =>
              downloadFile(
                JSON.stringify(recovery, null, 2),
                `maps-recovery-${scanId}.json`,
                "application/json",
              )
            }
          >
            Download recovery reference
          </button>
        </div>
      )}
      <MapsScanInspector
        report={report}
        projectId={projectId}
        recovery={recovery}
      />
    </section>
  );
}
