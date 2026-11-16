import {
  applyBillingMarkupUsd,
  AUTUMN_SEO_DATA_CREDITS_PER_USD,
  roundUsdForBilling,
} from "./billing";
import { z } from "zod";
import { isSupportedLanguageCode } from "./keyword-locations";
import { mapsBusinessSchema } from "./local-maps";

export const reviewTaskRequestSchema = z
  .object({
    business: mapsBusinessSchema,
    locationCode: z.number().int().positive(),
    languageCode: z.string().trim().refine(isSupportedLanguageCode, {
      message: "Unsupported language code",
    }),
    depth: z.number().int().min(10).max(200).default(20),
    sortBy: z
      .enum(["newest", "highest_rating", "lowest_rating", "relevant"])
      .default("newest"),
    includeOtherSources: z.boolean().default(false),
  })
  .strict()
  .transform((request) => ({
    ...request,
    // Extended reviews ignores sorting; retain only its effective request.
    sortBy: request.includeOtherSources
      ? ("relevant" as const)
      : request.sortBy,
  }));
export type ReviewTaskRequest = z.infer<typeof reviewTaskRequestSchema>;
export const reviewTaskStates = [
  "prepared",
  "submitting",
  "queued",
  "unknown",
] as const;

const nullableText = z.string().nullable();
const nullableNumber = z.number().finite().nonnegative().nullable();
const reviewEvidenceRowSchema = z
  .object({
    reviewId: nullableText,
    rank: nullableNumber,
    author: nullableText,
    text: nullableText,
    originalText: nullableText,
    language: nullableText,
    ratingValue: nullableNumber,
    ratingMax: nullableNumber,
    ratingType: nullableText,
    timestamp: nullableText,
    timeAgo: nullableText,
    sourceTitle: nullableText,
    sourceDomain: nullableText,
    reviewUrl: nullableText,
    ownerAnswer: nullableText,
    originalOwnerAnswer: nullableText,
    ownerTimestamp: nullableText,
    ownerTimeAgo: nullableText,
    replyState: z.enum(["present", "absent", "unknown"]),
  })
  .strict()
  .refine(
    (row) =>
      (row.replyState === "present") ===
      Boolean(row.ownerAnswer?.trim() || row.originalOwnerAnswer?.trim()),
    { message: "Reply state must match the returned answer content" },
  );
export const reviewEvidenceSchema = z
  .object({
    retrievedAt: z.iso.datetime(),
    providerObservedAt: nullableText,
    resultKind: z.enum(["empty", "sample"]),
    title: nullableText,
    cid: nullableText,
    placeId: nullableText,
    reportedReviewCount: z.number().int().nonnegative().nullable(),
    reportedItemsCount: z.number().int().nonnegative().nullable(),
    ratingValue: nullableNumber,
    ratingMax: nullableNumber,
    ratingType: nullableText,
    rows: z.array(reviewEvidenceRowSchema),
  })
  .strict()
  .refine(
    (evidence) => evidence.resultKind !== "empty" || evidence.rows.length === 0,
    { message: "An empty result cannot contain review rows" },
  );
export type ReviewEvidence = z.infer<typeof reviewEvidenceSchema>;

const REVIEW_PRICING_VERSION = "google-reviews-priority-2026-11-15";
export const reviewCostQuoteSchema = z
  .object({
    requestId: z.uuid(),
    pricingVersion: z.string(),
    mode: z.enum(["hosted", "self_hosted"]),
    currency: z.literal("USD"),
    providerEstimateUsd: z.number().finite().nonnegative(),
    estimatedChargeUsd: z.number().finite().nonnegative(),
    estimatedCredits: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type ReviewCostQuote = z.infer<typeof reviewCostQuoteSchema>;
export function estimateReviewCollection(
  request: ReviewTaskRequest,
  hosted: boolean,
) {
  if (request.includeOtherSources) return null;
  // Official priority rate per ten returned reviews; requested depth is an estimate, not a provider cap.
  // https://dataforseo.com/pricing/business-data/google-reviews-api
  const providerEstimateUsd = roundUsdForBilling(
    Math.ceil(request.depth / 10) * 0.0015,
  );
  const estimatedChargeUsd = hosted
    ? applyBillingMarkupUsd(providerEstimateUsd)
    : providerEstimateUsd;
  return {
    pricingVersion: REVIEW_PRICING_VERSION,
    mode: hosted ? ("hosted" as const) : ("self_hosted" as const),
    currency: "USD" as const,
    providerEstimateUsd,
    estimatedChargeUsd,
    estimatedCredits: hosted
      ? Math.ceil(estimatedChargeUsd * AUTUMN_SEO_DATA_CREDITS_PER_USD)
      : null,
  };
}
