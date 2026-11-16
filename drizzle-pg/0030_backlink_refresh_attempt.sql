CREATE TABLE "backlink_refresh_attempts" (
	"project_id" text NOT NULL,
	"domain" text NOT NULL,
	"attempted_at" text NOT NULL,
	CONSTRAINT "backlink_refresh_attempts_project_id_domain_pk" PRIMARY KEY("project_id","domain")
);
--> statement-breakpoint
ALTER TABLE "backlink_refresh_attempts" ADD CONSTRAINT "backlink_refresh_attempts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;