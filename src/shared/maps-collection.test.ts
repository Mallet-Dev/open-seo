import { expect, it } from "vitest";
import {
  prepareMapsSpec,
  mapsPointTask,
  mapsPointTaskSchema,
  estimateMapsScan,
} from "./maps-collection";
import { buildRankGridPoints, rankGridZoom } from "./maps-grid";
const input = {
  query: "tile + grout 100%",
  languageCode: "en",
  center: { latitude: 43.7, longitude: -79.4 },
};
const id = "11000000-0000-4000-8000-000000000001";
it("reuses legacy grid/zoom and freezes exact wire parameters without changing the logical query", () => {
  const original = structuredClone(input);
  const spec = prepareMapsSpec(input);
  expect(spec.points).toEqual(buildRankGridPoints(input.center, 3, 2));
  expect(spec.zoom).toBe(rankGridZoom(2, input.center.latitude));
  expect(mapsPointTask(id, spec, 4)).toMatchObject({
    keyword: "tile %2B grout 100%25",
    locationCoordinate: `43.7,-79.4,${spec.zoom}z`,
    tag: `${id}:4`,
    os: "android",
    device: "mobile",
    priority: 1,
    searchPlaces: false,
    searchThisArea: true,
    depth: 20,
  });
  const tiny = prepareMapsSpec({
    ...input,
    center: { latitude: 0.0000001, longitude: 0.0000001 },
  });
  expect(mapsPointTask(id, tiny, 4).locationCoordinate).toBe(
    `0.0000001,0.0000001,${tiny.zoom}z`,
  );
  expect(spec.query).toBe(input.query);
  expect(input).toEqual(original);
  expect(() => mapsPointTask(id, spec, 9)).toThrow();
  expect(() => mapsPointTask(id, spec, 0.5)).toThrow();
});
it("wraps generated dateline points, rejects polar overflow and invalid provider coordinates instead of clamping", () => {
  const spec = prepareMapsSpec({
    ...input,
    center: { latitude: 0, longitude: 179.9999999 },
  });
  expect(spec.points.some((p) => p.longitude < 0)).toBe(true);
  expect(spec.points.every((p) => Math.abs(p.longitude) <= 180)).toBe(true);
  expect(() =>
    prepareMapsSpec({ ...input, center: { latitude: 90, longitude: 0 } }),
  ).toThrow();
  const task = mapsPointTask(id, prepareMapsSpec(input), 0);
  for (const locationCoordinate of [
    "91,0,12z",
    "0,181,12z",
    "0,0,19z",
    "0.12345678,0,12z",
    "garbage",
  ])
    expect(
      mapsPointTaskSchema.safeParse({ ...task, locationCoordinate }).success,
    ).toBe(false);
  expect(
    mapsPointTaskSchema.safeParse({ ...task, keyword: "tile+grout" }).success,
  ).toBe(false);
  expect(
    mapsPointTaskSchema.safeParse({ ...task, os: "windows" }).success,
  ).toBe(false);
});
it("sums separately rounded per-point charges at page boundaries and leaves only contradictory operator quotes held", () => {
  const spec = prepareMapsSpec(input);
  expect(estimateMapsScan(spec, true)).toMatchObject({
    points: 9,
    providerPerPointUsd: 0.0006,
    providerEstimateUsd: 0.0054,
    estimatedChargeUsd: 0.009,
    estimatedCredits: 9,
  });
  expect(
    estimateMapsScan({ ...spec, depth: 100 }, true)?.estimatedCredits,
  ).toBe(9);
  expect(estimateMapsScan({ ...spec, depth: 101 }, true)).toMatchObject({
    providerPerPointUsd: 0.0012,
    estimatedCredits: 18,
  });
  expect(estimateMapsScan(spec, false)).toMatchObject({
    estimatedChargeUsd: 0.0054,
    estimatedCredits: null,
  });
  expect(
    estimateMapsScan({ ...spec, query: "site:example.test tile" }, true),
  ).toBeNull();
  expect(() => prepareMapsSpec({ ...input, depth: 701 })).toThrow();
  expect(
    prepareMapsSpec({ ...input, depth: 700, device: "mobile" }).depth,
  ).toBe(700);
});
