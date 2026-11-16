import { mapsBusinessSchema } from "@/shared/local-maps";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { MapsWorkbench } from "./MapsWorkbench";
import { MapsCampaignForm } from "./MapsCampaignForm";
import { MapsScanForm } from "./MapsScanForm";
import { MapsScanPanel } from "./MapsScanPanel";
import { MapsHeader, MapsToolbar } from "./MapsNavigation";
import { useMapsPage } from "./useMapsPage";
export function MapsPage({ projectId }: { projectId: string }) {
  const m = useMapsPage(projectId);
  const loading =
    m.history.isPending || m.scans.isPending || m.current.isFetching;
  return (
    <main className="search-workspace">
      <MapsHeader model={m} />
      {(m.error || m.failure) && (
        <p className="maps-error" role="alert">
          {m.error || getStandardErrorMessage(m.failure)}
        </p>
      )}
      {m.campaignForm ? (
        <MapsCampaignForm
          onCreate={m.createCampaign}
          onCancel={() => m.setCampaignForm(false)}
          busy={m.busy}
        />
      ) : m.campaigns.isPending ? (
        <p className="maps-status" role="status">
          Loading saved campaigns…
        </p>
      ) : m.selected ? (
        <>
          <MapsToolbar model={m} />
          {m.scanForm ? (
            m.scans.data && (
              <MapsScanForm
                key={m.selected.id}
                languageCode={m.scans.data.languageCode}
                onPrepare={m.prepare}
                onCancel={() => m.setScanForm(false)}
                busy={m.busy}
              />
            )
          ) : m.shownView === "scan" && m.activeScan ? (
            <MapsScanPanel
              key={`${projectId}:${m.activeScan.id}`}
              projectId={projectId}
              scanId={m.activeScan.id}
              providerConfigured={m.scans.data?.providerConfigured ?? false}
              onBusy={m.setBusy}
              onPublished={(id) => {
                m.select({
                  campaignId: m.selected!.id,
                  runId: id,
                  mapsView: "map",
                });
              }}
            />
          ) : m.shownView === "map" && m.current.data ? (
            <MapsWorkbench
              key={m.selected.id}
              run={m.current.data}
              previous={m.previous.data ?? null}
              name={m.selected.name}
              business={mapsBusinessSchema.parse({
                kind: m.selected.identityKind,
                value: m.selected.identityValue,
              })}
            />
          ) : (
            !m.selectedRun &&
            !m.activeScan &&
            !loading && (
              <section className="maps-empty">
                <h2>Ready for your first scan</h2>
                <button
                  type="button"
                  className="maps-action"
                  onClick={() => m.setScanForm(true)}
                >
                  Set up geographic scan
                </button>
              </section>
            )
          )}
          {loading && (
            <p className="maps-status" role="status">
              Loading saved evidence…
            </p>
          )}
        </>
      ) : (
        !m.campaigns.isError && (
          <section className="maps-empty">
            <h2>Your geographic search history starts here.</h2>
            <p>
              Create a campaign for your business, or explore two saved dates
              with competitors and point-by-point evidence.
            </p>
            <button
              className="maps-action"
              disabled={m.busy}
              onClick={() => void m.openExample()}
            >
              {m.busy ? "Saving example…" : "Open invented example"}
            </button>
            <p>
              The example uses invented businesses and rankings. It runs no
              search provider.
            </p>
          </section>
        )
      )}
    </main>
  );
}
