import type { MapsBusiness, MapsRun } from "@/shared/local-maps";

export function mapsBusinesses(
  run: MapsRun,
  business: MapsBusiness,
  name: string,
) {
  const businesses = new Map<
    string,
    { name: string; identity: MapsBusiness }
  >();
  businesses.set(`${business.kind}:${business.value}`, {
    name,
    identity: business,
  });
  const results = run.points.flatMap((point) =>
    point.status === "success" ? point.results : [],
  );
  const trackedCids = new Set<string>();
  const trackedPlaces = new Set<string>();
  for (const result of results) {
    if (
      (business.kind === "cid" ? result.cid : result.placeId) !== business.value
    )
      continue;
    if (result.cid) trackedCids.add(result.cid);
    if (result.placeId) trackedPlaces.add(result.placeId);
  }
  for (const result of results) {
    if (
      (result.cid && trackedCids.has(result.cid)) ||
      (result.placeId && trackedPlaces.has(result.placeId))
    )
      continue;
    const identity: MapsBusiness | null = result.cid
      ? { kind: "cid", value: result.cid }
      : result.placeId
        ? { kind: "placeId", value: result.placeId }
        : null;
    if (identity)
      businesses.set(`${identity.kind}:${identity.value}`, {
        name:
          result.title ??
          businesses.get(`${identity.kind}:${identity.value}`)?.name ??
          identity.value,
        identity,
      });
  }
  const trackedAliases = new Set([
    `${business.kind}:${business.value}`,
    ...[...trackedCids].map((value) => `cid:${value}`),
    ...[...trackedPlaces].map((value) => `placeId:${value}`),
  ]);
  return { businesses, trackedAliases };
}
