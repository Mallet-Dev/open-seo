CREATE TABLE "maps_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"identity_kind" text NOT NULL,
	"identity_value" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maps_points" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"row" integer NOT NULL,
	"col" integer NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"status" text NOT NULL,
	"observed_at" text,
	"coverage" text,
	"message" text
);
--> statement-breakpoint
CREATE TABLE "maps_results" (
	"id" text PRIMARY KEY NOT NULL,
	"ordinal" integer NOT NULL,
	"point_id" text NOT NULL,
	"title" text NOT NULL,
	"cid" text,
	"place_id" text,
	"rank" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maps_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"payload_hash" text NOT NULL,
	"provenance" text NOT NULL,
	"query" text NOT NULL,
	"language_code" text NOT NULL,
	"source" text NOT NULL,
	"search_type" text NOT NULL,
	"device" text NOT NULL,
	"depth" integer NOT NULL,
	"zoom" integer NOT NULL,
	"rank_basis" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "maps_campaigns" ADD CONSTRAINT "maps_campaigns_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maps_campaigns" ADD CONSTRAINT "maps_campaigns_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maps_points" ADD CONSTRAINT "maps_points_run_id_maps_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."maps_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maps_results" ADD CONSTRAINT "maps_results_point_id_maps_points_id_fk" FOREIGN KEY ("point_id") REFERENCES "public"."maps_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maps_runs" ADD CONSTRAINT "maps_runs_campaign_id_maps_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."maps_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "maps_campaigns_project_idx" ON "maps_campaigns" USING btree ("project_id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "maps_points_cell_idx" ON "maps_points" USING btree ("run_id","row","col");--> statement-breakpoint
CREATE UNIQUE INDEX "maps_results_rank_idx" ON "maps_results" USING btree ("point_id","rank");--> statement-breakpoint
CREATE INDEX "maps_runs_campaign_idx" ON "maps_runs" USING btree ("campaign_id","created_at");