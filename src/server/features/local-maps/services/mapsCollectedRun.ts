import { MapsCollectionService } from "./MapsCollectionService";
import { MapsRepository, type MapsScope } from "../repositories/MapsRepository";
import { mapsRunSchema } from "@/shared/local-maps";
import { mapsObservationPoint } from "@/shared/maps-collection";
import { AppError } from "@/server/lib/errors";

export async function mapsCollectedRun(scope: MapsScope, id: string) {
  const saved = await MapsCollectionService.read(scope, id);
  const campaign = await MapsRepository.campaign(scope, saved.scan.campaignId);
  if (
    !campaign ||
    saved.scan.state !== "approved" ||
    campaign.identityKind !== saved.scan.identityKind ||
    campaign.identityValue !== saved.scan.identityValue
  )
    throw new AppError(
      "CONFLICT",
      "Collected Maps evidence does not match its approved campaign",
    );
  const points = saved.collection.map(({ observation }) => {
    if (!observation)
      throw new AppError(
        "CONFLICT",
        "Every Maps point needs completed saved evidence before publication",
      );
    return mapsObservationPoint(observation);
  });
  return {
    campaignId: saved.scan.campaignId,
    run: mapsRunSchema.parse({
      id,
      provenance: "collected",
      spec: saved.spec,
      points,
      scanRequestId: id,
    }),
  };
}
