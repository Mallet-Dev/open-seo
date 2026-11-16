CREATE TABLE "business_review_rows" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"review_id" text,
	"rank" double precision,
	"author" text,
	"text" text,
	"original_text" text,
	"language" text,
	"rating_value" double precision,
	"rating_max" double precision,
	"rating_type" text,
	"timestamp" text,
	"time_ago" text,
	"source_title" text,
	"source_domain" text,
	"review_url" text,
	"owner_answer" text,
	"original_owner_answer" text,
	"owner_timestamp" text,
	"owner_time_ago" text,
	"reply_state" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_review_snapshots" (
	"task_id" text PRIMARY KEY NOT NULL,
	"payload_hash" text NOT NULL,
	"retrieved_at" text NOT NULL,
	"provider_observed_at" text,
	"result_kind" text NOT NULL,
	"title" text,
	"cid" text,
	"place_id" text,
	"reported_review_count" integer,
	"reported_items_count" integer,
	"rating_value" double precision,
	"rating_max" double precision,
	"rating_type" text,
	"row_count" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_review_rows" ADD CONSTRAINT "business_review_rows_task_id_business_review_snapshots_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."business_review_snapshots"("task_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_review_snapshots" ADD CONSTRAINT "business_review_snapshots_task_id_business_review_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."business_review_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "business_review_rows_order_idx" ON "business_review_rows" USING btree ("task_id","ordinal");