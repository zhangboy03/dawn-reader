CREATE TABLE `reader_books` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`title` text NOT NULL,
	`file_name` text NOT NULL,
	`file_size` integer NOT NULL,
	`added_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `idx_reader_books_user_updated` ON `reader_books` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `reader_state` (
	`user_id` text PRIMARY KEY NOT NULL,
	`profile_json` text,
	`settings_json` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reading_progress` (
	`user_id` text NOT NULL,
	`book_id` text NOT NULL,
	`cfi` text,
	`percentage` integer NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `book_id`)
);
--> statement-breakpoint
PRAGMA optimize;
