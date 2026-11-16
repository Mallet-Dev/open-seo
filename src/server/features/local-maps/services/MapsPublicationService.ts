import { MapsRepository } from "../repositories/MapsRepository";
import type { MapsScope } from "../repositories/MapsRepository";
import { MapsService, mapsRunHash } from "./MapsService";
import { mapsCollectedRun } from "./mapsCollectedRun";
import { AppError } from "@/server/lib/errors";

async function publish(scope: MapsScope, id: string) {
  const { campaignId, run } = await mapsCollectedRun(scope, id);
  const payloadHash = await mapsRunHash(campaignId, run);
  async function existing() {
    const saved = await MapsRepository.read(scope, id);
    if (!saved) return null;
    if (
      saved.saved.campaignId !== campaignId ||
      saved.saved.scanRequestId !== id ||
      saved.saved.payloadHash !== payloadHash
    )
      throw new AppError(
        "CONFLICT",
        "Maps run ID already has different evidence",
      );
    return MapsService.read(scope, id);
  }
  const saved = await existing();
  if (saved) return saved;
  try {
    await MapsRepository.save(campaignId, run, payloadHash);
  } catch (error) {
    const winner = await existing();
    if (!winner) throw error;
    return winner;
  }
  return MapsService.read(scope, id);
}
export const MapsPublicationService = { publish };
