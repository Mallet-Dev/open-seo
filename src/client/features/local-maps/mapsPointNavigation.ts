import type { MapsRun } from "@/shared/local-maps";
export function nextMapsPoint(
  points: MapsRun["spec"]["points"],
  index: number,
  key: string,
) {
  const current = points[index];
  if (!current) return index;
  const next = points.findIndex(
    (point) =>
      point.row ===
        current.row + (key === "ArrowDown" ? 1 : key === "ArrowUp" ? -1 : 0) &&
      point.col ===
        current.col + (key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0),
  );
  return next >= 0 ? next : index;
}
