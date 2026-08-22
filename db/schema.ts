import { index, primaryKey, sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

export const readerAccounts = sqliteTable("reader_accounts", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("active"),
  role: text("role").notNull().default("reader"),
  displayName: text("display_name"),
  contactEmail: text("contact_email"),
  authEpoch: integer("auth_epoch").notNull().default(0),
  legacyLocalClaimAllowed: integer("legacy_local_claim_allowed", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const readerInvites = sqliteTable("reader_invites", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  purpose: text("purpose").notNull().default("enroll"),
  tokenFingerprint: text("token_fingerprint").notNull().unique(),
  tokenKeyVersion: integer("token_key_version").notNull().default(1),
  expiresAt: text("expires_at").notNull(),
  consumedAt: text("consumed_at"),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at").notNull(),
  createdByAccountId: text("created_by_account_id").notNull(),
}, (table) => [
  index("idx_reader_invites_account_created").on(table.accountId, table.createdAt),
]);

export const readerSessions = sqliteTable("reader_sessions", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  secretFingerprint: text("secret_fingerprint").notNull().unique(),
  secretKeyVersion: integer("secret_key_version").notNull().default(1),
  authEpoch: integer("auth_epoch").notNull(),
  createdAt: text("created_at").notNull(),
  lastUsedAt: text("last_used_at").notNull(),
  idleExpiresAt: text("idle_expires_at").notNull(),
  absoluteExpiresAt: text("absolute_expires_at").notNull(),
  revokedAt: text("revoked_at"),
  revokeReason: text("revoke_reason"),
  label: text("label"),
}, (table) => [
  index("idx_reader_sessions_account_created").on(table.accountId, table.createdAt),
]);

export const readerAuthRateLimits = sqliteTable("reader_auth_rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStartedAt: text("window_started_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const readerIdentities = sqliteTable("reader_identities", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  environment: text("environment").notNull(),
  issuer: text("issuer").notNull(),
  subject: text("subject").notNull(),
  emailSnapshot: text("email_snapshot"),
  linkedAt: text("linked_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
}, (table) => [
  uniqueIndex("idx_reader_identities_environment_issuer_subject")
    .on(table.environment, table.issuer, table.subject),
  index("idx_reader_identities_account").on(table.accountId),
]);

export const readerBooks = sqliteTable("reader_books", {
  userId: text("user_id").notNull(),
  id: text("id").notNull(),
  title: text("title").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  contentHash: text("content_hash"),
  addedAt: text("added_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.id] }),
  index("idx_reader_books_user_updated").on(table.userId, table.updatedAt),
]);

export const readingProgress = sqliteTable("reading_progress", {
  userId: text("user_id").notNull(),
  bookId: text("book_id").notNull(),
  cfi: text("cfi"),
  nativeLocator: text("native_locator"),
  percentage: integer("percentage").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.bookId] }),
]);

export const readerBookDeletions = sqliteTable("reader_book_deletions", {
  userId: text("user_id").notNull(),
  bookId: text("book_id").notNull(),
  deletedAt: text("deleted_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.bookId] }),
]);

export const readerState = sqliteTable("reader_state", {
  userId: text("user_id").primaryKey(),
  profileJson: text("profile_json"),
  settingsJson: text("settings_json"),
  updatedAt: text("updated_at").notNull(),
});

export const readerDevices = sqliteTable("reader_devices", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  label: text("label").notNull(),
  createdAt: text("created_at").notNull(),
  lastUsedAt: text("last_used_at"),
  revokedAt: text("revoked_at"),
}, (table) => [
  index("idx_reader_devices_user_created").on(table.userId, table.createdAt),
]);
