import { Check, MapPin } from "lucide-react";
import type {
  MapsBusiness,
  MapsRun,
  MapsPointEvidence,
} from "@/shared/local-maps";
import { evidenceLabel } from "./mapsPointLabel";

export function MapsEvidence({
  run,
  active,
  view,
  previous,
}: {
  run: MapsRun;
  previous?: MapsRun;
  active: number;
  view: MapsBusiness;
}) {
  const coordinate = run.spec.points[active];
  const before = previous?.spec.points.findIndex(
    (point) => point.row === coordinate.row && point.col === coordinate.col,
  );
  return (
    <MapsEvidencePoint
      observation={run.points[active]}
      coordinate={coordinate}
      previous={
        before !== undefined && before >= 0
          ? previous?.points[before]
          : undefined
      }
      view={view}
      source={run.spec.source}
      provenance={run.provenance}
    />
  );
}
export function MapsEvidencePoint({
  observation,
  previous,
  coordinate,
  view,
  source,
  provenance,
}: {
  observation: MapsPointEvidence;
  previous?: MapsPointEvidence;
  coordinate: MapsRun["spec"]["points"][number];
  view: MapsBusiness;
  source: string;
  provenance: MapsRun["provenance"];
}) {
  return (
    <aside
      className="maps-evidence"
      aria-label="Selected point evidence"
      aria-live="polite"
    >
      <header
        key={`${coordinate.row}:${coordinate.col}:${view.kind}:${view.value}`}
        className="maps-evidence-header"
      >
        <div className="maps-point-caption">
          <MapPin size={16} aria-hidden="true" />
          Point {coordinate.row + 1}.{coordinate.col + 1}
        </div>
        <h2>{evidenceLabel(observation, view)}</h2>
        <p>
          {coordinate.latitude.toFixed(5)}, {coordinate.longitude.toFixed(5)}
        </p>
      </header>
      {previous && (
        <div className="border-b border-base-300 px-5 py-3 text-sm">
          <span className="block text-xs text-base-content/70">
            Previous run at this point
          </span>
          <strong>{evidenceLabel(previous, view)}</strong>
          {previous.status === "success" && previous.observedAt && (
            <time
              className="ml-2 text-xs text-base-content/70"
              dateTime={previous.observedAt}
            >
              {new Date(previous.observedAt).toLocaleDateString("en-CA", {
                timeZone: "UTC",
              })}{" "}
              UTC
            </time>
          )}
        </div>
      )}
      {observation.status === "success" ? (
        <>
          <div className="maps-evidence-context">
            <span>
              {observation.results.length} returned · {observation.coverage}
            </span>
            {observation.observedAt ? (
              <time dateTime={observation.observedAt}>
                {new Date(observation.observedAt).toLocaleString("en-CA", {
                  timeZone: "UTC",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}{" "}
                UTC
              </time>
            ) : (
              <span>Source time unavailable</span>
            )}
            {observation.retrievedAt && (
              <span>
                Retrieved{" "}
                {new Date(observation.retrievedAt).toLocaleString("en-CA", {
                  timeZone: "UTC",
                })}{" "}
                UTC
              </span>
            )}
            {observation.returnedItems !== undefined && (
              <span>
                {observation.returnedItems} total items ·{" "}
                {observation.nonBusinessItems} other items
              </span>
            )}
          </div>
          <ol className="maps-results">
            {observation.results
              .toSorted((a, b) => a.rank - b.rank)
              .map((result, index) => {
                const isSelected =
                  (view.kind === "cid" ? result.cid : result.placeId) ===
                  view.value;
                return (
                  <li
                    key={result.ordinal ?? index}
                    className={isSelected ? "is-target" : ""}
                  >
                    <span className="maps-result-rank">{result.rank}</span>
                    <div>
                      <strong>
                        {result.title ?? "Business name unavailable"}
                      </strong>
                      <span>
                        {result.cid
                          ? `CID ${result.cid}`
                          : result.placeId
                            ? `Place ${result.placeId}`
                            : "Identity unavailable"}
                      </span>
                    </div>
                    {isSelected && (
                      <Check size={16} aria-label="Selected business" />
                    )}
                  </li>
                );
              })}
          </ol>
          {observation.coverage !== "full" && (
            <p className="maps-evidence-note">
              Only these results were returned. An absent business has no
              observed rank.
            </p>
          )}
        </>
      ) : (
        <p className="maps-evidence-note">
          {observation.status === "failed"
            ? observation.message
            : observation.status === "excluded"
              ? observation.reason
              : observation.status === "pending"
                ? "This point has not completed."
                : "No observation was saved for this point."}
        </p>
      )}
      <footer>
        <span>Source</span>
        <strong>{source}</strong>
        <span>
          {provenance === "invented"
            ? "Invented data"
            : "Collected observation"}
        </span>
      </footer>
    </aside>
  );
}
