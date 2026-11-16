import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getMapsScanPoint,
  type getMapsScan,
} from "@/serverFunctions/localMaps";
import { mapsObservationPoint } from "@/shared/maps-collection";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { MapsEvidencePoint } from "./MapsEvidence";
import { nextMapsPoint } from "./mapsPointNavigation";
import type { MapsRecovery } from "./mapsRecovery";
type ScanView = Awaited<ReturnType<typeof getMapsScan>>;
function pointState(item: ScanView["points"][number], recovering: boolean) {
  if (item.observation) return "Saved evidence";
  if (recovering) return "Submission needs recovery";
  if (item.receipt?.billingState === "uncertain") return "Needs review";
  if (item.receipt?.receipt?.identityVerified) return "Queued";
  return item.point.state === "submitting"
    ? "Submission unresolved"
    : "Not submitted";
}
export function MapsScanInspector({
  report,
  projectId,
  recovery,
}: {
  report: ScanView;
  projectId: string;
  recovery: MapsRecovery | null;
}) {
  const { scan, spec, points } = report;
  const scanId = scan.id;
  const recoveryOrdinal = recovery?.ordinal;
  const [selected, setSelected] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const active = Math.min(selected, points.length - 1);
  const point = useQuery({
    queryKey: ["mapsScanPoint", projectId, scanId, active],
    queryFn: () =>
      getMapsScanPoint({ data: { projectId, scanId, ordinal: active } }),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  return (
    <div className="maps-scan-evidence">
      <div
        className="maps-scan-points"
        role="group"
        aria-label="Scan points. Use arrow keys to explore."
        style={{
          gridTemplateColumns: `repeat(${Math.max(...spec.points.map((item) => item.col)) + 1},minmax(0,1fr))`,
        }}
      >
        {points.map((item, index) => (
          <button
            key={item.point.id}
            type="button"
            ref={(element) => {
              buttons.current[index] = element;
            }}
            aria-pressed={active === index}
            aria-label={`Point ${item.point.row + 1}, ${item.point.col + 1}: ${pointState(item, index === recoveryOrdinal)}`}
            tabIndex={active === index ? 0 : -1}
            className={`maps-scan-point ${item.observation ? "is-observed" : item.receipt?.billingState === "uncertain" || index === recoveryOrdinal ? "is-unresolved" : ""}`}
            onClick={() => setSelected(index)}
            onKeyDown={(event) => {
              if (
                ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                  event.key,
                )
              ) {
                event.preventDefault();
                const next = nextMapsPoint(spec.points, index, event.key);
                setSelected(next);
                buttons.current[next]?.focus();
              }
            }}
          >
            <strong>
              {item.point.row + 1}.{item.point.col + 1}
            </strong>
            <span>{pointState(item, index === recoveryOrdinal)}</span>
          </button>
        ))}
      </div>
      {point.data ? (
        <MapsEvidencePoint
          coordinate={spec.points[active]}
          observation={
            point.data.observation
              ? mapsObservationPoint(point.data.observation)
              : {
                  status: point.data.receipt?.receipt?.identityVerified
                    ? "pending"
                    : "unobserved",
                }
          }
          view={{ kind: scan.identityKind, value: scan.identityValue }}
          source={spec.source}
          provenance="collected"
        />
      ) : point.isError ? (
        <p role="alert" className="maps-error">
          {getStandardErrorMessage(point.error)}
        </p>
      ) : (
        <p role="status">Loading point evidence…</p>
      )}
    </div>
  );
}
