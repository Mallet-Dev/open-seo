import {
  mapsPointRank,
  type MapsRun,
  type MapsBusiness,
  type MapsPointEvidence,
} from "@/shared/local-maps";

export function pointLabel(
  run: MapsRun,
  index: number,
  business: MapsBusiness,
) {
  return evidenceLabel(run.points[index], business);
}
export function evidenceLabel(
  point: MapsPointEvidence,
  business: MapsBusiness,
) {
  const rank = mapsPointRank(point, business);
  if (rank !== null) return `Rank ${rank}`;
  if (point.status === "success") return "Not found in returned results";
  return {
    unobserved: "Not observed",
    failed: "Search failed",
    excluded: "Excluded",
    pending: "Pending",
  }[point.status];
}
