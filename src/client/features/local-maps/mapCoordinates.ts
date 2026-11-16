import type { MapsRun } from "@/shared/local-maps";

const mercatorLatitudeLimit = (Math.atan(Math.sinh(Math.PI)) * 180) / Math.PI;

export function mapCoordinates(points: MapsRun["spec"]["points"]) {
  if (
    !points.length ||
    points.some((point) => Math.abs(point.latitude) > mercatorLatitudeLimit)
  ) {
    return {
      supported: false as const,
      reason:
        "This scan is outside the street map’s latitude range. Use the grid.",
    };
  }
  const longitudes = [
    ...new Set(points.map((point) => point.longitude)),
  ].toSorted((a, b) => a - b);
  let largestGap = -1;
  let start = longitudes[0];
  for (let index = 0; index < longitudes.length; index++) {
    const next = (index + 1) % longitudes.length;
    const gap = longitudes[next] + (next === 0 ? 360 : 0) - longitudes[index];
    if (gap > largestGap) {
      largestGap = gap;
      start = longitudes[next];
    }
  }
  return {
    supported: true as const,
    coordinates: points.map(
      (point) =>
        [
          point.latitude,
          point.longitude < start ? point.longitude + 360 : point.longitude,
        ] satisfies [number, number],
    ),
  };
}
