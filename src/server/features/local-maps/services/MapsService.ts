import { z } from "zod";
import { sha256Hex } from "@/server/lib/audit/ids";
import { AppError } from "@/server/lib/errors";
import {
  mapsCampaignInputSchema,
  mapsRunSchema,
  type MapsRun,
} from "@/shared/local-maps";
import {
  MapsRepository as repository,
  type MapsScope,
} from "../repositories/MapsRepository";

export { mapsCampaignInputSchema } from "@/shared/local-maps";
export const mapsSaveInputSchema = z
  .object({ campaignId: z.uuid(), run: mapsRunSchema })
  .strict();
export function mapsRunHash(campaignId: string, run: MapsRun) {
  return sha256Hex(JSON.stringify({ campaignId, run }));
}
async function requireCampaign(scope: MapsScope, id: string) {
  const campaign = await repository.campaign(scope, id);
  if (!campaign)
    throw new AppError("NOT_FOUND", "Maps campaign not found in this project");
  return campaign;
}
async function create(
  scope: MapsScope,
  raw: z.infer<typeof mapsCampaignInputSchema>,
) {
  const input = mapsCampaignInputSchema.parse(raw);
  const existing = await repository.campaign(scope, input.id);
  if (existing) {
    if (
      existing.name !== input.name ||
      existing.identityKind !== input.business.kind ||
      existing.identityValue !== input.business.value
    )
      throw new AppError(
        "CONFLICT",
        "Campaign ID already has different settings",
      );
    return existing;
  }
  await repository.create(scope, input.id, input.name, input.business);
  return requireCampaign(scope, input.id);
}
async function save(
  scope: MapsScope,
  raw: z.infer<typeof mapsSaveInputSchema>,
) {
  if (raw?.run?.provenance !== "invented")
    throw new AppError(
      "VALIDATION_ERROR",
      "Only invented-data imports are enabled",
    );
  const input = mapsSaveInputSchema.parse(raw);
  await requireCampaign(scope, input.campaignId);
  const hash = await mapsRunHash(input.campaignId, input.run);
  const checkSaved = async () => {
    const existing = await repository.read(scope, input.run.id);
    if (!existing) return false;
    if (
      existing.saved.campaignId !== input.campaignId ||
      existing.saved.payloadHash !== hash
    )
      throw new AppError("CONFLICT", "Run ID already has different evidence");
    return true;
  };
  if (await checkSaved()) return { id: input.run.id };
  try {
    await repository.save(input.campaignId, input.run, hash);
  } catch (error) {
    if (!(await checkSaved())) throw error;
  }
  return { id: input.run.id };
}
async function history(scope: MapsScope, campaignId: string) {
  await requireCampaign(scope, campaignId);
  return (await repository.history(scope, campaignId))
    .map(({ run, observedFrom, observedTo, observationCount, timedCount }) => ({
      ...run,
      observedFrom: observationCount === timedCount ? observedFrom : null,
      observedTo: observationCount === timedCount ? observedTo : null,
    }))
    .toSorted(
      (a, b) =>
        (b.observedFrom ?? b.createdAt).localeCompare(
          a.observedFrom ?? a.createdAt,
        ) ||
        b.createdAt.localeCompare(a.createdAt) ||
        b.id.localeCompare(a.id),
    );
}
async function read(scope: MapsScope, id: string): Promise<MapsRun> {
  const data = await repository.read(scope, id);
  if (!data)
    throw new AppError("NOT_FOUND", "Maps run not found in this project");
  const { saved, observations, evidence } = data;
  const run = mapsRunSchema.parse({
    id: saved.id,
    provenance: saved.provenance,
    ...(saved.scanRequestId === null
      ? {}
      : { scanRequestId: saved.scanRequestId }),
    spec: {
      query: saved.query,
      languageCode: saved.languageCode,
      source: saved.source,
      searchType: saved.searchType,
      device: saved.device,
      depth: saved.depth,
      zoom: saved.zoom,
      rankBasis: saved.rankBasis,
      points: observations.map((point) => ({
        row: point.row,
        col: point.col,
        latitude: point.latitude,
        longitude: point.longitude,
      })),
    },
    points: observations.map((point) => {
      if (point.status === "success")
        return {
          status: point.status,
          observedAt: point.observedAt,
          coverage: point.coverage,
          ...(saved.provenance === "collected"
            ? {
                retrievedAt: point.retrievedAt,
                providerObservedAt: point.providerObservedAt,
                returnedItems: point.returnedItems,
                nonBusinessItems: point.nonBusinessItems,
              }
            : {}),
          results: evidence
            .filter((item) => item.pointId === point.id)
            .map(({ result }) => ({
              title: result.title,
              cid: result.cid,
              placeId: result.placeId,
              rank: result.rank,
              ...(saved.provenance === "collected"
                ? {
                    ordinal: result.providerOrdinal,
                    rankAbsolute: result.rankAbsolute,
                    rankGroup: result.rankGroup,
                  }
                : {}),
            })),
        };
      if (point.status === "failed")
        return { status: point.status, message: point.message };
      if (point.status === "excluded")
        return { status: point.status, reason: point.message };
      return { status: point.status };
    }),
  });
  if ((await mapsRunHash(saved.campaignId, run)) !== saved.payloadHash)
    throw new AppError("CONFLICT", "Saved Maps run digest does not match");
  if (run.provenance === "collected") {
    if (saved.scanRequestId !== saved.id)
      throw new AppError(
        "CONFLICT",
        "Saved Maps run has no matching source scan",
      );
    const { mapsCollectedRun } = await import("./mapsCollectedRun");
    const source = await mapsCollectedRun(scope, saved.scanRequestId);
    if (
      source.campaignId !== saved.campaignId ||
      (await mapsRunHash(source.campaignId, source.run)) !== saved.payloadHash
    )
      throw new AppError(
        "CONFLICT",
        "Saved Maps run differs from its verified source evidence",
      );
  }
  return run;
}
export const MapsService = {
  list: repository.list,
  create,
  save,
  history,
  read,
};
