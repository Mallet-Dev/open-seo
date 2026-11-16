import { z } from "zod";
import { mapsRunSpecSchema } from "./local-maps";
import { buildRankGridPoints, rankGridZoom } from "./maps-grid";
import { isSupportedLanguageCode } from "./keyword-locations";
import {
  applyBillingMarkupUsd,
  roundUsdForBilling,
  AUTUMN_SEO_DATA_CREDITS_PER_USD,
  autumnSeoDataCreditsToUsd,
} from "./billing";

const MAPS_TASK_SOURCE = "dataforseo:serp/google/maps/task_post:normal:v1";
export const mapsScanInputSchema = z
  .object({
    query: z.string().trim().min(1).max(120),
    languageCode: z
      .string()
      .refine(isSupportedLanguageCode, "Unsupported language code"),
    center: z
      .object({
        latitude: z.number().finite().min(-90).max(90),
        longitude: z.number().finite().min(-180).max(180),
      })
      .strict(),
    gridSize: z.union([z.literal(3), z.literal(5)]).default(3),
    spacingKm: z.number().finite().min(0.25).max(10).default(2),
    device: z.enum(["desktop", "mobile"]).default("mobile"),
    depth: z.number().int().min(1).max(700).default(20),
    zoom: z.number().int().min(4).max(18).optional(),
    rankBasis: z.enum(["absolute", "group"]).default("absolute"),
  })
  .strict();
export type MapsScanInput = z.infer<typeof mapsScanInputSchema>;
export function prepareMapsSpec(raw: unknown) {
  const input = mapsScanInputSchema.parse(raw);
  const points = buildRankGridPoints(
    input.center,
    input.gridSize,
    input.spacingKm,
  ).map((point) => ({
    ...point,
    longitude: Number(
      (((((point.longitude + 180) % 360) + 360) % 360) - 180).toFixed(7),
    ),
  }));
  return mapsRunSpecSchema.parse({
    query: input.query,
    languageCode: input.languageCode,
    source: MAPS_TASK_SOURCE,
    searchType: "google-maps",
    device: input.device,
    depth: input.depth,
    zoom: input.zoom ?? rankGridZoom(input.spacingKm, input.center.latitude),
    rankBasis: input.rankBasis,
    points,
  });
}

export const mapsPointTaskSchema = z
  .object({
    keyword: z
      .string()
      .min(1)
      .max(700)
      .refine(
        (value) => !value.includes("+") && !/%(?!25|2B)/.test(value),
        "Literal Maps query characters must use the frozen encoding",
      ),
    locationCoordinate: z.string().refine((value) => {
      const parts = /^(-?\d+(?:\.\d{1,7})?),(-?\d+(?:\.\d{1,7})?),(\d+)z$/.exec(
        value,
      );
      return (
        !!parts &&
        Math.abs(Number(parts[1])) <= 90 &&
        Math.abs(Number(parts[2])) <= 180 &&
        Number(parts[3]) >= 4 &&
        Number(parts[3]) <= 18
      );
    }, "Invalid frozen Maps coordinate"),
    languageCode: z
      .string()
      .refine(isSupportedLanguageCode, "Unsupported language code"),
    device: z.enum(["desktop", "mobile"]),
    os: z.enum(["windows", "android"]),
    depth: z.number().int().min(1).max(700),
    priority: z.literal(1),
    searchPlaces: z.literal(false),
    searchThisArea: z.literal(true),
    tag: z.string().min(1).max(255),
    rankBasis: z.enum(["absolute", "group"]),
  })
  .strict()
  .refine(
    (v) => v.os === (v.device === "desktop" ? "windows" : "android"),
    "Device/OS mismatch",
  );
export type MapsPointTask = z.infer<typeof mapsPointTaskSchema>;
export function mapsPointTask(
  scanId: string,
  rawSpec: unknown,
  index: number,
): MapsPointTask {
  z.uuid().parse(scanId);
  const spec = mapsRunSpecSchema.parse(rawSpec);
  if (spec.source !== MAPS_TASK_SOURCE)
    throw Error("Unsupported Maps collection source");
  const point = spec.points[index];
  if (!point) throw Error("Maps point does not exist");
  return mapsPointTaskSchema.parse({
    keyword: spec.query.replaceAll("%", "%25").replaceAll("+", "%2B"),
    locationCoordinate: `${[point.latitude, point.longitude].map((value) => value.toFixed(7).replace(/\.?0+$/, "")).join(",")},${spec.zoom}z`,
    languageCode: spec.languageCode,
    device: spec.device,
    os: spec.device === "desktop" ? "windows" : "android",
    depth: spec.depth,
    priority: 1,
    searchPlaces: false,
    searchThisArea: true,
    tag: `${scanId}:${index}`,
    rankBasis: spec.rankBasis,
  });
}

export function estimateMapsScan(rawSpec: unknown, hosted: boolean) {
  const spec = mapsRunSpecSchema.parse(rawSpec);
  if (spec.source !== MAPS_TASK_SOURCE)
    throw Error("Unsupported Maps collection source");
  // SDK operator surcharges conflict with current Maps docs; hold only affected quotes.
  if (
    /(allinanchor|allintext|allintitle|allinurl|cache|define|definition|filetype|id|inanchor|info|intext|intitle|inurl|link|related|site):/i.test(
      spec.query,
    )
  )
    return null;
  z.number().int().min(1).max(700).parse(spec.depth);
  const providerPerPointUsd = roundUsdForBilling(
    Math.ceil(spec.depth / 100) * 0.0006,
  );
  const chargePerPointUsd = hosted
    ? applyBillingMarkupUsd(providerPerPointUsd)
    : providerPerPointUsd;
  const creditsPerPoint = hosted
    ? Math.ceil(chargePerPointUsd * AUTUMN_SEO_DATA_CREDITS_PER_USD)
    : null;
  return {
    pricingVersion: "google-maps-normal-2026-11-15",
    mode: hosted ? ("hosted" as const) : ("self_hosted" as const),
    currency: "USD" as const,
    points: spec.points.length,
    providerPerPointUsd,
    providerEstimateUsd: roundUsdForBilling(
      providerPerPointUsd * spec.points.length,
    ),
    estimatedChargeUsd:
      creditsPerPoint === null
        ? roundUsdForBilling(chargePerPointUsd * spec.points.length)
        : autumnSeoDataCreditsToUsd(creditsPerPoint * spec.points.length),
    estimatedCredits:
      creditsPerPoint === null ? null : creditsPerPoint * spec.points.length,
  };
}

export const mapsCostQuoteSchema = z
  .object({
    requestId: z.uuid(),
    requestHash: z.string().regex(/^[a-f0-9]{64}$/),
    pricingVersion: z.string().min(1),
    mode: z.enum(["hosted", "self_hosted"]),
    currency: z.literal("USD"),
    points: z.number().int().positive(),
    providerPerPointUsd: z.number().finite().nonnegative(),
    providerEstimateUsd: z.number().finite().nonnegative(),
    estimatedChargeUsd: z.number().finite().nonnegative(),
    estimatedCredits: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type MapsCostQuote = z.infer<typeof mapsCostQuoteSchema>;

export const mapsProviderTaskIdSchema = z
  .string()
  .regex(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i);
export const mapsPostReceiptSchema = z
  .object({
    taskId: mapsProviderTaskIdSchema.nullable(),
    requestTag: z.string().min(1),
    providerTag: z.string().nullable(),
    providerStatus: z.number().int().nullable(),
    providerCostUsd: z.number().finite().nullable(),
    identityVerified: z.boolean(),
    returnedTaskIds: z.array(mapsProviderTaskIdSchema),
    returnedTaskCount: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.returnedTaskIds.length > v.returnedTaskCount ||
      (v.identityVerified &&
        (!v.taskId ||
          v.returnedTaskCount !== 1 ||
          v.returnedTaskIds.length !== 1 ||
          v.returnedTaskIds[0] !== v.taskId ||
          v.providerTag !== v.requestTag ||
          v.providerStatus !== 20100 ||
          v.providerCostUsd === null ||
          v.providerCostUsd < 0))
    )
      ctx.addIssue({
        code: "custom",
        message: "Inconsistent Maps submission receipt",
      });
  });
export type MapsPostReceipt = z.infer<typeof mapsPostReceiptSchema>;
export const mapsPointObservationSchema = z
  .object({
    status: z.literal("completed"),
    taskId: mapsProviderTaskIdSchema,
    receivedAt: z.iso.datetime(),
    providerObservedAt: z.string().min(1).nullable(),
    resultKind: z.enum(["empty", "sample"]),
    itemsCount: z.number().int().nonnegative(),
    nonBusinessItemsCount: z.number().int().nonnegative(),
    itemTypes: z.array(z.string().min(1)),
    rows: z.array(
      z
        .object({
          ordinal: z.number().int().nonnegative(),
          title: z.string().nullable(),
          cid: z.string().min(1).nullable(),
          placeId: z.string().min(1).nullable(),
          rank: z.number().int().positive(),
          rankAbsolute: z.number().int().positive().nullable(),
          rankGroup: z.number().int().positive().nullable(),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.rows.length + v.nonBusinessItemsCount !== v.itemsCount ||
      (v.resultKind === "empty") !== (v.itemsCount === 0) ||
      new Set(v.itemTypes).size !== v.itemTypes.length ||
      (v.itemsCount === 0) !== (v.itemTypes.length === 0) ||
      (v.rows.length > 0 && !v.itemTypes.includes("maps_search")) ||
      v.rows.some(
        (r, i) =>
          r.ordinal >= v.itemsCount ||
          (i > 0 && r.ordinal <= v.rows[i - 1].ordinal),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Inconsistent Maps observation coverage",
      });
  });
export type MapsPointObservation = z.infer<typeof mapsPointObservationSchema>;

export function mapsObservedAt(raw: string | null): string | null {
  if (raw === null) return null;
  const iso = raw.replace(
    /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2}:\d{2})$/,
    "$1T$2$3",
  );
  const parsed = z.iso.datetime({ offset: true }).safeParse(iso);
  return parsed.success ? new Date(parsed.data).toISOString() : null;
}
export function mapsObservationPoint(raw: MapsPointObservation) {
  const evidence = mapsPointObservationSchema.parse(raw);
  return {
    status: "success" as const,
    observedAt: mapsObservedAt(evidence.providerObservedAt),
    coverage: "sample" as const,
    results: evidence.rows.map(
      ({ title, cid, placeId, rank, ordinal, rankAbsolute, rankGroup }) => ({
        title,
        cid,
        placeId,
        rank,
        ordinal,
        rankAbsolute,
        rankGroup,
      }),
    ),
    retrievedAt: evidence.receivedAt,
    providerObservedAt: evidence.providerObservedAt,
    returnedItems: evidence.itemsCount,
    nonBusinessItems: evidence.nonBusinessItemsCount,
  };
}
