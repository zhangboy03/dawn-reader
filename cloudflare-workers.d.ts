declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}

interface DawnReaderRuntimeEnv extends Record<string, unknown> {
  DB?: D1Database;
  BOOKS?: R2Bucket;
  DAWN_ENVIRONMENT?: "beta" | "public";
}

declare var __DAWN_READER_ENV__: DawnReaderRuntimeEnv | undefined;
