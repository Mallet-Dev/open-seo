CREATE TABLE "maps_scan_points" (
	"id" text PRIMARY KEY NOT NULL,
	"scan_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"row" integer NOT NULL,
	"col" integer NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"location_coordinate" text NOT NULL,
	"tag" text NOT NULL,
	"state" text NOT NULL,
	"claim_id" text,
	"claimed_at" text
);
--> statement-breakpoint
CREATE TABLE "maps_scan_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"identity_kind" text NOT NULL,
	"identity_value" text NOT NULL,
	"query" text NOT NULL,
	"wire_keyword" text NOT NULL,
	"language_code" text NOT NULL,
	"source" text NOT NULL,
	"device" text NOT NULL,
	"os" text NOT NULL,
	"depth" integer NOT NULL,
	"zoom" integer NOT NULL,
	"rank_basis" text NOT NULL,
	"priority" integer NOT NULL,
	"search_places" integer NOT NULL,
	"search_this_area" integer NOT NULL,
	"point_count" integer NOT NULL,
	"state" text NOT NULL,
	"approved_by_user_id" text,
	"approved_at" text,
	"pricing_version" text,
	"approval_mode" text,
	"approved_estimate_usd" double precision,
	"approved_estimate_credits" integer,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "maps_scan_points" ADD CONSTRAINT "maps_scan_points_scan_id_maps_scan_requests_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."maps_scan_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maps_scan_requests" ADD CONSTRAINT "maps_scan_requests_campaign_id_maps_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."maps_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "maps_scan_points_order_idx" ON "maps_scan_points" USING btree ("scan_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "maps_scan_points_cell_idx" ON "maps_scan_points" USING btree ("scan_id","row","col");--> statement-breakpoint
CREATE UNIQUE INDEX "maps_scan_points_tag_idx" ON "maps_scan_points" USING btree ("tag");--> statement-breakpoint
CREATE UNIQUE INDEX "maps_scan_points_claim_idx" ON "maps_scan_points" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "maps_scan_requests_campaign_idx" ON "maps_scan_requests" USING btree ("campaign_id","created_at");