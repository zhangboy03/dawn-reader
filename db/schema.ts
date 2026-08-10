import { index, primaryKey, sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const readerBooks = sqliteTable("reader_books", {
  userId: text("user_id").notNull(),
  id: text("id").notNull(),
  title: text("title").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
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
