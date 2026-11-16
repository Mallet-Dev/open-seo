import { nextMapsPoint } from "./mapsPointNavigation";
import { MapsEvidence } from "./MapsEvidence";
import { MapsStreetMap } from "./MapsStreetMap";
import { mapCoordinates } from "./mapCoordinates";
import { pointTone } from "./mapsPointTone";
import { mapsBusinesses } from "./mapsBusinesses";
import { MapsBusinessComparison } from "./MapsBusinessComparison";
import { pointLabel } from "./mapsPointLabel";
import { useMemo, useRef, useState } from "react";
import { Compass, Minus, X } from "lucide-react";
import {
  compareMapsRuns,
  mapsPointRank,
  mapsRunSummary,
  type MapsBusiness,
  type MapsRun,
} from "@/shared/local-maps";

export function MapsWorkbench({
  run,
  previous,
  name,
  business,
}: {
  run: MapsRun;
  previous: MapsRun | null;
  name: string;
  business: MapsBusiness;
}) {
  const [selected, setSelected] = useState(12 < run.points.length ? 12 : 0);
  const [selection, setView] = useState<MapsBusiness>(business);
  const [selectionName, setViewName] = useState(name);
  const [street, setStreet] = useState(false);
  const geometry = useMemo(
    () => mapCoordinates(run.spec.points),
    [run.spec.points],
  );
  const showStreet = street && geometry.supported;
  const pointButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const active = Math.min(selected, run.points.length - 1);
  const { businesses, trackedAliases } = mapsBusinesses(run, business, name);
  const isTracked = trackedAliases.has(`${selection.kind}:${selection.value}`);
  const view = isTracked ? business : selection;
  const viewName = isTracked ? name : selectionName;
  const summary = mapsRunSummary(run, view);
  const comparison = previous ? compareMapsRuns(previous, run, view) : null;
  if (!businesses.has(`${view.kind}:${view.value}`))
    businesses.set(`${view.kind}:${view.value}`, {
      name: `${viewName} (not returned)`,
      identity: view,
    });
  const latitudes = run.spec.points.map((point) => point.latitude);
  const longitudes = run.spec.points.map((point) => point.longitude);
  const north = Math.max(...latitudes),
    south = Math.min(...latitudes),
    east = Math.max(...longitudes),
    west = Math.min(...longitudes);
  const move = (index: number, key: string) => {
    const next = nextMapsPoint(run.spec.points, index, key);
    if (next !== index) setSelected(next);
    return next;
  };
  return (
    <section className="maps-workbench" aria-label="Maps rank evidence">
      <div className="maps-metrics">
        <div>
          <span>Found in this area</span>
          <strong>
            {summary.found}
            <small> / {summary.successful}</small>
          </strong>
          <p>successful points</p>
        </div>
        <div>
          <span>Average where found</span>
          <strong>{summary.averageWhereFound?.toFixed(1) ?? "Unknown"}</strong>
          <p>
            {comparison?.compatible &&
            comparison.averageImprovementWhereBothFound !== null
              ? `${comparison.averageImprovementWhereBothFound > 0 ? "+" : ""}${comparison.averageImprovementWhereBothFound.toFixed(1)} positions on ${comparison.bothFound} matched points`
              : "No measured comparison"}
          </p>
        </div>
        <div>
          <span>In the top three</span>
          <strong>
            {summary.top3}
            <small> points</small>
          </strong>
          <p>
            {summary.sparse}{" "}
            {run.provenance === "collected"
              ? "returned samples"
              : "sparse responses"}
          </p>
        </div>
      </div>
      <MapsBusinessComparison
        run={run}
        business={business}
        name={name}
        competitor={view}
        competitorName={viewName}
      />
      <div className="maps-layout">
        <div className="maps-geography">
          <header className="maps-map-heading">
            <div>
              <Compass size={18} aria-hidden="true" />
              <h2>Geographic visibility</h2>
            </div>
            <span>{run.spec.points.length} points · north up</span>
          </header>
          <div className="maps-business-bar">
            <label htmlFor="maps-business">Business</label>
            <select
              id="maps-business"
              value={`${view.kind}:${view.value}`}
              onChange={(event) => {
                const next = businesses.get(event.target.value);
                if (next) {
                  setView(next.identity);
                  setViewName(next.name);
                }
              }}
            >
              {[...businesses].map(([key, value]) => (
                <option key={key} value={key}>
                  {value.name}
                </option>
              ))}
            </select>
          </div>
          <div className="maps-view-switch" role="group" aria-label="Map view">
            <button
              type="button"
              aria-pressed={!showStreet}
              onClick={() => setStreet(false)}
            >
              Grid
            </button>
            <button
              type="button"
              aria-pressed={showStreet}
              disabled={!geometry.supported}
              onClick={() => setStreet(true)}
            >
              Street map
            </button>
          </div>
          {street && geometry.supported ? (
            <MapsStreetMap
              run={run}
              coordinates={geometry.coordinates}
              view={view}
              active={active}
              onSelect={setSelected}
              onMove={move}
            />
          ) : (
            <div
              className="maps-field"
              role="group"
              aria-label="Geographic rank points. Use arrow keys to explore."
            >
              <span className="maps-north" aria-hidden="true">
                N ↑
              </span>
              <span className="maps-latitude">{north.toFixed(3)}° N</span>
              <span className="maps-longitude">{west.toFixed(3)}°</span>
              <svg
                className="maps-grid-lines"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {[...new Set(latitudes)].map((latitude) => {
                  const position =
                    12 + ((north - latitude) / (north - south || 1)) * 76;
                  return (
                    <line
                      key={`lat:${latitude}`}
                      x1="12"
                      y1={position}
                      x2="88"
                      y2={position}
                    />
                  );
                })}
                {[...new Set(longitudes)].map((longitude) => {
                  const position =
                    12 + ((longitude - west) / (east - west || 1)) * 76;
                  return (
                    <line
                      key={`lng:${longitude}`}
                      x1={position}
                      y1="12"
                      x2={position}
                      y2="88"
                    />
                  );
                })}
              </svg>
              {run.spec.points.map((point, index) => {
                const rank = mapsPointRank(run.points[index], view);
                const status = run.points[index].status;
                const tone = pointTone(run, index, view);
                return (
                  <button
                    key={`${point.row}:${point.col}`}
                    ref={(element) => {
                      pointButtons.current[index] = element;
                    }}
                    className={`maps-point maps-point-${tone}${active === index ? " is-selected" : ""}`}
                    style={{
                      left: `${12 + ((point.longitude - west) / (east - west || 1)) * 76}%`,
                      top: `${12 + ((north - point.latitude) / (north - south || 1)) * 76}%`,
                    }}
                    aria-label={`Point ${point.row + 1}, ${point.col + 1}: ${pointLabel(run, index, view)}`}
                    aria-pressed={active === index}
                    tabIndex={active === index ? 0 : -1}
                    onClick={() => setSelected(index)}
                    onKeyDown={(event) => {
                      if (
                        [
                          "ArrowDown",
                          "ArrowUp",
                          "ArrowLeft",
                          "ArrowRight",
                        ].includes(event.key)
                      ) {
                        event.preventDefault();
                        pointButtons.current[move(index, event.key)]?.focus();
                      }
                    }}
                  >
                    {rank ??
                      (status === "failed" ? (
                        <X size={17} aria-hidden="true" />
                      ) : (
                        <Minus size={17} aria-hidden="true" />
                      ))}
                  </button>
                );
              })}
            </div>
          )}
          {!showStreet && (
            <p className="maps-tile-notice">
              {geometry.supported ? (
                <>
                  Street map sends the viewed area and further pan or zoom
                  requests to OpenStreetMap.{" "}
                  <a
                    href="https://osmfoundation.org/wiki/Privacy_Policy"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Privacy
                  </a>
                </>
              ) : (
                geometry.reason
              )}
            </p>
          )}
          <div className="maps-legend">
            <span>
              <i className="maps-key-strong" />
              1–3
            </span>
            <span>
              <i className="maps-key-visible" />
              4–10
            </span>
            <span>
              <i className="maps-key-low" />
              11+
            </span>
            <span>
              <i className="maps-key-unknown" />
              Missing / excluded
            </span>
          </div>
          <div className="maps-method">
            <span>
              {run.spec.searchType === "google-maps"
                ? "Google Maps"
                : run.spec.searchType}{" "}
              · {run.spec.device} · depth {run.spec.depth}
            </span>
            <span>
              {run.spec.languageCode} · scan zoom {run.spec.zoom} ·{" "}
              {run.spec.rankBasis} rank
            </span>
          </div>
        </div>
        <MapsEvidence
          run={run}
          active={active}
          view={view}
          previous={
            comparison?.compatible ? (previous ?? undefined) : undefined
          }
        />
      </div>
      {comparison && (
        <div className="maps-comparison">
          {comparison.compatible ? (
            <>
              <strong>Matched comparison</strong>
              <span>
                {comparison.commonSuccessful} common successful points
              </span>
              <span>{comparison.entered} entered returned results</span>
              <span>{comparison.exited} left returned results</span>
            </>
          ) : (
            <>
              <strong>Movement unavailable</strong>
              <span>{comparison.reason}</span>
            </>
          )}
        </div>
      )}
    </section>
  );
}
