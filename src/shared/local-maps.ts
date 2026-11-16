import { z } from "zod";

const coordinateSchema = z
  .object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  })
  .strict();

// A name is a display label. Durable tracking always binds one exact identifier.
export const mapsBusinessSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("cid"), value: z.string().trim().min(1).max(64) })
    .strict(),
  z
    .object({
      kind: z.literal("placeId"),
      value: z.string().trim().min(1).max(256),
    })
    .strict(),
]);

export const mapsCampaignInputSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(200),
    business: mapsBusinessSchema,
  })
  .strict();

export const mapsRunSpecSchema = z
  .object({
    query: z.string().trim().min(1).max(120),
    languageCode: z.string().trim().min(1),
    source: z.string().trim().min(1),
    searchType: z.literal("google-maps"),
    device: z.enum(["desktop", "mobile"]),
    depth: z.number().int().positive(),
    zoom: z.number().int().min(4).max(18),
    rankBasis: z.enum(["absolute", "group"]),
    points: z
      .array(
        coordinateSchema
          .extend({
            row: z.number().int().nonnegative(),
            col: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((spec, context) => {
    const cells = new Set<string>();
    const coordinates = new Set<string>();
    for (const point of spec.points) {
      const cell = `${point.row}:${point.col}`;
      const coordinate = `${point.latitude}:${point.longitude}`;
      if (cells.has(cell) || coordinates.has(coordinate)) {
        context.addIssue({ code: "custom", message: "Duplicate grid point" });
        return;
      }
      cells.add(cell);
      coordinates.add(coordinate);
    }
  });

const mapsResultSchema = z
  .object({
    title: z.string().nullable(),
    cid: z.string().min(1).nullable(),
    placeId: z.string().min(1).nullable(),
    rank: z.number().int().positive(),
    ordinal: z.number().int().nonnegative().optional(),
    rankAbsolute: z.number().int().positive().nullable().optional(),
    rankGroup: z.number().int().positive().nullable().optional(),
  })
  .strict();

export const mapsPointEvidenceSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending") }).strict(),
  z.object({ status: z.literal("unobserved") }).strict(),
  z
    .object({ status: z.literal("excluded"), reason: z.string().trim().min(1) })
    .strict(),
  z
    .object({ status: z.literal("failed"), message: z.string().trim().min(1) })
    .strict(),
  z
    .object({
      status: z.literal("success"),
      observedAt: z.iso
        .datetime({ offset: true })
        .transform((value) => new Date(value).toISOString())
        .nullable(),
      // Sparse means the provider did not return the requested depth. Absence
      // remains "not found in returned results", never an invented depth + 1.
      coverage: z.enum(["full", "sparse", "sample"]),
      results: z.array(mapsResultSchema),
      retrievedAt: z.iso.datetime().optional(),
      providerObservedAt: z.string().min(1).nullable().optional(),
      returnedItems: z.number().int().nonnegative().optional(),
      nonBusinessItems: z.number().int().nonnegative().optional(),
    })
    .strict(),
]);

export const mapsRunSchema = z
  .object({
    id: z.uuid(),
    provenance: z.enum(["invented", "collected"]),
    spec: mapsRunSpecSchema,
    points: z.array(mapsPointEvidenceSchema),
    scanRequestId: z.uuid().optional(),
  })
  .strict()
  .superRefine((run, context) => {
    if (run.spec.points.length !== run.points.length) {
      context.addIssue({
        code: "custom",
        message: "Evidence must cover every declared grid point",
      });
    }
    if (
      (run.provenance === "collected" && run.scanRequestId !== run.id) ||
      (run.provenance === "invented" && run.scanRequestId !== undefined)
    )
      context.addIssue({
        code: "custom",
        message: "Maps provenance must match its source request",
      });
    if (
      run.provenance === "collected" &&
      run.points.some((point) => point.status !== "success")
    )
      context.addIssue({
        code: "custom",
        message: "Collected runs require every completed observation",
      });
    for (const point of run.points) {
      if (point.status !== "success") continue;
      if (run.provenance === "collected") {
        if (
          point.coverage !== "sample" ||
          point.retrievedAt === undefined ||
          point.providerObservedAt === undefined ||
          point.returnedItems === undefined ||
          point.nonBusinessItems === undefined ||
          point.returnedItems !==
            point.results.length + point.nonBusinessItems ||
          point.results.some(
            (item, index) =>
              item.ordinal === undefined ||
              item.ordinal >= point.returnedItems! ||
              (index > 0 &&
                item.ordinal <= point.results[index - 1].ordinal!) ||
              item.rankAbsolute === undefined ||
              item.rankGroup === undefined ||
              item.rank !==
                (run.spec.rankBasis === "absolute"
                  ? item.rankAbsolute
                  : item.rankGroup),
          )
        )
          context.addIssue({
            code: "custom",
            message: "Collected Maps samples require complete source metadata",
          });
        continue;
      }
      if (
        [
          "retrievedAt",
          "providerObservedAt",
          "returnedItems",
          "nonBusinessItems",
        ].some((key) => Object.hasOwn(point, key)) ||
        point.results.some((item) =>
          ["ordinal", "rankAbsolute", "rankGroup"].some((key) =>
            Object.hasOwn(item, key),
          ),
        )
      )
        context.addIssue({
          code: "custom",
          message: "Source metadata belongs to collected observations",
        });
      const ranks = new Set<number>();
      const identities = new Set<string>();
      if (point.observedAt === null || point.coverage === "sample")
        context.addIssue({
          code: "custom",
          message:
            "Invented examples require a dated full or sparse observation",
        });
      for (const item of point.results) {
        const ids = [
          item.cid === null ? null : `cid:${item.cid}`,
          item.placeId === null ? null : `place:${item.placeId}`,
        ].filter((id) => id !== null);
        if (
          item.title === null ||
          item.rank > run.spec.depth ||
          ranks.has(item.rank) ||
          ids.some((id) => identities.has(id))
        ) {
          context.addIssue({
            code: "custom",
            message:
              "Result rank or business identity is duplicated or outside scan depth",
          });
          break;
        }
        ranks.add(item.rank);
        ids.forEach((id) => identities.add(id));
      }
      if (point.coverage === "full" && point.results.length !== run.spec.depth)
        context.addIssue({
          code: "custom",
          message: "Full coverage requires the declared result depth",
        });
      if (point.coverage === "sparse" && point.results.length >= run.spec.depth)
        context.addIssue({
          code: "custom",
          message:
            "Sparse coverage must return fewer results than declared depth",
        });
    }
  });

export type MapsBusiness = z.infer<typeof mapsBusinessSchema>;
export type MapsRun = z.infer<typeof mapsRunSchema>;
export type MapsPointEvidence = z.infer<typeof mapsPointEvidenceSchema>;

export function mapsPointRank(
  point: MapsPointEvidence,
  business: MapsBusiness,
): number | null {
  if (point.status !== "success") return null;
  const ranks = point.results
    .filter(
      (item) =>
        (business.kind === "cid" ? item.cid : item.placeId) === business.value,
    )
    .map((item) => item.rank);
  return ranks.length ? Math.min(...ranks) : null;
}

export function mapsRunSummary(run: MapsRun, business: MapsBusiness) {
  let successful = 0;
  let sparse = 0;
  const ranks: number[] = [];
  for (const point of run.points) {
    if (point.status !== "success") continue;
    successful++;
    if (point.coverage !== "full") sparse++;
    const rank = mapsPointRank(point, business);
    if (rank !== null) ranks.push(rank);
  }
  return {
    declared: run.points.length,
    successful,
    sparse,
    found: ranks.length,
    notFound: successful - ranks.length,
    averageWhereFound: ranks.length
      ? ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length
      : null,
    top3: ranks.filter((rank) => rank <= 3).length,
  };
}

function comparisonSpec(run: MapsRun) {
  const { points, ...settings } = run.spec;
  return JSON.stringify([
    run.provenance,
    settings.query,
    settings.languageCode,
    settings.source,
    settings.searchType,
    settings.device,
    settings.depth,
    settings.zoom,
    settings.rankBasis,
    points
      .map((point) => [point.row, point.col, point.latitude, point.longitude])
      .toSorted((a, b) => a[0] - b[0] || a[1] - b[1]),
  ]);
}

export function compareMapsRuns(
  previous: MapsRun,
  current: MapsRun,
  business: MapsBusiness,
) {
  if (
    [previous, current].some((run) =>
      run.points.some(
        (point) => point.status === "success" && point.observedAt === null,
      ),
    )
  )
    return {
      compatible: false as const,
      reason: "Some source observation times are unknown",
    };
  const beforeTimes = previous.points.flatMap((point) =>
    point.status === "success" && point.observedAt !== null
      ? [Date.parse(point.observedAt)]
      : [],
  );
  const afterTimes = current.points.flatMap((point) =>
    point.status === "success" && point.observedAt !== null
      ? [Date.parse(point.observedAt)]
      : [],
  );
  if (
    !beforeTimes.length ||
    !afterTimes.length ||
    Math.max(...beforeTimes) >= Math.min(...afterTimes)
  ) {
    return {
      compatible: false as const,
      reason: "Comparison needs an earlier, non-overlapping observation window",
    };
  }
  if (comparisonSpec(previous) !== comparisonSpec(current)) {
    return {
      compatible: false as const,
      reason: "Scan settings or geometry changed",
    };
  }
  const previousPoints = new Map(
    previous.spec.points.map((point, index) => [
      `${point.row}:${point.col}`,
      previous.points[index],
    ]),
  );
  let commonSuccessful = 0;
  let bothFound = 0;
  let entered = 0;
  let exited = 0;
  let neitherFound = 0;
  let rankImprovement = 0;
  current.spec.points.forEach((coordinate, index) => {
    const before = previousPoints.get(`${coordinate.row}:${coordinate.col}`)!;
    const after = current.points[index];
    if (before.status !== "success" || after.status !== "success") return;
    commonSuccessful++;
    const oldRank = mapsPointRank(before, business);
    const newRank = mapsPointRank(after, business);
    if (oldRank !== null && newRank !== null) {
      bothFound++;
      rankImprovement += oldRank - newRank;
    } else if (newRank !== null) entered++;
    else if (oldRank !== null) exited++;
    else neitherFound++;
  });
  return {
    compatible: true as const,
    commonSuccessful,
    bothFound,
    entered,
    exited,
    neitherFound,
    averageImprovementWhereBothFound: bothFound
      ? rankImprovement / bothFound
      : null,
  };
}
