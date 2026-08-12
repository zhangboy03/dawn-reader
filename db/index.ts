import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

function runtimeBinding<T>(name: string): T | undefined {
  const requestEnv = globalThis.__DAWN_READER_ENV__;
  return (requestEnv?.[name] ?? (env as unknown as Record<string, unknown>)[name]) as T | undefined;
}

let deletionSchemaBinding: D1Database | undefined;
let deletionSchemaReady: Promise<void> | undefined;

export function ensureDeletionSchema() {
  const binding = runtimeBinding<D1Database>("DB");
  if (!binding) throw new Error("Database binding is unavailable.");
  if (binding !== deletionSchemaBinding) {
    deletionSchemaBinding = binding;
    deletionSchemaReady = undefined;
  }
  deletionSchemaReady ??= binding.prepare(`
    CREATE TABLE IF NOT EXISTS reader_book_deletions (
      user_id TEXT NOT NULL,
      book_id TEXT NOT NULL,
      deleted_at TEXT NOT NULL,
      PRIMARY KEY (user_id, book_id)
    )
  `).run().then(() => undefined).catch((error) => {
    deletionSchemaReady = undefined;
    throw error;
  });
  return deletionSchemaReady;
}

export function getDb() {
  const binding = runtimeBinding<D1Database>("DB");
  if (!binding) throw new Error("Database binding is unavailable.");
  return drizzle(binding, { schema });
}

export function getBooksBucket() {
  const binding = runtimeBinding<R2Bucket>("BOOKS");
  if (!binding) throw new Error("Book storage binding is unavailable.");
  return binding;
}
