import {
  pgTable,
  text,
  integer,
  doublePrecision,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects } from "./app.schema";
import { organization } from "./better-auth-schema";
import { reviewTaskStates } from "@/shared/local-reviews";

export const businessReviewTasks = pgTable(
  "business_review_tasks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    identityKind: text("identity_kind", { enum: ["cid", "placeId"] }).notNull(),
    identityValue: text("identity_value").notNull(),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull(),
    depth: integer("depth").notNull(),
    sortBy: text("sort_by", {
      enum: ["newest", "highest_rating", "lowest_rating", "relevant"],
    }).notNull(),
    includeOtherSources: integer("include_other_sources").notNull(),
    state: text("state", { enum: reviewTaskStates }).notNull(),
    providerTaskId: text("provider_task_id"),
    approvedByUserId: text("approved_by_user_id"),
    approvedAt: text("approved_at"),
    pricingVersion: text("pricing_version"),
    approvalMode: text("approval_mode", { enum: ["hosted", "self_hosted"] }),
    approvedEstimateUsd: doublePrecision("approved_estimate_usd"),
    approvedEstimateCredits: integer("approved_estimate_credits"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("business_review_tasks_scope_idx").on(
      table.projectId,
      table.organizationId,
    ),
    uniqueIndex("business_review_tasks_provider_idx").on(table.providerTaskId),
  ],
);

export const businessReviewSnapshots = pgTable("business_review_snapshots", {
  taskId: text("task_id")
    .primaryKey()
    .references(() => businessReviewTasks.id, { onDelete: "cascade" }),
  payloadHash: text("payload_hash").notNull(),
  retrievedAt: text("retrieved_at").notNull(),
  providerObservedAt: text("provider_observed_at"),
  resultKind: text("result_kind", { enum: ["empty", "sample"] }).notNull(),
  title: text("title"),
  cid: text("cid"),
  placeId: text("place_id"),
  reportedReviewCount: integer("reported_review_count"),
  reportedItemsCount: integer("reported_items_count"),
  ratingValue: doublePrecision("rating_value"),
  ratingMax: doublePrecision("rating_max"),
  ratingType: text("rating_type"),
  rowCount: integer("row_count").notNull(),
});
export const businessReviewRows = pgTable(
  "business_review_rows",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => businessReviewSnapshots.taskId, {
        onDelete: "cascade",
      }),
    ordinal: integer("ordinal").notNull(),
    reviewId: text("review_id"),
    rank: doublePrecision("rank"),
    author: text("author"),
    text: text("text"),
    originalText: text("original_text"),
    language: text("language"),
    ratingValue: doublePrecision("rating_value"),
    ratingMax: doublePrecision("rating_max"),
    ratingType: text("rating_type"),
    timestamp: text("timestamp"),
    timeAgo: text("time_ago"),
    sourceTitle: text("source_title"),
    sourceDomain: text("source_domain"),
    reviewUrl: text("review_url"),
    ownerAnswer: text("owner_answer"),
    originalOwnerAnswer: text("original_owner_answer"),
    ownerTimestamp: text("owner_timestamp"),
    ownerTimeAgo: text("owner_time_ago"),
    replyState: text("reply_state", {
      enum: ["present", "absent", "unknown"],
    }).notNull(),
  },
  (table) => [
    uniqueIndex("business_review_rows_order_idx").on(
      table.taskId,
      table.ordinal,
    ),
  ],
);
