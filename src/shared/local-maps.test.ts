import { describe, expect, it } from "vitest";
import {
  compareMapsRuns,
  mapsBusinessSchema,
  mapsPointRank,
  mapsRunSchema,
  mapsRunSummary,
  type MapsRun,
} from "./local-maps";

const target = mapsBusinessSchema.parse({ kind: "cid", value: "123" });
function run(): MapsRun {
  return mapsRunSchema.parse({
    id: "11000000-0000-4000-8000-000000000001",
    provenance: "invented",
    spec: {
      query: "tile installation",
      languageCode: "en",
      source: "fixture",
      searchType: "google-maps",
      device: "mobile",
      depth: 3,
      zoom: 12,
      rankBasis: "absolute",
      points: [
        { row: 0, col: 0, latitude: 43.7, longitude: -79.4 },
        { row: 0, col: 1, latitude: 43.7, longitude: -79.3 },
        { row: 1, col: 0, latitude: 43.6, longitude: -79.4 },
      ],
    },
    points: [
      {
        status: "success",
        observedAt: "2026-11-15T09:00:00Z",
        coverage: "sparse",
        results: [
          { title: "Same name", cid: "999", placeId: null, rank: 1 },
          { title: "Target", cid: "123", placeId: "abc", rank: 3 },
        ],
      },
      {
        status: "success",
        observedAt: "2026-11-15T09:00:00Z",
        coverage: "sparse",
        results: [],
      },
      { status: "failed", message: "Provider did not complete" },
    ],
  });
}

describe("Maps evidence", () => {
  it("rejects reverse and overlapping time windows and normalizes offsets", () => {
    const before = run();
    const after = run();
    expect(compareMapsRuns(before, after, target).compatible).toBe(false);
    before.points.forEach((point) => {
      if (point.status === "success") point.observedAt = "2026-11-16T09:00:00Z";
    });
    expect(compareMapsRuns(before, after, target).compatible).toBe(false);
    const point = after.points[0];
    if (point.status === "success")
      point.observedAt = "2026-11-15T04:00:00-05:00";
    const normalized = mapsRunSchema.parse(after).points[0];
    expect(normalized.status === "success" && normalized.observedAt).toBe(
      "2026-11-15T09:00:00.000Z",
    );
  });
  it("matches stable identity without an earlier name or other ID overriding it", () => {
    const sample = run();
    expect(mapsPointRank(sample.points[0], target)).toBe(3);
    expect(
      mapsPointRank(sample.points[0], { kind: "placeId", value: "abc" }),
    ).toBe(3);
    expect(
      mapsPointRank(sample.points[0], { kind: "cid", value: "absent" }),
    ).toBeNull();
    expect(
      mapsBusinessSchema.safeParse({ kind: "name", value: "Target" }).success,
    ).toBe(false);
  });

  it("keeps sparse, failed and not-found observations out of average rank", () => {
    expect(mapsRunSummary(run(), target)).toEqual({
      declared: 3,
      successful: 2,
      sparse: 2,
      found: 1,
      notFound: 1,
      averageWhereFound: 3,
      top3: 1,
    });
    expect(
      mapsRunSummary(run(), { kind: "cid", value: "absent" }).averageWhereFound,
    ).toBeNull();
  });

  it("rejects invalid geometry, duplicate cells and incomplete evidence", () => {
    const sample = run();
    sample.spec.points[0].latitude = 91;
    expect(mapsRunSchema.safeParse(sample).success).toBe(false);
    const duplicate = run();
    duplicate.spec.points[1] = duplicate.spec.points[0]!;
    expect(mapsRunSchema.safeParse(duplicate).success).toBe(false);
    const incomplete = run();
    incomplete.points.pop();
    expect(mapsRunSchema.safeParse(incomplete).success).toBe(false);
  });

  it("rejects invented ranks, conflicting identities and false full coverage", () => {
    for (const rank of [0, 4, 1.5]) {
      const sample = run();
      const point = sample.points[0];
      if (point.status === "success") point.results[1].rank = rank;
      expect(mapsRunSchema.safeParse(sample).success).toBe(false);
    }
    const duplicate = run();
    const point = duplicate.points[0];
    if (point.status === "success") point.results[1].cid = "999";
    expect(mapsRunSchema.safeParse(duplicate).success).toBe(false);
    const full = run();
    const fullPoint = full.points[0];
    if (fullPoint.status === "success") fullPoint.coverage = "full";
    expect(mapsRunSchema.safeParse(full).success).toBe(false);
  });

  it("compares common successful points and separates entry from measured movement", () => {
    const before = run();
    before.points.forEach((point) => {
      if (point.status === "success") point.observedAt = "2026-11-08T09:00:00Z";
    });
    const after = run();
    const point = after.points[0];
    if (point.status === "success") point.results[1].rank = 2;
    const entered = after.points[1];
    if (entered.status === "success")
      entered.results.push({
        title: "Target",
        cid: "123",
        placeId: null,
        rank: 1,
      });
    expect(compareMapsRuns(before, after, target)).toEqual({
      compatible: true,
      commonSuccessful: 2,
      bothFound: 1,
      entered: 1,
      exited: 0,
      neitherFound: 0,
      averageImprovementWhereBothFound: 1,
    });
    // Stable cells, not array order, bind paired observations.
    after.spec.points.reverse();
    after.points.reverse();
    expect(compareMapsRuns(before, after, target)).toEqual(
      compareMapsRuns(before, mapsRunSchema.parse(after), target),
    );
    expect(compareMapsRuns(before, after, target).compatible).toBe(true);
  });

  it("refuses changes in source, depth, basis, geometry and fixture provenance", () => {
    const before = run();
    for (const change of [
      (sample: MapsRun) => {
        sample.spec.source = "other";
      },
      (sample: MapsRun) => {
        sample.spec.depth = 20;
      },
      (sample: MapsRun) => {
        sample.spec.rankBasis = "group";
      },
      (sample: MapsRun) => {
        sample.spec.points[0].longitude += 0.01;
      },
      (sample: MapsRun) => {
        sample.provenance = "collected";
      },
    ]) {
      const after = run();
      change(after);
      expect(compareMapsRuns(before, after, target).compatible).toBe(false);
    }
  });
});

it("keeps source metadata out of invented imports and requires complete collected runs", () => {
  const invented = run();
  const point = invented.points[0];
  if (point.status !== "success") throw Error("Expected a success fixture");
  point.retrievedAt = "2026-11-15T12:00:00.000Z";
  expect(mapsRunSchema.safeParse(invented).success).toBe(false);
  expect(
    mapsRunSchema.safeParse({
      ...run(),
      provenance: "collected",
      scanRequestId: invented.id,
    }).success,
  ).toBe(false);
});
