ALTER TABLE "business_review_tasks" ADD COLUMN "approved_by_user_id" text;--> statement-breakpoint
ALTER TABLE "business_review_tasks" ADD COLUMN "approved_at" text;--> statement-breakpoint
ALTER TABLE "business_review_tasks" ADD COLUMN "pricing_version" text;--> statement-breakpoint
ALTER TABLE "business_review_tasks" ADD COLUMN "approval_mode" text;--> statement-breakpoint
ALTER TABLE "business_review_tasks" ADD COLUMN "approved_estimate_usd" double precision;--> statement-breakpoint
ALTER TABLE "business_review_tasks" ADD COLUMN "approved_estimate_credits" integer;