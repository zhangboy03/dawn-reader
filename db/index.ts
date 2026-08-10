import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

function runtimeBinding<T>(name: string): T | undefined {
  const requestEnv = globalThis.__DAWN_READER_ENV__;
  return (requestEnv?.[name] ?? (env as unknown as Record<string, unknown>)[name]) as T | undefined;
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
