CREATE TABLE `maps_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`identity_kind` text NOT NULL,
	`identity_value` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `maps_campaigns_project_idx` ON `maps_campaigns` (`project_id`,`organization_id`);--> statement-breakpoint
CREATE TABLE `maps_points` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`row` integer NOT NULL,
	`col` integer NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`status` text NOT NULL,
	`observed_at` text,
	`coverage` text,
	`message` text,
	FOREIGN KEY (`run_id`) REFERENCES `maps_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `maps_points_cell_idx` ON `maps_points` (`run_id`,`row`,`col`);--> statement-breakpoint
CREATE TABLE `maps_results` (
	`id` text PRIMARY KEY NOT NULL,
	`ordinal` integer NOT NULL,
	`point_id` text NOT NULL,
	`title` text NOT NULL,
	`cid` text,
	`place_id` text,
	`rank` integer NOT NULL,
	FOREIGN KEY (`point_id`) REFERENCES `maps_points`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `maps_results_rank_idx` ON `maps_results` (`point_id`,`rank`);--> statement-breakpoint
CREATE TABLE `maps_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`provenance` text NOT NULL,
	`query` text NOT NULL,
	`language_code` text NOT NULL,
	`source` text NOT NULL,
	`search_type` text NOT NULL,
	`device` text NOT NULL,
	`depth` integer NOT NULL,
	`zoom` integer NOT NULL,
	`rank_basis` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `maps_campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `maps_runs_campaign_idx` ON `maps_runs` (`campaign_id`,`created_at`);