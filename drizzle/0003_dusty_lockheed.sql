CREATE TABLE `reader_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`legacy_local_claim_allowed` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reader_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`environment` text NOT NULL,
	`issuer` text NOT NULL,
	`subject` text NOT NULL,
	`email_snapshot` text,
	`linked_at` text NOT NULL,
	`last_seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reader_identities_environment_issuer_subject` ON `reader_identities` (`environment`,`issuer`,`subject`);--> statement-breakpoint
CREATE INDEX `idx_reader_identities_account` ON `reader_identities` (`account_id`);--> statement-breakpoint
PRAGMA optimize;
