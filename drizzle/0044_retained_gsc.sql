CREATE TABLE `gsc_retained_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`site_url` text NOT NULL,
	`provider` text NOT NULL,
	`search_type` text NOT NULL,
	`aggregation` text NOT NULL,
	`dimensions` text NOT NULL,
	`evidence` text NOT NULL,
	`expected_revision` integer NOT NULL,
	`published_revision` integer,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`source_name` text NOT NULL,
	`source_digest` text NOT NULL,
	`collected_at` text,
	`complete` integer,
	`row_count` integer NOT NULL,
	`imported_by_user_id` text NOT NULL,
	`imported_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `gsc_retained_sources`(`project_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gsc_retained_imports_project_idx` ON `gsc_retained_imports` (`project_id`,`published_revision`);--> statement-breakpoint
CREATE TABLE `gsc_retained_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`expected_revision` integer NOT NULL,
	`published_revision` integer,
	`journal` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `gsc_retained_sources`(`project_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gsc_retained_notes_project_idx` ON `gsc_retained_notes` (`project_id`,`published_revision`);--> statement-breakpoint
CREATE TABLE `gsc_retained_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`import_id` text NOT NULL,
	`date` text NOT NULL,
	`query` text NOT NULL,
	`page` text NOT NULL,
	`device` text NOT NULL,
	`country` text NOT NULL,
	`clicks` real NOT NULL,
	`impressions` real NOT NULL,
	`position` real,
	FOREIGN KEY (`import_id`) REFERENCES `gsc_retained_imports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gsc_retained_rows_import_idx` ON `gsc_retained_rows` (`import_id`);--> statement-breakpoint
CREATE TABLE `gsc_retained_sources` (
	`project_id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`site_url` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`last_import_id` text,
	`notes_revision` integer DEFAULT 0 NOT NULL,
	`last_notes_id` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `gsc_retained_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`notes_id` text NOT NULL,
	`query` text NOT NULL,
	`label` text NOT NULL,
	FOREIGN KEY (`notes_id`) REFERENCES `gsc_retained_notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gsc_retained_targets_notes_idx` ON `gsc_retained_targets` (`notes_id`);