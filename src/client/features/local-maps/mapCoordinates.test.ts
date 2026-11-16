import { expect, it } from "vitest";
import { mapCoordinates } from "./mapCoordinates";

it("fits antimeridian neighbours together without changing saved coordinates or point order", () => {
  const points = [
    { row: 0, col: 0, latitude: 10, longitude: -179 },
    { row: 0, col: 1, latitude: 11, longitude: 179 },
  ];
  const original = structuredClone(points);
  const result = mapCoordinates(points);
  expect(result.supported).toBe(true);
  if (!result.supported) throw Error("Expected supported geometry");
  expect(result.coordinates).toEqual([
    [10, 181],
    [11, 179],
  ]);
  expect(points).toEqual(original);
  const local = mapCoordinates([
    { row: 0, col: 0, latitude: 43.7, longitude: -79.4 },
  ]);
  expect(local).toMatchObject({
    supported: true,
    coordinates: [[43.7, -79.4]],
  });
});
it("keeps polar scans in the grid instead of silently clamping their saved latitude", () => {
  for (const latitude of [90, -90])
    expect(
      mapCoordinates([{ row: 0, col: 0, latitude, longitude: 0 }]),
    ).toMatchObject({ supported: false });
  expect(
    mapCoordinates([{ row: 0, col: 0, latitude: 85, longitude: 0 }]).supported,
  ).toBe(true);
});
