CREATE TABLE `maps_observation_item_types` (
	`id` text PRIMARY KEY NOT NULL,
	`point_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`type` text NOT NULL,
	FOREIGN KEY (`point_id`) REFERENCES `maps_point_observations`(`point_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `maps_observation_item_types_order_idx` ON `maps_observation_item_types` (`point_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `maps_observation_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`point_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`title` text,
	`cid` text,
	`place_id` text,
	`rank` integer NOT NULL,
	`rank_absolute` integer,
	`rank_group` integer,
	FOREIGN KEY (`point_id`) REFERENCES `maps_point_observations`(`point_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `maps_observation_rows_order_idx` ON `maps_observation_rows` (`point_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `maps_point_observations` (
	`point_id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`received_at` text NOT NULL,
	`provider_observed_at` text,
	`result_kind` text NOT NULL,
	`items_count` integer NOT NULL,
	`non_business_items_count` integer NOT NULL,
	`row_count` integer NOT NULL,
	`item_type_count` integer NOT NULL,
	FOREIGN KEY (`point_id`) REFERENCES `maps_submission_receipts`(`point_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `maps_submission_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`point_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`task_id` text NOT NULL,
	FOREIGN KEY (`point_id`) REFERENCES `maps_submission_receipts`(`point_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `maps_submission_candidates_order_idx` ON `maps_submission_candidates` (`point_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `maps_submission_receipts` (
	`point_id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`payload_hash` text NOT NULL,
	`billing_state` text NOT NULL,
	`has_receipt` integer NOT NULL,
	`candidate_task_id` text,
	`trusted_task_id` text,
	`request_tag` text NOT NULL,
	`provider_tag` text,
	`provider_status` integer,
	`provider_cost_usd` real,
	`identity_verified` integer NOT NULL,
	`returned_task_count` integer NOT NULL,
	`candidate_count` integer NOT NULL,
	`recorded_at` text NOT NULL,
	FOREIGN KEY (`point_id`) REFERENCES `maps_scan_points`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `maps_submission_receipts_task_idx` ON `maps_submission_receipts` (`trusted_task_id`);