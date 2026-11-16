CREATE TABLE `business_review_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`identity_kind` text NOT NULL,
	`identity_value` text NOT NULL,
	`location_code` integer NOT NULL,
	`language_code` text NOT NULL,
	`depth` integer NOT NULL,
	`sort_by` text NOT NULL,
	`include_other_sources` integer NOT NULL,
	`state` text NOT NULL,
	`provider_task_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `business_review_tasks_scope_idx` ON `business_review_tasks` (`project_id`,`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `business_review_tasks_provider_idx` ON `business_review_tasks` (`provider_task_id`);