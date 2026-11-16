CREATE TABLE "gsc_retained_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"payload_hash" text NOT NULL,
	"site_url" text NOT NULL,
	"provider" text NOT NULL,
	"search_type" text NOT NULL,
	"aggregation" text NOT NULL,
	"dimensions" text NOT NULL,
	"evidence" text NOT NULL,
	"expected_revision" integer NOT NULL,
	"published_revision" integer,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"source_name" text NOT NULL,
	"source_digest" text NOT NULL,
	"collected_at" text,
	"complete" integer,
	"row_count" integer NOT NULL,
	"imported_by_user_id" text NOT NULL,
	"imported_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gsc_retained_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"payload_hash" text NOT NULL,
	"expected_revision" integer NOT NULL,
	"published_revision" integer,
	"journal" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gsc_retained_rows" (
	"id" text PRIMARY KEY NOT NULL,
	"import_id" text NOT NULL,
	"date" text NOT NULL,
	"query" text NOT NULL,
	"page" text NOT NULL,
	"device" text NOT NULL,
	"country" text NOT NULL,
	"clicks" double precision NOT NULL,
	"impressions" double precision NOT NULL,
	"position" double precision
);
--> statement-breakpoint
CREATE TABLE "gsc_retained_sources" (
	"project_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"site_url" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"last_import_id" text,
	"notes_revision" integer DEFAULT 0 NOT NULL,
	"last_notes_id" text
);
--> statement-breakpoint
CREATE TABLE "gsc_retained_targets" (
	"id" text PRIMARY KEY NOT NULL,
	"notes_id" text NOT NULL,
	"query" text NOT NULL,
	"label" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gsc_retained_imports" ADD CONSTRAINT "gsc_retained_imports_project_id_gsc_retained_sources_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."gsc_retained_sources"("project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_retained_imports" ADD CONSTRAINT "gsc_retained_imports_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_retained_notes" ADD CONSTRAINT "gsc_retained_notes_project_id_gsc_retained_sources_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."gsc_retained_sources"("project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_retained_notes" ADD CONSTRAINT "gsc_retained_notes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_retained_rows" ADD CONSTRAINT "gsc_retained_rows_import_id_gsc_retained_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."gsc_retained_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_retained_sources" ADD CONSTRAINT "gsc_retained_sources_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_retained_sources" ADD CONSTRAINT "gsc_retained_sources_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_retained_targets" ADD CONSTRAINT "gsc_retained_targets_notes_id_gsc_retained_notes_id_fk" FOREIGN KEY ("notes_id") REFERENCES "public"."gsc_retained_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gsc_retained_imports_project_idx" ON "gsc_retained_imports" USING btree ("project_id","published_revision");--> statement-breakpoint
CREATE INDEX "gsc_retained_notes_project_idx" ON "gsc_retained_notes" USING btree ("project_id","published_revision");--> statement-breakpoint
CREATE INDEX "gsc_retained_rows_import_idx" ON "gsc_retained_rows" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "gsc_retained_targets_notes_idx" ON "gsc_retained_targets" USING btree ("notes_id");