import { MapPin } from "lucide-react";
import type { MapsPageModel } from "./useMapsPage";
export function MapsHeader({ model: m }: { model: MapsPageModel }) {
  return (
    <header className="search-workspace-header">
      <h1>Maps visibility</h1>
      <div className="maps-page-actions">
        {!m.campaignForm &&
          !m.scanForm &&
          m.shownView === "map" &&
          m.selectedRun?.provenance === "invented" && (
            <span className="maps-example-label">
              <MapPin size={13} aria-hidden="true" />
              Invented-data preview
            </span>
          )}
        <button
          type="button"
          disabled={m.busy}
          onClick={() => {
            m.setCampaignForm(true);
            m.setScanForm(false);
            m.setError("");
          }}
        >
          New campaign
        </button>
        {m.selected && !m.isExample && (
          <button
            type="button"
            className="maps-action"
            disabled={m.busy}
            onClick={() => {
              m.setScanForm(true);
              m.setCampaignForm(false);
              m.setError("");
            }}
          >
            New scan
          </button>
        )}
        <button
          type="button"
          disabled={m.busy}
          onClick={() => void m.openExample()}
        >
          Open example
        </button>
      </div>
    </header>
  );
}
export function MapsToolbar({ model: m }: { model: MapsPageModel }) {
  if (!m.selected) return null;
  return (
    <div className="maps-toolbar">
      <label htmlFor="maps-campaign">Campaign</label>
      <select
        id="maps-campaign"
        disabled={m.busy}
        value={m.selected.id}
        onChange={(event) => {
          m.select({
            campaignId: event.target.value,
            runId: undefined,
            scanId: undefined,
            mapsView: undefined,
          });
          m.setScanForm(false);
          m.setError("");
        }}
      >
        {m.campaigns.data?.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      {m.selectedRun && m.activeScan && (
        <div
          className="maps-workspace-switch"
          role="group"
          aria-label="Maps workspace view"
        >
          <button
            type="button"
            disabled={m.busy}
            aria-pressed={m.shownView === "map"}
            onClick={() => m.select({ mapsView: "map" })}
          >
            Saved maps
          </button>
          <button
            type="button"
            disabled={m.busy}
            aria-pressed={m.shownView === "scan"}
            onClick={() => m.select({ mapsView: "scan" })}
          >
            Collection
          </button>
        </div>
      )}
      {m.shownView === "map" && m.selectedRun && (
        <>
          <label htmlFor="maps-date">Run date</label>
          <select
            id="maps-date"
            disabled={m.busy}
            value={m.selectedRun.id}
            onChange={(event) =>
              m.select({
                campaignId: m.selected!.id,
                runId: event.target.value,
              })
            }
          >
            {m.history.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.observedFrom ? "Observed " : "Saved "}
                {new Date(item.observedFrom ?? item.createdAt).toLocaleString(
                  "en-CA",
                  { timeZone: "UTC" },
                )}{" "}
                UTC · {item.query}
              </option>
            ))}
          </select>
        </>
      )}
      {m.shownView === "scan" && m.activeScan && (
        <>
          <label htmlFor="maps-scan">Saved scan</label>
          <select
            id="maps-scan"
            disabled={m.busy}
            value={m.activeScan.id}
            onChange={(event) =>
              m.select({
                campaignId: m.selected!.id,
                scanId: event.target.value,
              })
            }
          >
            {m.scans.data?.scans.map((item) => (
              <option key={item.id} value={item.id}>
                {new Date(item.createdAt).toLocaleString("en-CA")} ·{" "}
                {item.query}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
