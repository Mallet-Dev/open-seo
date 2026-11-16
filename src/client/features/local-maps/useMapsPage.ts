import { useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { mapsSelectionSchema, type MapsSelection } from "./mapsSelection";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listMapsCampaigns,
  createMapsCampaign,
  getMapsHistory,
  getMapsRun,
  listMapsScans,
  prepareMapsScan,
} from "@/serverFunctions/localMaps";
import type { mapsCampaignInputSchema } from "@/shared/local-maps";
import type { MapsScanInput } from "@/shared/maps-collection";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { openMapsExample } from "./openMapsExample";

export function useMapsPage(projectId: string) {
  const client = useQueryClient();
  const selection = mapsSelectionSchema.parse(useSearch({ strict: false }));
  const { campaignId, runId, scanId, mapsView: view = "map" } = selection;
  const navigate = useNavigate({ from: "/p/$projectId/maps" });
  function select(next: MapsSelection) {
    void navigate({ search: (before) => ({ ...before, ...next }) });
  }
  const [campaignForm, setCampaignForm] = useState(false);
  const [scanForm, setScanForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const example = useRef({
    campaign: crypto.randomUUID(),
    previous: crypto.randomUUID(),
    current: crypto.randomUUID(),
  });
  const preparation = useRef<{ key: string; id: string } | null>(null);
  const campaigns = useQuery({
    queryKey: ["mapsCampaigns", projectId],
    queryFn: () => listMapsCampaigns({ data: { projectId } }),
  });
  const selected = campaignId
    ? campaigns.data?.find((item) => item.id === campaignId)
    : campaigns.data?.[0];
  const history = useQuery({
    queryKey: ["mapsHistory", projectId, selected?.id],
    queryFn: () =>
      getMapsHistory({ data: { projectId, campaignId: selected!.id } }),
    enabled: !!selected,
  });
  const scans = useQuery({
    queryKey: ["mapsScans", projectId, selected?.id],
    queryFn: () =>
      listMapsScans({ data: { projectId, campaignId: selected!.id } }),
    enabled: !!selected,
  });
  const selectedRun = runId
    ? history.data?.find((item) => item.id === runId)
    : history.data?.[0];
  const activeScan = scanId
    ? scans.data?.scans.find((item) => item.id === scanId)
    : scans.data?.scans[0];
  const shownView = !selectedRun && activeScan ? "scan" : view;
  const previousRun = history.data?.find(
    (item) =>
      item.id !== selectedRun?.id &&
      item.observedTo &&
      selectedRun?.observedFrom &&
      item.observedTo < selectedRun.observedFrom,
  );
  const current = useQuery({
    queryKey: ["mapsRun", projectId, selected?.id, selectedRun?.id],
    queryFn: () => getMapsRun({ data: { projectId, runId: selectedRun!.id } }),
    enabled: !!selectedRun && shownView === "map",
  });
  const previous = useQuery({
    queryKey: ["mapsRun", projectId, selected?.id, previousRun?.id],
    queryFn: () => getMapsRun({ data: { projectId, runId: previousRun!.id } }),
    enabled: !!previousRun && shownView === "map",
  });
  const isExample =
    selected?.identityKind === "cid" &&
    selected.identityValue === "example-northline";
  async function createCampaign(
    campaign: ReturnType<typeof mapsCampaignInputSchema.parse>,
  ) {
    setBusy(true);
    setError("");
    try {
      const saved = await createMapsCampaign({ data: { projectId, campaign } });
      await client.invalidateQueries({
        queryKey: ["mapsCampaigns", projectId],
      });
      select({
        campaignId: saved.id,
        runId: undefined,
        scanId: undefined,
        mapsView: "scan",
      });
      setCampaignForm(false);
      setScanForm(true);
    } catch (caught) {
      setError(getStandardErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  async function prepare(request: MapsScanInput) {
    if (!selected) return;
    setBusy(true);
    setError("");
    const key = JSON.stringify({ campaignId: selected.id, request });
    if (preparation.current?.key !== key)
      preparation.current = { key, id: crypto.randomUUID() };
    try {
      const saved = await prepareMapsScan({
        data: {
          projectId,
          campaignId: selected.id,
          scanId: preparation.current.id,
          request,
        },
      });
      await client.invalidateQueries({
        queryKey: ["mapsScans", projectId, selected.id],
      });
      select({
        campaignId: selected.id,
        scanId: saved.scan.id,
        mapsView: "scan",
      });
      setScanForm(false);

      preparation.current = null;
    } catch (caught) {
      setError(getStandardErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  async function openExample() {
    setBusy(true);
    setError("");
    try {
      const opened = await openMapsExample(
        projectId,
        example.current,
        campaigns.data ?? [],
      );
      const target = opened.campaignId;
      await client.invalidateQueries({
        queryKey: ["mapsCampaigns", projectId],
      });
      await client.invalidateQueries({
        queryKey: ["mapsHistory", projectId, target],
      });
      select({
        campaignId: target,
        runId: opened.runId,
        scanId: undefined,
        mapsView: "map",
      });
      setCampaignForm(false);
      setScanForm(false);
    } catch (caught) {
      setError(getStandardErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  const failure =
    campaigns.error ??
    history.error ??
    scans.error ??
    current.error ??
    previous.error ??
    ((campaigns.isSuccess && campaignId && !selected) ||
    (history.isSuccess && runId && !selectedRun) ||
    (scans.isSuccess && scanId && !activeScan)
      ? new Error(
          "The selected Maps campaign, run, or scan is unavailable in this project.",
        )
      : null);
  return {
    projectId,
    client,
    campaigns,
    selected,
    history,
    scans,
    selectedRun,
    activeScan,
    shownView,
    current,
    previous,
    busy,
    error,
    failure,
    campaignForm,
    scanForm,
    isExample,
    select,
    setCampaignForm,
    setScanForm,
    setBusy,
    setError,
    createCampaign,
    prepare,
    openExample,
  };
}
export type MapsPageModel = ReturnType<typeof useMapsPage>;
