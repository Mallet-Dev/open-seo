import { expect, it } from "vitest";
import { mapsBusinesses } from "./mapsBusinesses";
import { mapsFixture } from "./mapsFixture";

it("excludes the tracked business's co-returned CID from place-ID competitors without matching names", () => {
  const run = mapsFixture("11000000-0000-4000-8000-000000000001", false);
  const point = run.points.find((candidate) => candidate.status === "success");
  if (!point || point.status !== "success")
    throw Error("Fixture needs a successful point");
  point.results = [
    {
      title: "Same name",
      cid: "tracked-cid",
      placeId: "tracked-place",
      rank: 1,
    },
    { title: "Same name", cid: "other-cid", placeId: "other-place", rank: 2 },
  ];
  const { businesses: options, trackedAliases } = mapsBusinesses(
    run,
    { kind: "placeId", value: "tracked-place" },
    "Same name",
  );
  expect(options.has("placeId:tracked-place")).toBe(true);
  expect(options.has("cid:tracked-cid")).toBe(false);
  expect(options.has("cid:other-cid")).toBe(true);
  expect(trackedAliases.has("cid:tracked-cid")).toBe(true);
  expect(trackedAliases.has("cid:other-cid")).toBe(false);
  point.results[0].placeId = null;
  expect(
    mapsBusinesses(
      run,
      { kind: "placeId", value: "tracked-place" },
      "Same name",
    ).trackedAliases.has("cid:tracked-cid"),
  ).toBe(false);
});
