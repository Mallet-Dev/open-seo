CREATE TABLE "maps_observation_item_types" (
	"id" text PRIMARY KEY NOT NULL,
	"point_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"type" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maps_observation_rows" (
	"id" text PRIMARY KEY NOT NULL,
	"point_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"title" text,
	"cid" text,
	"place_id" text,
	"rank" integer NOT NULL,
	"rank_absolute" integer,
	"rank_group" integer
);
--> statement-breakpoint
CREATE TABLE "maps_point_observations" (
	"point_id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"payload_hash" text NOT NULL,
	"received_at" text NOT NULL,
	"provider_observed_at" text,
	"result_kind" text NOT NULL,
	"items_count" integer NOT NULL,
	"non_business_items_count" integer NOT NULL,
	"row_count" integer NOT NULL,
	"item_type_count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maps_submission_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"point_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"task_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maps_submission_receipts" (
	"point_id" text PRIMARY KEY NOT NULL,
	"claim_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"payload_hash" text NOT NULL,
	"billing_state" text NOT NULL,
	"has_receipt" integer NOT NULL,
	"candidate_task_id" text,
	"trusted_task_id" text,
	"request_tag" text NOT NULL,
	"provider_tag" text,
	"provider_status" integer,
	"provider_cost_usd" double precision,
	"identity_verified" integer NOT NULL,
	"returned_task_count" integer NOT NULL,
	"candidate_count" integer NOT NULL,
	"recorded_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "maps_observation_item_types" ADD CONSTRAINT "maps_observation_item_types_point_id_maps_point_observations_point_id_fk" FOREIGN KEY ("point_id") REFERENCES "public"."maps_point_observations"("point_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maps_observation_rows" ADD CONSTRAINT "maps_observation_rows_point_id_maps_point_observations_point_id_fk" FOREIGN KEY ("point_id") REFERENCES "public"."maps_point_observations"("point_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maps_point_observations" ADD CONSTRAINT "maps_point_observations_point_id_maps_submission_receipts_point_id_fk" FOREIGN KEY ("point_id") REFERENCES "public"."maps_submission_receipts"("point_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maps_submission_candidates" ADD CONSTRAINT "maps_submission_candidates_point_id_maps_submission_receipts_point_id_fk" FOREIGN KEY ("point_id") REFERENCES "public"."maps_submission_receipts"("point_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maps_submission_receipts" ADD CONSTRAINT "maps_submission_receipts_point_id_maps_scan_points_id_fk" FOREIGN KEY ("point_id") REFERENCES "public"."maps_scan_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "maps_observation_item_types_order_idx" ON "maps_observation_item_types" USING btree ("point_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "maps_observation_rows_order_idx" ON "maps_observation_rows" USING btree ("point_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "maps_submission_candidates_order_idx" ON "maps_submission_candidates" USING btree ("point_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "maps_submission_receipts_task_idx" ON "maps_submission_receipts" USING btree ("trusted_task_id");