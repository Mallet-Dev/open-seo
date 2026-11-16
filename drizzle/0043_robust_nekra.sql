CREATE TABLE `project_search_history` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`feature` text NOT NULL,
	`search_key` text NOT NULL,
	`item_json` text NOT NULL,
	`searched_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_search_history_unique` ON `project_search_history` (`project_id`,`feature`,`search_key`);--> statement-breakpoint
CREATE INDEX `project_search_history_recent_idx` ON `project_search_history` (`project_id`,`feature`,`searched_at`);