CREATE TABLE `backlink_refresh_attempts` (
	`project_id` text NOT NULL,
	`domain` text NOT NULL,
	`attempted_at` text NOT NULL,
	PRIMARY KEY(`project_id`, `domain`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
