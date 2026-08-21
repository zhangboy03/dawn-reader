CREATE TABLE `reader_rate_limits` (
	`scope` text NOT NULL,
	`subject` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`scope`, `subject`, `window_start`)
);
--> statement-breakpoint
CREATE INDEX `idx_reader_rate_limits_updated` ON `reader_rate_limits` (`updated_at`);
