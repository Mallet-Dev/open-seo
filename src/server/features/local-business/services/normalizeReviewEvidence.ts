import { z } from "zod";
import {
  reviewEvidenceSchema,
  type ReviewTaskRequest,
} from "@/shared/local-reviews";
import { AppError } from "@/server/lib/errors";

const text = z.string().nullish();
const number = z.number().finite().nonnegative().nullish();
const rating = z
  .object({ value: number, rating_max: number, rating_type: text })
  .nullish();
const rowSchema = z.object({
  review_id: text,
  rank_absolute: number,
  profile_name: text,
  review_text: text,
  original_review_text: text,
  original_language: text,
  rating,
  timestamp: text,
  time_ago: text,
  review_url: text,
  source: z.object({ title: text, domain: text }).nullish(),
  owner_answer: text,
  original_owner_answer: text,
  owner_timestamp: text,
  owner_time_ago: text,
});
const resultSchema = z.object({
  title: text,
  cid: text,
  place_id: text,
  datetime: text,
  rating,
  reviews_count: z.number().int().nonnegative().nullish(),
  items_count: z.number().int().nonnegative().nullish(),
  items: z.array(rowSchema),
});
export function assertReviewBusiness(
  request: ReviewTaskRequest,
  evidence: { cid: string | null; placeId: string | null },
) {
  const returned =
    request.business.kind === "cid" ? evidence.cid : evidence.placeId;
  if (returned !== null && returned !== request.business.value)
    throw new AppError(
      "CONFLICT",
      "Returned reviews belong to a different business",
    );
}
export function normalizeReviewEvidence(
  raw: unknown,
  request: ReviewTaskRequest,
  retrievedAt = new Date().toISOString(),
) {
  const result = raw === null ? null : resultSchema.parse(raw);
  const evidence = reviewEvidenceSchema.parse({
    retrievedAt,
    providerObservedAt: result?.datetime ?? null,
    resultKind: result === null ? "empty" : "sample",
    title: result?.title ?? null,
    cid: result?.cid ?? null,
    placeId: result?.place_id ?? null,
    reportedReviewCount: result?.reviews_count ?? null,
    reportedItemsCount: result?.items_count ?? null,
    ratingValue: result?.rating?.value ?? null,
    ratingMax: result?.rating?.rating_max ?? null,
    ratingType: result?.rating?.rating_type ?? null,
    rows: (result?.items ?? []).map((row) => ({
      reviewId: row.review_id ?? null,
      rank: row.rank_absolute ?? null,
      author: row.profile_name ?? null,
      text: row.review_text ?? null,
      originalText: row.original_review_text ?? null,
      language: row.original_language ?? null,
      ratingValue: row.rating?.value ?? null,
      ratingMax: row.rating?.rating_max ?? null,
      ratingType: row.rating?.rating_type ?? null,
      timestamp: row.timestamp ?? null,
      timeAgo: row.time_ago ?? null,
      sourceTitle: row.source?.title ?? null,
      sourceDomain: row.source?.domain ?? null,
      reviewUrl: row.review_url ?? null,
      ownerAnswer: row.owner_answer ?? null,
      originalOwnerAnswer: row.original_owner_answer ?? null,
      ownerTimestamp: row.owner_timestamp ?? null,
      ownerTimeAgo: row.owner_time_ago ?? null,
      replyState:
        row.owner_answer?.trim() || row.original_owner_answer?.trim()
          ? "present"
          : row.owner_answer === undefined &&
              row.original_owner_answer === undefined
            ? "unknown"
            : "absent",
    })),
  });
  assertReviewBusiness(request, evidence);
  return evidence;
}
