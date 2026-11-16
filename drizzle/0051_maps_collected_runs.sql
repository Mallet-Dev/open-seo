-- Rebuild the child table with foreign keys enabled and preserve existing rows.
CREATE TABLE `__new_maps_results` (
	`id` text PRIMARY KEY NOT NULL,
	`ordinal` integer NOT NULL,
	`point_id` text NOT NULL,
	`title` text,
	`cid` text,
	`place_id` text,
	`rank` integer NOT NULL,
	`provider_ordinal` integer,
	`rank_absolute` integer,
	`rank_group` integer,
	FOREIGN KEY (`point_id`) REFERENCES `maps_points`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_maps_results`("id", "ordinal", "point_id", "title", "cid", "place_id", "rank", "provider_ordinal", "rank_absolute", "rank_group") SELECT "id", "ordinal", "point_id", "title", "cid", "place_id", "rank", NULL, NULL, NULL FROM `maps_results`;--> statement-breakpoint
DROP TABLE `maps_results`;--> statement-breakpoint
ALTER TABLE `__new_maps_results` RENAME TO `maps_results`;--> statement-breakpoint
CREATE UNIQUE INDEX `maps_results_order_idx` ON `maps_results` (`point_id`,`ordinal`);--> statement-breakpoint
ALTER TABLE `maps_points` ADD `retrieved_at` text;--> statement-breakpoint
ALTER TABLE `maps_points` ADD `provider_observed_at` text;--> statement-breakpoint
ALTER TABLE `maps_points` ADD `returned_items` integer;--> statement-breakpoint
ALTER TABLE `maps_points` ADD `non_business_items` integer;--> statement-breakpoint
ALTER TABLE `maps_runs` ADD `scan_request_id` text REFERENCES maps_scan_requests(id);--> statement-breakpoint
CREATE UNIQUE INDEX `maps_runs_scan_request_idx` ON `maps_runs` (`scan_request_id`);