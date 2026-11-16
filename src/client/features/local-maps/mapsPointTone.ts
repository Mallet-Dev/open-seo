import {
  mapsPointRank,
  type MapsBusiness,
  type MapsRun,
} from "@/shared/local-maps";

export function pointTone(run: MapsRun, index: number, business: MapsBusiness) {
  const point = run.points[index];
  if (point.status !== "success") return point.status;
  const rank = mapsPointRank(point, business);
  return rank === null
    ? "absent"
    : rank <= 3
      ? "strong"
      : rank <= 10
        ? "visible"
        : "low";
}
