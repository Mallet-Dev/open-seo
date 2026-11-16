import { expect, it } from "vitest";
import { normalizeReviewEvidence } from "./normalizeReviewEvidence";
import {
  reviewTaskRequestSchema,
  reviewEvidenceSchema,
} from "@/shared/local-reviews";
const request = reviewTaskRequestSchema.parse({
  business: { kind: "cid", value: "invented" },
  locationCode: 2124,
  languageCode: "en",
});
it("preserves unknowns, explicit zero, rating scale, original text and reply evidence", () => {
  const evidence = normalizeReviewEvidence(
    {
      items: [
        {},
        {
          rating: { value: 0, rating_max: 100, rating_type: "Percents" },
          review_text: "Translated",
          original_review_text: "Original",
          original_language: "fr",
          owner_answer: null,
        },
        { owner_answer: "", original_owner_answer: "  Thank you  " },
        { owner_answer: "  " },
      ],
    },
    request,
  );
  expect(evidence.reportedReviewCount).toBeNull();
  expect(evidence.rows[0]).toMatchObject({
    ratingValue: null,
    timestamp: null,
    replyState: "unknown",
  });
  expect(evidence.rows[1]).toMatchObject({
    ratingValue: 0,
    ratingMax: 100,
    ratingType: "Percents",
    text: "Translated",
    originalText: "Original",
    language: "fr",
    replyState: "absent",
  });
  expect(evidence.rows[2]).toMatchObject({
    replyState: "present",
    originalOwnerAnswer: "  Thank you  ",
  });
  expect(evidence.rows[3].replyState).toBe("absent");
});
it("rejects malformed items, numeric coercion and contradictory business identity", () => {
  for (const raw of [
    {},
    { items: null },
    { items: [{ rating: { value: "" } }] },
    { cid: "other", items: [] },
  ])
    expect(() => normalizeReviewEvidence(raw, request)).toThrow();
  expect(normalizeReviewEvidence(null, request)).toMatchObject({
    resultKind: "empty",
    reportedReviewCount: null,
    rows: [],
  });
  expect(
    normalizeReviewEvidence(
      { reviews_count: 50, items_count: 0, items: [] },
      request,
    ),
  ).toMatchObject({ resultKind: "sample", reportedReviewCount: 50, rows: [] });
});

it("rejects contradictory evidence at the explicit publication boundary", () => {
  const evidence = normalizeReviewEvidence({ items: [{}] }, request);
  const row = evidence.rows[0];
  expect(() =>
    reviewEvidenceSchema.parse({ ...evidence, resultKind: "empty" }),
  ).toThrow();
  for (const changed of [
    { ...row, replyState: "present" },
    { ...row, replyState: "present", ownerAnswer: "  " },
    { ...row, replyState: "absent", ownerAnswer: "Thank you" },
    { ...row, replyState: "unknown", originalOwnerAnswer: "Merci" },
  ])
    expect(() =>
      reviewEvidenceSchema.parse({ ...evidence, rows: [changed] }),
    ).toThrow();
  for (const replyState of ["absent", "unknown"])
    expect(
      reviewEvidenceSchema.parse({
        ...evidence,
        rows: [{ ...row, replyState }],
      }).rows[0].replyState,
    ).toBe(replyState);
});
