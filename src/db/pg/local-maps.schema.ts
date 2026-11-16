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

export const mapsCampaigns = pgTable(
  "maps_campaigns",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    identityKind: text("identity_kind").notNull(),
    identityValue: text("identity_value").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("maps_campaigns_project_idx").on(
      table.projectId,
      table.organizationId,
    ),
  ],
);

export const mapsRuns = pgTable(
  "maps_runs",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => mapsCampaigns.id, { onDelete: "cascade" }),
    payloadHash: text("payload_hash").notNull(),
    scanRequestId: text("scan_request_id").references(
      () => mapsScanRequests.id,
      { onDelete: "no action" },
    ),
    provenance: text("provenance").notNull(),
    query: text("query").notNull(),
    languageCode: text("language_code").notNull(),
    source: text("source").notNull(),
    searchType: text("search_type").notNull(),
    device: text("device").notNull(),
    depth: integer("depth").notNull(),
    zoom: integer("zoom").notNull(),
    rankBasis: text("rank_basis").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("maps_runs_campaign_idx").on(table.campaignId, table.createdAt),
    uniqueIndex("maps_runs_scan_request_idx").on(table.scanRequestId),
  ],
);

export const mapsPoints = pgTable(
  "maps_points",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => mapsRuns.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    row: integer("row").notNull(),
    col: integer("col").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    status: text("status").notNull(),
    observedAt: text("observed_at"),
    retrievedAt: text("retrieved_at"),
    providerObservedAt: text("provider_observed_at"),
    returnedItems: integer("returned_items"),
    nonBusinessItems: integer("non_business_items"),
    coverage: text("coverage"),
    message: text("message"),
  },
  (table) => [
    uniqueIndex("maps_points_cell_idx").on(table.runId, table.row, table.col),
  ],
);

export const mapsResults = pgTable(
  "maps_results",
  {
    id: text("id").primaryKey(),
    ordinal: integer("ordinal").notNull(),
    pointId: text("point_id")
      .notNull()
      .references(() => mapsPoints.id, { onDelete: "cascade" }),
    title: text("title"),
    cid: text("cid"),
    placeId: text("place_id"),
    rank: integer("rank").notNull(),
    providerOrdinal: integer("provider_ordinal"),
    rankAbsolute: integer("rank_absolute"),
    rankGroup: integer("rank_group"),
  },
  (table) => [
    uniqueIndex("maps_results_order_idx").on(table.pointId, table.ordinal),
  ],
);

export const mapsScanRequests = pgTable(
  "maps_scan_requests",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => mapsCampaigns.id, { onDelete: "cascade" }),
    requestHash: text("request_hash").notNull(),
    identityKind: text("identity_kind", { enum: ["cid", "placeId"] }).notNull(),
    identityValue: text("identity_value").notNull(),
    query: text("query").notNull(),
    wireKeyword: text("wire_keyword").notNull(),
    languageCode: text("language_code").notNull(),
    source: text("source").notNull(),
    device: text("device", { enum: ["desktop", "mobile"] }).notNull(),
    os: text("os", { enum: ["windows", "android"] }).notNull(),
    depth: integer("depth").notNull(),
    zoom: integer("zoom").notNull(),
    rankBasis: text("rank_basis", { enum: ["absolute", "group"] }).notNull(),
    priority: integer("priority").notNull(),
    searchPlaces: integer("search_places").notNull(),
    searchThisArea: integer("search_this_area").notNull(),
    pointCount: integer("point_count").notNull(),
    state: text("state", { enum: ["prepared", "approved"] }).notNull(),
    approvedByUserId: text("approved_by_user_id"),
    approvedAt: text("approved_at"),
    pricingVersion: text("pricing_version"),
    approvalMode: text("approval_mode", { enum: ["hosted", "self_hosted"] }),
    approvedEstimateUsd: doublePrecision("approved_estimate_usd"),
    approvedEstimateCredits: integer("approved_estimate_credits"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("maps_scan_requests_campaign_idx").on(
      table.campaignId,
      table.createdAt,
    ),
  ],
);
export const mapsScanPoints = pgTable(
  "maps_scan_points",
  {
    id: text("id").primaryKey(),
    scanId: text("scan_id")
      .notNull()
      .references(() => mapsScanRequests.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    row: integer("row").notNull(),
    col: integer("col").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    locationCoordinate: text("location_coordinate").notNull(),
    tag: text("tag").notNull(),
    state: text("state", { enum: ["prepared", "submitting"] }).notNull(),
    claimId: text("claim_id"),
    claimedAt: text("claimed_at"),
  },
  (table) => [
    uniqueIndex("maps_scan_points_order_idx").on(table.scanId, table.ordinal),
    uniqueIndex("maps_scan_points_cell_idx").on(
      table.scanId,
      table.row,
      table.col,
    ),
    uniqueIndex("maps_scan_points_tag_idx").on(table.tag),
    uniqueIndex("maps_scan_points_claim_idx").on(table.claimId),
  ],
);

export const mapsSubmissionReceipts = pgTable(
  "maps_submission_receipts",
  {
    pointId: text("point_id")
      .primaryKey()
      .references(() => mapsScanPoints.id, { onDelete: "cascade" }),
    claimId: text("claim_id").notNull(),
    requestHash: text("request_hash").notNull(),
    payloadHash: text("payload_hash").notNull(),
    billingState: text("billing_state", {
      enum: ["confirmed", "uncertain"],
    }).notNull(),
    hasReceipt: integer("has_receipt").notNull(),
    candidateTaskId: text("candidate_task_id"),
    trustedTaskId: text("trusted_task_id"),
    requestTag: text("request_tag").notNull(),
    providerTag: text("provider_tag"),
    providerStatus: integer("provider_status"),
    providerCostUsd: doublePrecision("provider_cost_usd"),
    identityVerified: integer("identity_verified").notNull(),
    returnedTaskCount: integer("returned_task_count").notNull(),
    candidateCount: integer("candidate_count").notNull(),
    recordedAt: text("recorded_at").notNull(),
  },
  (table) => [
    uniqueIndex("maps_submission_receipts_task_idx").on(table.trustedTaskId),
  ],
);
export const mapsSubmissionCandidates = pgTable(
  "maps_submission_candidates",
  {
    id: text("id").primaryKey(),
    pointId: text("point_id")
      .notNull()
      .references(() => mapsSubmissionReceipts.pointId, {
        onDelete: "cascade",
      }),
    ordinal: integer("ordinal").notNull(),
    taskId: text("task_id").notNull(),
  },
  (table) => [
    uniqueIndex("maps_submission_candidates_order_idx").on(
      table.pointId,
      table.ordinal,
    ),
  ],
);
export const mapsPointObservations = pgTable("maps_point_observations", {
  pointId: text("point_id")
    .primaryKey()
    .references(() => mapsSubmissionReceipts.pointId, { onDelete: "cascade" }),
  taskId: text("task_id").notNull(),
  payloadHash: text("payload_hash").notNull(),
  receivedAt: text("received_at").notNull(),
  providerObservedAt: text("provider_observed_at"),
  resultKind: text("result_kind", { enum: ["empty", "sample"] }).notNull(),
  itemsCount: integer("items_count").notNull(),
  nonBusinessItemsCount: integer("non_business_items_count").notNull(),
  rowCount: integer("row_count").notNull(),
  itemTypeCount: integer("item_type_count").notNull(),
});
export const mapsObservationRows = pgTable(
  "maps_observation_rows",
  {
    id: text("id").primaryKey(),
    pointId: text("point_id")
      .notNull()
      .references(() => mapsPointObservations.pointId, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    title: text("title"),
    cid: text("cid"),
    placeId: text("place_id"),
    rank: integer("rank").notNull(),
    rankAbsolute: integer("rank_absolute"),
    rankGroup: integer("rank_group"),
  },
  (table) => [
    uniqueIndex("maps_observation_rows_order_idx").on(
      table.pointId,
      table.ordinal,
    ),
  ],
);
export const mapsObservationItemTypes = pgTable(
  "maps_observation_item_types",
  {
    id: text("id").primaryKey(),
    pointId: text("point_id")
      .notNull()
      .references(() => mapsPointObservations.pointId, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    type: text("type").notNull(),
  },
  (table) => [
    uniqueIndex("maps_observation_item_types_order_idx").on(
      table.pointId,
      table.ordinal,
    ),
  ],
);
