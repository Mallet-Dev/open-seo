DROP INDEX "maps_results_rank_idx";--> statement-breakpoint
ALTER TABLE "maps_results" ALTER COLUMN "title" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "maps_points" ADD COLUMN "retrieved_at" text;--> statement-breakpoint
ALTER TABLE "maps_points" ADD COLUMN "provider_observed_at" text;--> statement-breakpoint
ALTER TABLE "maps_points" ADD COLUMN "returned_items" integer;--> statement-breakpoint
ALTER TABLE "maps_points" ADD COLUMN "non_business_items" integer;--> statement-breakpoint
ALTER TABLE "maps_results" ADD COLUMN "provider_ordinal" integer;--> statement-breakpoint
ALTER TABLE "maps_results" ADD COLUMN "rank_absolute" integer;--> statement-breakpoint
ALTER TABLE "maps_results" ADD COLUMN "rank_group" integer;--> statement-breakpoint
ALTER TABLE "maps_runs" ADD COLUMN "scan_request_id" text;--> statement-breakpoint
ALTER TABLE "maps_runs" ADD CONSTRAINT "maps_runs_scan_request_id_maps_scan_requests_id_fk" FOREIGN KEY ("scan_request_id") REFERENCES "public"."maps_scan_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "maps_results_order_idx" ON "maps_results" USING btree ("point_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "maps_runs_scan_request_idx" ON "maps_runs" USING btree ("scan_request_id");