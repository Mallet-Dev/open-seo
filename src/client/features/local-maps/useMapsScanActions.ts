import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  approveMapsScan,
  startNextMapsPoint,
  collectMapsPoint,
  publishMapsScan,
} from "@/serverFunctions/localMaps";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import type { MapsCostQuote } from "@/shared/maps-collection";
import type { MapsRecovery } from "./mapsRecovery";
export function useMapsScanActions({
  projectId,
  scanId,
  recoveryKey,
  onBusy,
  onPublished,
  onApprovalRejected,
}: {
  projectId: string;
  scanId: string;
  recoveryKey: string;
  onBusy: (busy: boolean) => void;
  onPublished: (runId: string) => void;
  onApprovalRejected: () => Promise<void>;
}) {
  const client = useQueryClient();
  const generation = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [recovery, setRecovery] = useState<MapsRecovery | null>(null);
  useEffect(
    () => () => {
      generation.current++;
      onBusy(false);
    },
    [projectId, scanId, onBusy],
  );
  async function refresh() {
    await client.invalidateQueries({
      queryKey: ["mapsScan", projectId, scanId],
    });
    await client.invalidateQueries({
      queryKey: ["mapsScanPoint", projectId, scanId],
    });
  }
  function preserveRecovery(value: MapsRecovery, visible: boolean) {
    try {
      sessionStorage.setItem(recoveryKey, JSON.stringify(value));
    } catch {
      if (visible)
        setNotice("Download the recovery reference before leaving this page.");
    }
    if (visible) setRecovery(value);
  }
  async function act(
    kind: "start" | "collect" | "publish",
    approval?: MapsCostQuote,
    ordinals: number[] = [],
  ) {
    const token = ++generation.current;
    const active = () => generation.current === token;
    setBusy(true);
    onBusy(true);
    setError("");
    setNotice("");
    try {
      if (kind === "start") {
        if (approval)
          await approveMapsScan({ data: { projectId, scanId, approval } });
        while (active()) {
          const result = await startNextMapsPoint({
            data: { projectId, scanId },
          });
          if (result.recovery) preserveRecovery(result.recovery, active());
          if (!active()) return;
          await refresh();
          if (!active()) return;
          if (result.status === "point_queued") continue;
          setNotice(
            result.status === "queued"
              ? "All points are queued. Check their results when ready."
              : "Submission needs review. Saved progress is retained; do not submit the unresolved point again.",
          );
          break;
        }
      } else if (kind === "collect") {
        let processing = 0;
        let failed = 0;
        for (const ordinal of ordinals) {
          if (!active()) return;
          const result = await collectMapsPoint({
            data: { projectId, scanId, ordinal },
          });
          if (!active()) return;
          if (result.status === "pending") processing++;
          if (result.status === "failed") failed++;
          await refresh();
        }
        if (active())
          setNotice(
            failed
              ? `${failed} provider responses failed. You can check these saved tasks again.`
              : processing
                ? `${processing} points are still processing. Check them again later.`
                : "Available point evidence is saved.",
          );
      } else {
        const run = await publishMapsScan({ data: { projectId, scanId } });
        if (!active()) return;
        await client.invalidateQueries({
          queryKey: ["mapsHistory", projectId],
        });
        if (active()) onPublished(run.id);
      }
    } catch (caught) {
      if (active()) {
        if (kind === "start") await onApprovalRejected();
        setError(getStandardErrorMessage(caught));
        await refresh();
      }
    } finally {
      if (active()) {
        setBusy(false);
        onBusy(false);
      }
    }
  }
  return { busy, error, notice, recovery, setRecovery, refresh, act };
}
