import {
  createMapsCampaign,
  saveMapsFixture,
  getMapsHistory,
} from "@/serverFunctions/localMaps";
import { mapsFixture } from "./mapsFixture";
export async function openMapsExample(
  projectId: string,
  ids: { campaign: string; previous: string; current: string },
  campaigns: { id: string; identityKind: string; identityValue: string }[],
) {
  const existing = campaigns.find(
    (item) =>
      item.identityKind === "cid" && item.identityValue === "example-northline",
  );
  const campaignId = existing?.id ?? ids.campaign;
  if (!existing)
    await createMapsCampaign({
      data: {
        projectId,
        campaign: {
          id: campaignId,
          name: "Northline Tile · example",
          business: { kind: "cid", value: "example-northline" },
        },
      },
    });
  const saved = existing
    ? await getMapsHistory({ data: { projectId, campaignId } })
    : [];
  const before = saved.find(
    (item) =>
      item.source === "invented-example" &&
      item.observedFrom?.startsWith("2026-11-08"),
  );
  const after = saved.find(
    (item) =>
      item.source === "invented-example" &&
      item.observedFrom?.startsWith("2026-11-15"),
  );
  if (!before)
    await saveMapsFixture({
      data: {
        projectId,
        input: { campaignId, run: mapsFixture(ids.previous, true) },
      },
    });
  if (!after)
    await saveMapsFixture({
      data: { projectId, input: { campaignId, run: mapsFixture(ids.current) } },
    });
  return { campaignId, runId: after?.id ?? ids.current };
}
