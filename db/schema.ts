import { index, primaryKey, sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

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
