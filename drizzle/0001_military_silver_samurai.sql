CREATE TABLE `reader_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`label` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text,
	`revoked_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reader_devices_token_hash_unique` ON `reader_devices` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_reader_devices_user_created` ON `reader_devices` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `reader_books` ADD `content_hash` text;--> statement-breakpoint
ALTER TABLE `reading_progress` ADD `native_locator` text;