CREATE TABLE `reader_book_deletions` (
	`user_id` text NOT NULL,
	`book_id` text NOT NULL,
	`deleted_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `book_id`)
);
