CREATE TABLE "project_search_history" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"feature" text NOT NULL,
	"search_key" text NOT NULL,
	"item_json" text NOT NULL,
	"searched_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_search_history" ADD CONSTRAINT "project_search_history_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_search_history_unique" ON "project_search_history" USING btree ("project_id","feature","search_key");--> statement-breakpoint
CREATE INDEX "project_search_history_recent_idx" ON "project_search_history" USING btree ("project_id","feature","searched_at");