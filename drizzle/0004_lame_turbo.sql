CREATE TABLE `reader_auth_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`window_started_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reader_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`purpose` text DEFAULT 'enroll' NOT NULL,
	`token_fingerprint` text NOT NULL,
	`token_key_version` integer DEFAULT 1 NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	`created_by_account_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reader_invites_token_fingerprint_unique` ON `reader_invites` (`token_fingerprint`);--> statement-breakpoint
CREATE INDEX `idx_reader_invites_account_created` ON `reader_invites` (`account_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `reader_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`secret_fingerprint` text NOT NULL,
	`secret_key_version` integer DEFAULT 1 NOT NULL,
	`auth_epoch` integer NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text NOT NULL,
	`idle_expires_at` text NOT NULL,
	`absolute_expires_at` text NOT NULL,
	`revoked_at` text,
	`revoke_reason` text,
	`label` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reader_sessions_secret_fingerprint_unique` ON `reader_sessions` (`secret_fingerprint`);--> statement-breakpoint
CREATE INDEX `idx_reader_sessions_account_created` ON `reader_sessions` (`account_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `reader_accounts` ADD `role` text DEFAULT 'reader' NOT NULL;--> statement-breakpoint
ALTER TABLE `reader_accounts` ADD `display_name` text;--> statement-breakpoint
ALTER TABLE `reader_accounts` ADD `contact_email` text;--> statement-breakpoint
ALTER TABLE `reader_accounts` ADD `auth_epoch` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `reader_accounts`
SET `role` = 'owner'
WHERE `id` = (
	SELECT `id` FROM `reader_accounts`
	ORDER BY `created_at` ASC
	LIMIT 1
);--> statement-breakpoint
PRAGMA optimize;
