import { expect, it } from "vitest";
import { mapsSelectionSchema } from "./mapsSelection";
import { nextMapsPoint } from "./mapsPointNavigation";
it("accepts scoped Maps links and discards malformed or unrelated URL fields", () => {
  const campaignId = "11000000-0000-4000-8000-000000000001";
  expect(
    mapsSelectionSchema.parse({
      campaignId,
      mapsView: "scan",
      scanId: "bad",
      view: "all",
      providerKey: "never",
    }),
  ).toEqual({ campaignId, mapsView: "scan", scanId: undefined });
});
it("moves geographically in sparse grids without wrapping or losing the selected edge", () => {
  const points = [
    { row: 0, col: 0, latitude: 1, longitude: 1 },
    { row: 0, col: 1, latitude: 1, longitude: 2 },
    { row: 1, col: 1, latitude: 0, longitude: 2 },
  ];
  expect(nextMapsPoint(points, 0, "ArrowRight")).toBe(1);
  expect(nextMapsPoint(points, 1, "ArrowDown")).toBe(2);
  expect(nextMapsPoint(points, 2, "ArrowLeft")).toBe(2);
  expect(nextMapsPoint(points, 0, "ArrowLeft")).toBe(0);
  expect(nextMapsPoint(points, 1, "Enter")).toBe(1);
});
